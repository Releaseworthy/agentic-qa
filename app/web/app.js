// ShopLite single-page UI: hash routes, no build step. Talks to /api only.
'use strict';

const TOKEN_KEY = 'shoplite.token';
const view = document.getElementById('view');
const toast = document.getElementById('toast');

const money = (cents) => `$${(cents / 100).toFixed(2)}`;
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function token() {
  return localStorage.getItem(TOKEN_KEY);
}

async function api(method, path, data) {
  const headers = { 'content-type': 'application/json' };
  if (token()) headers.authorization = `Bearer ${token()}`;
  const res = await fetch(path, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) });
  if (res.status === 204) return null;
  const body = await res.json();
  if (!res.ok) {
    if (res.status === 401 && token()) signOut(false);
    const err = new Error(body.error?.message ?? `HTTP ${res.status}`);
    err.code = body.error?.code;
    throw err;
  }
  return body;
}

function notify(message) {
  toast.textContent = message;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => (toast.textContent = ''), 3000);
}

function showError(container, err) {
  container.innerHTML = `<p role="alert" class="error">${esc(err.message)}</p>`;
}

function signOut(callApi = true) {
  if (callApi && token()) api('POST', '/api/auth/logout').catch(() => {});
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('shoplite.user');
  refreshChrome();
  location.hash = '#/login';
}
document.getElementById('logout').addEventListener('click', () => signOut());

async function refreshChrome() {
  const signedIn = Boolean(token());
  for (const el of document.querySelectorAll('[data-auth]'))
    el.hidden = el.dataset.auth === 'in' ? !signedIn : signedIn;
  document.getElementById('user-name').textContent = signedIn ? (localStorage.getItem('shoplite.user') ?? '') : '';
  let count = 0;
  if (signedIn) {
    try {
      const cart = await api('GET', '/api/cart');
      count = cart.items.reduce((n, i) => n + i.quantity, 0);
    } catch {
      count = 0;
    }
  }
  document.getElementById('cart-count').textContent = String(count);
}

function requireLogin() {
  if (token()) return true;
  location.hash = `#/login?next=${encodeURIComponent(location.hash.slice(1))}`;
  return false;
}

// ---- views ---------------------------------------------------------------

async function catalogView(params) {
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const sort = params.get('sort') ?? 'name';
  view.innerHTML = `
    <h1>Catalog</h1>
    <form class="filters" id="filters" role="search">
      <label>Search <input name="q" type="search" value="${esc(q)}" /></label>
      <label>Category
        <select name="category">
          <option value="">All</option>
          ${['books', 'electronics', 'home', 'toys']
            .map(
              (c) =>
                `<option value="${c}" ${c === category ? 'selected' : ''}>${c[0].toUpperCase() + c.slice(1)}</option>`,
            )
            .join('')}
        </select>
      </label>
      <label>Sort
        <select name="sort">
          <option value="name" ${sort === 'name' ? 'selected' : ''}>Name</option>
          <option value="price_asc" ${sort === 'price_asc' ? 'selected' : ''}>Price: low to high</option>
          <option value="price_desc" ${sort === 'price_desc' ? 'selected' : ''}>Price: high to low</option>
        </select>
      </label>
      <button type="submit">Apply</button>
    </form>
    <p id="result-count" class="muted"></p>
    <section class="grid" id="products" aria-label="Products"></section>`;
  document.getElementById('filters').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const next = new URLSearchParams();
    for (const [k, v] of f) if (v) next.set(k, String(v));
    location.hash = `#/?${next}`;
  });
  const query = new URLSearchParams({ sort });
  if (q) query.set('q', q);
  if (category) query.set('category', category);
  const list = document.getElementById('products');
  try {
    const { items, count } = await api('GET', `/api/products?${query}`);
    document.getElementById('result-count').textContent = `${count} product${count === 1 ? '' : 's'}`;
    list.innerHTML = items.length
      ? items
          .map(
            (p) => `
        <article class="card" aria-label="${esc(p.name)}">
          <h2><a href="#/product/${esc(p.id)}">${esc(p.name)}</a></h2>
          <p class="muted">${esc(p.category)}</p>
          <p class="price">${money(p.priceCents)}</p>
        </article>`,
          )
          .join('')
      : '<p>No products match your search.</p>';
  } catch (err) {
    showError(list, err);
  }
}

async function productView(id) {
  try {
    const p = await api('GET', `/api/products/${encodeURIComponent(id)}`);
    view.innerHTML = `
      <article class="card">
        <h1>${esc(p.name)}</h1>
        <p>${esc(p.description)}</p>
        <p class="price" aria-label="Price">${money(p.priceCents)}</p>
        <p class="muted" id="stock">${p.stock > 0 ? `${p.stock} in stock` : 'Out of stock'}</p>
        <form id="add" class="filters">
          <label>Quantity <input name="quantity" type="number" min="1" max="10" value="1" /></label>
          <button type="submit" ${p.stock > 0 ? '' : 'disabled'}>Add to cart</button>
        </form>
        <div id="add-result"></div>
      </article>`;
    document.getElementById('add').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!requireLogin()) return;
      const quantity = Number(new FormData(e.target).get('quantity'));
      const out = document.getElementById('add-result');
      try {
        await api('POST', '/api/cart/items', { productId: p.id, quantity });
        out.innerHTML = '';
        notify(`Added ${quantity} × ${p.name} to the cart`);
        refreshChrome();
      } catch (err) {
        showError(out, err);
      }
    });
  } catch (err) {
    showError(view, err);
  }
}

