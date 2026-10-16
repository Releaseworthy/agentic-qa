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

  it('accepts test.fail only when it pins an open defect', () => {
    const pin = (id: string) =>
      original.replace('async ({ cartPage }) => {', `async ({ cartPage }) => { test.fail(true, '${id}: limit is 11');`);
    expect(kinds(review([changed(pin('DEF-001'))], OPEN, none)), 'pins open DEF-001').not.toContain(
      'suppressed:blocked',
    );
    expect(kinds(review([changed(pin('DEF-999'))], OPEN, none)), 'DEF-999 is not open').toContain('suppressed:blocked');
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
