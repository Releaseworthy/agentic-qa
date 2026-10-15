/**
 * In-memory data for ShopLite. Seeded on start and on `POST /api/test/reset`.
 * Money is integer cents everywhere.
 */

export type Role = 'customer' | 'admin';

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  failedLogins: number;
  lockedUntil: number | null;
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  category: 'books' | 'electronics' | 'home' | 'toys';
  description: string;
  priceCents: number;
  stock: number;
};

export type Coupon = {
  code: string;
  kind: 'percent' | 'fixed';
  /** Percent (1–100) or cents off. */
  value: number;
  minSubtotalCents: number;
  /** Upper bound of the discount, for percent coupons. */
  maxDiscountCents: number | null;
  expiresAt: number | null;
};

export type CartLine = { productId: string; quantity: number };
export type Cart = { lines: CartLine[]; couponCode: string | null };

export type OrderStatus = 'placed' | 'shipped' | 'cancelled';

export type Address = { name: string; line1: string; city: string; postalCode: string; country: string };

export type OrderLine = { productId: string; name: string; unitPriceCents: number; quantity: number };

export type Order = {
  id: string;
  userId: string;
  lines: OrderLine[];
  couponCode: string | null;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  status: OrderStatus;
  shippingAddress: Address;
  cardLast4: string;
  createdAt: number;
};

export type Session = { token: string; userId: string; expiresAt: number };

export const ADMIN_EMAIL = 'admin@shoplite.test';
/** Demo-only password of the local system under test; override with SHOPLITE_ADMIN_PASSWORD. */
export const ADMIN_PASSWORD = process.env.SHOPLITE_ADMIN_PASSWORD ?? 'admin-demo-pass1';

const DAY = 86_400_000;

const SEED_PRODUCTS: Omit<Product, 'id'>[] = [
  {
    sku: 'BK-001',
    name: 'Testing in Practice',
    category: 'books',
    description: 'Field guide to risk-based testing.',
    priceCents: 3200,
    stock: 500,
  },
  {
    sku: 'BK-002',
    name: 'The Agentic Engineer',
    category: 'books',
    description: 'Building with AI agents.',
    priceCents: 4500,
    stock: 500,
  },
  {
    sku: 'BK-003',
    name: 'Pocket TypeScript',
    category: 'books',
    description: 'A short TypeScript reference.',
    priceCents: 1500,
    stock: 500,
  },
  {
    sku: 'EL-001',
    name: 'Noise-Cancelling Headphones',
    category: 'electronics',
    description: 'Over-ear, 30 h battery.',
    priceCents: 12900,
    stock: 500,
  },
  {
    sku: 'EL-002',
    name: 'USB-C Hub',
    category: 'electronics',
    description: '7 ports, 100 W pass-through.',
    priceCents: 3900,
    stock: 500,
  },
  {
    sku: 'EL-003',
    name: 'Mechanical Keyboard',
    category: 'electronics',
    description: 'Hot-swappable switches.',
    priceCents: 8900,
    stock: 500,
  },
  {
    sku: 'HM-001',
    name: 'Ceramic Mug',
    category: 'home',
    description: '350 ml, dishwasher safe.',
    priceCents: 1200,
    stock: 500,
  },
  { sku: 'HM-002', name: 'Desk Lamp', category: 'home', description: 'Dimmable LED.', priceCents: 2800, stock: 500 },
  { sku: 'HM-003', name: 'Plant Pot', category: 'home', description: 'Self-watering.', priceCents: 1900, stock: 500 },
  { sku: 'TY-001', name: 'Puzzle Cube', category: 'toys', description: '3x3 speed cube.', priceCents: 900, stock: 500 },
  {
    sku: 'TY-002',
    name: 'Building Blocks',
    category: 'toys',
    description: '500 pieces.',
    priceCents: 4900,
    stock: 500,
  },
  { sku: 'TY-003', name: 'Kite', category: 'toys', description: 'Delta kite, 1.2 m.', priceCents: 2500, stock: 3 },
];

function seedCoupons(now: number): Coupon[] {
  return [
    { code: 'WELCOME10', kind: 'percent', value: 10, minSubtotalCents: 2000, maxDiscountCents: null, expiresAt: null },
    { code: 'SAVE5', kind: 'fixed', value: 500, minSubtotalCents: 3000, maxDiscountCents: null, expiresAt: null },
    {
      code: 'BIGSPENDER',
      kind: 'percent',
      value: 15,
      minSubtotalCents: 10000,
      maxDiscountCents: 3000,
      expiresAt: null,
    },
    { code: 'SUMMER20', kind: 'percent', value: 20, minSubtotalCents: 0, maxDiscountCents: null, expiresAt: now - DAY },
  ];
}

export class Store {
  users = new Map<string, User>();
  products = new Map<string, Product>();
  coupons = new Map<string, Coupon>();
  carts = new Map<string, Cart>();
  orders = new Map<string, Order>();
  sessions = new Map<string, Session>();
  private seq = 0;

  constructor() {
    this.reset();
  }

  nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq.toString(36)}${crypto.randomUUID().slice(0, 6)}`;
  }

  reset(): void {
    this.users.clear();
    this.products.clear();
    this.coupons.clear();
    this.carts.clear();
    this.orders.clear();
    this.sessions.clear();
    const now = Date.now();
    for (const p of SEED_PRODUCTS) {
      const id = `p_${p.sku.toLowerCase()}`;
      this.products.set(id, { ...p, id });
    }
    for (const c of seedCoupons(now)) this.coupons.set(c.code, c);
    const admin: User = {
      id: 'u_admin',
      email: ADMIN_EMAIL,
      name: 'Store Admin',
      role: 'admin',
      passwordHash: Bun.password.hashSync(ADMIN_PASSWORD, { algorithm: 'bcrypt', cost: 4 }),
      failedLogins: 0,
      lockedUntil: null,
    };
    this.users.set(admin.id, admin);
  }

  cartOf(userId: string): Cart {
    let cart = this.carts.get(userId);
    if (!cart) {
      cart = { lines: [], couponCode: null };
      this.carts.set(userId, cart);
    }
    return cart;
  }

  userByEmail(email: string): User | undefined {
    const wanted = email.toLowerCase();
    for (const u of this.users.values()) if (u.email === wanted) return u;
    return undefined;
  }
}

export const store = new Store();