function totalsHtml(t) {
  return `
    <div class="totals" aria-label="Order totals">
      <div><span>Subtotal</span><span data-total="subtotal">${money(t.subtotalCents)}</span></div>
      <div><span>Discount</span><span data-total="discount">-${money(t.discountCents)}</span></div>
      <div><span>Shipping</span><span data-total="shipping">${t.shippingCents === 0 ? 'Free' : money(t.shippingCents)}</span></div>
      <div><strong>Total</strong><strong data-total="total">${money(t.totalCents)}</strong></div>
    </div>`;
}

async function cartView() {
  if (!requireLogin()) return;
  let cart;
  try {
    cart = await api('GET', '/api/cart');
  } catch (err) {
    return showError(view, err);
  }
  if (cart.items.length === 0) {
    view.innerHTML = '<h1>Your cart</h1><p>Your cart is empty.</p><a href="#/">Browse the catalog</a>';
    return;
  }
  view.innerHTML = `
    <h1>Your cart</h1>
    <table aria-label="Cart">
      <thead><tr><th>Product</th><th>Price</th><th>Quantity</th><th>Line total</th><th></th></tr></thead>
      <tbody>
        ${cart.items
          .map(
            (i) => `
          <tr data-product-id="${esc(i.productId)}">
            <td>${esc(i.name)}</td>
            <td>${money(i.unitPriceCents)}</td>
            <td><input type="number" min="0" max="10" value="${i.quantity}" aria-label="Quantity of ${esc(i.name)}" /></td>
            <td>${money(i.lineTotalCents)}</td>
            <td><button type="button" class="secondary" data-remove aria-label="Remove ${esc(i.name)}">Remove</button></td>
          </tr>`,
          )
          .join('')}
      </tbody>
    </table>
    <div id="cart-error"></div>
    <form id="coupon" class="filters">
      <label>Coupon code <input name="code" value="${esc(cart.couponCode ?? '')}" /></label>
      <button type="submit">Apply coupon</button>
      ${cart.couponCode ? '<button type="button" class="secondary" id="remove-coupon">Remove coupon</button>' : ''}
    </form>
    <p id="applied-coupon">${cart.couponCode ? `Coupon ${esc(cart.couponCode)} applied` : ''}</p>
    ${totalsHtml(cart)}
    <p><a href="#/checkout">Proceed to checkout</a></p>`;

  const errorBox = document.getElementById('cart-error');
  for (const row of view.querySelectorAll('tbody tr')) {
    const productId = row.dataset.productId;
    row.querySelector('input').addEventListener('change', async (e) => {
      try {
        await api('PATCH', `/api/cart/items/${encodeURIComponent(productId)}`, { quantity: Number(e.target.value) });
        await cartView();
        refreshChrome();
      } catch (err) {
        showError(errorBox, err);
      }
    });
    row.querySelector('[data-remove]').addEventListener('click', async () => {
      await api('DELETE', `/api/cart/items/${encodeURIComponent(productId)}`);
      await cartView();
      refreshChrome();
    });
  }
  document.getElementById('coupon').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('POST', '/api/cart/coupon', { code: String(new FormData(e.target).get('code')) });
      await cartView();
    } catch (err) {
      showError(errorBox, err);
    }
  });
  document.getElementById('remove-coupon')?.addEventListener('click', async () => {
    await api('DELETE', '/api/cart/coupon');
    await cartView();
  });
}

async function checkoutView() {
  if (!requireLogin()) return;
  const cart = await api('GET', '/api/cart');
  if (cart.items.length === 0) {
    view.innerHTML = '<h1>Checkout</h1><p>Your cart is empty.</p>';
    return;
  }
  view.innerHTML = `
    <h1>Checkout</h1>
    ${totalsHtml(cart)}
    <form id="checkout" class="stack" novalidate>
      <fieldset class="stack"><legend>Shipping address</legend>
        <label>Full name <input name="name" autocomplete="name" /></label>
        <label>Address <input name="line1" autocomplete="address-line1" /></label>
        <label>City <input name="city" autocomplete="address-level2" /></label>
        <label>Postal code <input name="postalCode" autocomplete="postal-code" /></label>
        <label>Country <input name="country" maxlength="2" placeholder="US" /></label>
      </fieldset>
      <fieldset class="stack"><legend>Payment</legend>
        <label>Card number <input name="cardNumber" inputmode="numeric" autocomplete="cc-number" /></label>
        <label>Expiry (MM/YY) <input name="expiry" autocomplete="cc-exp" /></label>
        <label>CVC <input name="cvc" inputmode="numeric" autocomplete="cc-csc" /></label>
      </fieldset>
      <div id="checkout-error"></div>
      <button type="submit">Place order</button>
    </form>`;
  document.getElementById('checkout').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const button = e.target.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      const order = await api('POST', '/api/orders', {
        shippingAddress: { name: f.name, line1: f.line1, city: f.city, postalCode: f.postalCode, country: f.country },
        payment: { cardNumber: f.cardNumber, expiry: f.expiry, cvc: f.cvc },
      });
      refreshChrome();
      location.hash = `#/orders/${order.id}?placed=1`;
    } catch (err) {
      showError(document.getElementById('checkout-error'), err);
      button.disabled = false;
    }
  });
}

