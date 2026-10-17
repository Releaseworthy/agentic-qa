import { describe, expect, it } from 'bun:test';
import { assertions, governs, review, testTitles, type Change, type Finding } from '@qa/heal-guard';
import type { Doc } from '@qa/vault';

const SPEC = 'tests/ui/cart.spec.ts';
const spec = (body: string) => `test.describe('Cart @FEAT-CART', () => {\n${body}\n});\n`;
const original = spec(`
  test('more than 10 units shows the limit @BR-CART-01', async ({ cartPage }) => {
    await test.step('Then the alert names the limit', async () => {
      await expect(cartPage.alert, 'BR-CART-01 message').toHaveText('Quantity must be between 1 and 10');
      await expect(cartPage.quantity, 'the server kept 10').toHaveValue('10');
    });
  });`);

const changed = (after: string, path = SPEC): Change => ({ path, before: original, after });
const kinds = (findings: Finding[]) => findings.map((f) => `${f.kind}:${f.allowed ? 'ok' : 'blocked'}`);
const none = () => undefined;
const OPEN = new Set(['DEF-001']);

describe('assertions', () => {
  it('reads subject, message, matcher and expected value across line breaks', () => {
    const [a] = assertions(`await expect(\n  cart.discountCents,\n  '15% capped at $30.00',\n).toBe(3000);`);
    expect(a).toMatchObject({
      subject: 'cart.discountCents',
      message: "'15% capped at $30.00'",
      matcher: 'toBe',
      expected: '3000',
      not: false,
    });
  });

  it('reads negated matchers and expectRefused', () => {
    const found = assertions(
      `await expect(page.cancel, 'not offered').not.toBeVisible(); await expectRefused(api.cart.add(id, 11), 422, 'QTY_LIMIT');`,
    );
    expect(found.map((a) => `${a.not ? 'not.' : ''}${a.matcher}(${a.expected})`)).toEqual([
      'not.toBeVisible()',
      "expectRefused(422, 'QTY_LIMIT')",
    ]);
  });

  it('lists test titles, not steps', () => {
    expect(testTitles(original)).toEqual(['more than 10 units shows the limit @BR-CART-01']);
  });

  it('reads a // inside a string, a template or a regex as code, not as a comment', () => {
    const found = assertions(`
      await expect(page.getByText('a // b'), 'label').toHaveText('a // b');
      expect(\`x // \${y /* note */}\`, 'template').toBe(z); // a real comment
      expect(/\\/\\//.test(url), 'regex').toBe(true);
      expect(x, 'x').toBe(1);`);
    expect(found.map((a) => a.message)).toEqual(["'label'", "'template'", "'regex'", "'x'"]);
    expect(found[0]?.expected).toBe("'a // b'");
  });

  it('counts calls, not a helper declared with an assertion name', () => {
    const helper = `export async function expectRefused(call: Promise<unknown>, status: number) {
      expect(await call.catch((e: unknown) => e), 'refused').toBeInstanceOf(ApiError);
    }`;
    expect(assertions(helper).map((a) => a.matcher)).toEqual(['toBeInstanceOf']);
  });
});