async function ordersView() {
  if (!requireLogin()) return;
  try {
    const { items } = await api('GET', '/api/orders');
    view.innerHTML = `
      <h1>Your orders</h1>
      ${
        items.length
          ? `<table aria-label="Orders"><thead><tr><th>Order</th><th>Status</th><th>Total</th></tr></thead><tbody>
          ${items
            .map(
              (o) =>
                `<tr><td><a href="#/orders/${esc(o.id)}">${esc(o.id)}</a></td><td>${esc(o.status)}</td><td>${money(o.totalCents)}</td></tr>`,
            )
            .join('')}</tbody></table>`
          : '<p>You have no orders yet.</p>'
      }`;
  } catch (err) {
    showError(view, err);
  }
}

async function orderView(id, params) {
  if (!requireLogin()) return;
  try {
    const o = await api('GET', `/api/orders/${encodeURIComponent(id)}`);
    view.innerHTML = `
      ${params.get('placed') ? '<p role="status" class="card">Thank you! Your order has been placed.</p>' : ''}
      <h1>Order ${esc(o.id)}</h1>
      <p>Status: <strong id="order-status">${esc(o.status)}</strong></p>
      <table aria-label="Order lines"><thead><tr><th>Product</th><th>Quantity</th><th>Price</th></tr></thead><tbody>
        ${o.lines.map((l) => `<tr><td>${esc(l.name)}</td><td>${l.quantity}</td><td>${money(l.unitPriceCents)}</td></tr>`).join('')}
      </tbody></table>
      ${totalsHtml(o)}
      <p class="muted">Paid with card ending ${esc(o.cardLast4)}</p>
      <div id="order-error"></div>
      ${o.status === 'placed' ? '<button type="button" id="cancel-order" class="secondary">Cancel order</button>' : ''}`;
    document.getElementById('cancel-order')?.addEventListener('click', async () => {
      if (!confirm('Cancel this order?')) return;
      try {
        await api('POST', `/api/orders/${encodeURIComponent(o.id)}/cancel`);
        notify('Order cancelled');
        await orderView(id, new URLSearchParams());
      } catch (err) {
        showError(document.getElementById('order-error'), err);
      }
    });
  } catch (err) {
    showError(view, err);
  }
}

function authView(mode, params) {
  const register = mode === 'register';
  view.innerHTML = `
    <h1>${register ? 'Create an account' : 'Sign in'}</h1>
    <form id="auth" class="stack">
      ${register ? '<label>Name <input name="name" autocomplete="name" /></label>' : ''}
      <label>Email <input name="email" type="email" autocomplete="email" /></label>
      <label>Password <input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" /></label>
      <div id="auth-error"></div>
      <button type="submit">${register ? 'Create account' : 'Sign in'}</button>
    </form>`;
  document.getElementById('auth').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      const { token: t, user } = await api('POST', register ? '/api/auth/register' : '/api/auth/login', f);
      localStorage.setItem(TOKEN_KEY, t);
      localStorage.setItem('shoplite.user', user.name);
      await refreshChrome();
      location.hash = `#${params.get('next') ?? '/'}`;
    } catch (err) {
      showError(document.getElementById('auth-error'), err);
    }
  });
}

// ---- router --------------------------------------------------------------

async function route() {
  const [path, query = ''] = location.hash.slice(1).split('?');
  const params = new URLSearchParams(query);
  const parts = (path || '/').split('/').filter(Boolean);
  delete document.body.dataset.ready;
  view.innerHTML = '';
  if (parts.length === 0) await catalogView(params);
  else if (parts[0] === 'product' && parts[1]) await productView(parts[1]);
  else if (parts[0] === 'cart') await cartView();
  else if (parts[0] === 'checkout') await checkoutView();
  else if (parts[0] === 'orders' && parts[1]) await orderView(parts[1], params);
  else if (parts[0] === 'orders') await ordersView();
  else if (parts[0] === 'login') authView('login', params);
  else if (parts[0] === 'register') authView('register', params);
  else view.innerHTML = '<h1>Page not found</h1>';
  document.body.dataset.ready = path || '/';
}

window.addEventListener('hashchange', route);
refreshChrome();
route();