describe('review', () => {
  it('lets a reformat or a reworded message through', () => {
    const after = original.replace("'the server kept 10'", "'the server keeps the last valid quantity, 10'");
    expect(review([changed(after)], OPEN, none).filter((f) => !f.allowed)).toEqual([]);
  });

  it('treats a renamed locator with the same check as maintenance', () => {
    const after = original.replace('cartPage.quantity', 'cartPage.lineQuantity');
    expect(kinds(review([changed(after)], OPEN, none))).toEqual(['maintenance:ok']);
  });

  it('blocks a weakened assertion, even with evidence', () => {
    const after = original.replace(".toHaveText('Quantity must be between 1 and 10')", '.toBeVisible()');
    expect(kinds(review([changed(after)], OPEN, () => 'BR-CART-01'))).toEqual(['weakened:blocked']);
  });

  it('blocks a removed assertion and a removed test', () => {
    const noAssert = original.replace(/await expect\(cartPage\.quantity[^;]+;/, '');
    expect(kinds(review([changed(noAssert)], OPEN, none))).toEqual(['removed:blocked']);
    expect(kinds(review([changed(spec(''))], OPEN, none))).toContain('removed:blocked');
  });

  it('needs intended-change evidence for a new expected value', () => {
    const after = original.replace("'Quantity must be between 1 and 10'", "'Quantity must be between 1 and 20'");
    expect(kinds(review([changed(after)], OPEN, none)), 'no document says the limit changed').toEqual([
      'expected:blocked',
    ]);
    const healed = review([changed(after)], OPEN, () => 'BR-CART-01 (changed after the test)');
    expect(kinds(healed), 'the rule changed first').toEqual(['expected:ok']);
    expect(healed[0]?.evidence, 'the evidence is recorded').toContain('BR-CART-01');
  });

  it('blocks skips, hard waits and raised timeouts', () => {
    const skipped = original.replace("test('more", "test.skip('more");
    const waited = original.replace('async () => {', 'async () => { await page.waitForTimeout(2000);');
    const slower = original.replace("toHaveValue('10')", "toHaveValue('10', { timeout: 30000 })");
    for (const after of [skipped, waited, slower])
      expect(kinds(review([changed(after)], OPEN, none)), after).toContain('suppressed:blocked');
  });

  it('accepts test.fail only when it pins an open defect the file tags', () => {
    const pin = (id: string, tag = `@${id}`) =>
      original
        .replace('async ({ cartPage }) => {', `async ({ cartPage }) => { test.fail(true, '${id}: limit is 11');`)
        .replace('@BR-CART-01', `@BR-CART-01 ${tag}`);
    expect(kinds(review([changed(pin('DEF-001'))], OPEN, none)), 'pins open DEF-001').not.toContain(
      'suppressed:blocked',
    );
    expect(kinds(review([changed(pin('DEF-999'))], OPEN, none)), 'DEF-999 is not open').toContain('suppressed:blocked');
    expect(kinds(review([changed(pin('DEF-001', ''))], OPEN, none)), 'open, but the test is not tagged').toContain(
      'suppressed:blocked',
    );
  });

  it('blocks suppressions written with constants, at runtime or as retry loops', () => {
    const at = (code: string) => original.replace('async () => {', `async () => { ${code}`);
    for (const after of [
      at('test.setTimeout(Timeout.TEST * 4);'),
      at('test.info().skip();'),
      at("test.describe.configure({ mode: 'serial' });"),
      original.replace("toHaveValue('10')", "toHaveValue('10', { timeout: Timeout.TEST })"),
      original.replace(
        "await expect(cartPage.quantity, 'the server kept 10').toHaveValue('10');",
        "await expect(async () => { await expect(cartPage.quantity, 'the server kept 10').toHaveValue('10'); }).toPass();",
      ),
    ])
      expect(kinds(review([changed(after)], OPEN, none)), after).toContain('suppressed:blocked');
  });

  it('sees a skip moved from one test to another', () => {
    const two = (skipFirst: boolean) =>
      spec(`
  test${skipFirst ? '.skip' : ''}('a @BR-CART-01', async () => { await test.step('x', async () => { await expect(a, 'a').toBe(1); }); });
  test${skipFirst ? '' : '.skip'}('b @BR-CART-01', async () => { await test.step('y', async () => { await expect(b, 'b').toBe(2); }); });`);
    const moved: Change = { path: SPEC, before: two(true), after: two(false) };
    expect(kinds(review([moved], OPEN, none))).toContain('suppressed:blocked');
  });

  it('needs evidence for changed test data, since a moved boundary can hide a failure', () => {
    const withData = (cents: number) =>
      original.replace(
        'async ({ cartPage }) => {',
        `async ({ cartPage, seed }) => { await seed.product({ priceCents: ${cents} });`,
      );
    const moved: Change = { path: SPEC, before: withData(5000), after: withData(5100) };
    expect(kinds(review([moved], OPEN, none)), 'no document says the price changed').toEqual(['data:blocked']);
    expect(kinds(review([moved], OPEN, () => 'BR-SHIP-01')), 'documented').toEqual(['data:ok']);
    const retitled: Change = { path: SPEC, before: withData(5000), after: withData(5000).replace('Then the', 'Then') };
    expect(kinds(review([retitled], OPEN, none)), 'a step title is not data').toEqual(['maintenance:ok']);
  });

  it('treats timeouts config as suppression and schemas as a contract change', () => {
    const config: Change = {
      path: 'framework/config/timeouts.ts',
      before: 'export const A = 5000;',
      after: 'export const A = 15000;',
    };
    const schema: Change = {
      path: 'framework/api/schemas.ts',
      before: 'z.object({ a: z.string() })',
      after: 'z.object({ a: z.number() })',
    };
    expect(kinds(review([config, schema], OPEN, none))).toEqual(['suppressed:blocked', 'contract:blocked']);
  });
});

describe('review: an assertion that can no longer fail the test', () => {
  const check = "await expect(cartPage.total, 'total').toHaveText('$60.00');";
  const total = spec(`
  test('the total @BR-CART-01', async ({ cartPage }) => {
    await test.step('Then the total', async () => {
      ${check}
    });
  });`);
  const around = (code: string): Change => ({ path: SPEC, before: total, after: total.replace(check, code) });
  const weakened = (change: Change) =>
    review([change], OPEN, () => 'BR-CART-01')
      .filter((f) => f.kind === 'weakened')
      .map((f) => `${f.detail}:${f.allowed ? 'ok' : 'blocked'}`);

  it('blocks one moved under a try/catch, a .catch(), a condition or after a return or throw', () => {
    const cases: Record<string, string> = {
      'inside try/catch': `try { ${check} } catch {}`,
      'inside .catch()': check.replace(';', '.catch(() => {});'),
      'inside a catch block': `try { await cartPage.open(); } catch { ${check} }`,
      'under an if': `if (false) ${check}`,
      'under a ternary': "await (ready ? expect(cartPage.total, 'total').toHaveText('$60.00') : undefined);",
      'under &&': `ready && (${check.replace(';', '')});`,
      'under a switch case': `switch (currency) { case 'EUR': ${check} }`,
      'unreachable after return': `return; ${check}`,
      'unreachable after throw': `throw new Error('later'); ${check}`,
    };
    for (const [guard, code] of Object.entries(cases))
      expect(weakened(around(code)), guard).toEqual([`cartPage.total: toHaveText('$60.00') is now ${guard}:blocked`]);
  });

  it('lets a try/finally, a catch that rethrows and an early return in another function through', () => {
    for (const code of [
      `try { ${check} } finally { await cartPage.close(); }`,
      `try { ${check} } catch (error) { await cartPage.screenshot(); throw error; }`,
      `const later = () => { return cartPage.total; }; ${check}`,
    ])
      expect(weakened(around(code)), code).toEqual([]);
  });

  it('judges the move, not the guard: an assertion that stays under its if, or leaves it, is fine', () => {
    const guarded = around(`if (ready) ${check}`);
    const reworded: Change = {
      ...guarded,
      before: guarded.after,
      after: guarded.after.replace("'total'", "'cart total'"),
    };
    expect(weakened(reworded), 'still under the same if').toEqual([]);
    expect(weakened({ ...guarded, before: guarded.after, after: total }), 'no longer guarded').toEqual([]);
  });

  it('sees an assertion removed after a // inside a string', () => {
    const two = spec(`
  test('labels @BR-CART-01', async ({ page }) => {
    await test.step('Then the labels', async () => {
      await expect(page.getByText('a // b'), 'label').toHaveText('a // b');
      expect(count, 'count').toBe(1);
    });
  });`);
    const after = two.replace("expect(count, 'count').toBe(1);", '');
    expect(kinds(review([{ path: SPEC, before: two, after }], OPEN, none))).toEqual(['removed:blocked']);
  });
});

describe('governs', () => {
  const doc = (id: string, type: string, feature?: string): Doc => ({
    id,
    type,
    title: id,
    path: '',
    meta: feature ? { feature } : {},
  });

  it('a rule governs specs that tag it or its feature', () => {
    expect(governs(doc('BR-CART-01', 'rule', 'FEAT-CART'), new Set(['FEAT-CART'])), 'tagged by feature').toBe(true);
    expect(governs(doc('BR-SHIP-01', 'rule', 'FEAT-CHECKOUT'), new Set(['FEAT-CART'])), 'another feature').toBe(false);
  });
});
