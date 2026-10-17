import { describe, expect, it } from 'bun:test';
import type { TestCase } from '@qa/vault';
import { checkCases, renderCatalog } from '@setup/catalog';
import { RECIPES } from '@setup/recipes';

const tc = (setup: TestCase['setup'], status = 'ready'): TestCase => ({
  id: 'TC-X-001',
  type: 'test-case',
  title: 'x',
  path: 'knowledge/test-cases/TC-X-001.md',
  meta: { status },
  feature: 'FEAT-CART',
  covers: [],
  priority: 'high',
  status,
  automatedBy: 'none',
  setup,
});
const ARRANGED = '## Preconditions\n\n- A cart: `bun run qa:arrange --case TC-X-001 --name <session>`.\n';

describe('recipe params', () => {
  it('fill defaults and refuse unknown keys', () => {
    expect(RECIPES.cart.params.parse({}), 'defaults of a fresh product, one unit').toEqual({
      priceCents: 1000,
      stock: 50,
      quantity: 1,
    });
    expect(RECIPES.cart.params.safeParse({ price: 10 }).success, 'a typo is an error, not a silent default').toBe(
      false,
    );
  });
});

describe('renderCatalog', () => {
  it('documents every recipe with its params, and links no rule into the graph', () => {
    const doc = renderCatalog();
    const missing = Object.keys(RECIPES).filter((id) => !doc.includes(`## Recipe: ${id}`));
    expect(missing, 'every recipe has a section').toEqual([]);
    expect(doc, 'coupon params are listed').toContain('| `minSubtotalCents` | number | `0` |');
    expect(doc.includes('[['), 'plain ids: the catalog must not pull rules into its graph neighbourhood').toBe(false);
  });
});

describe('checkCases', () => {
  it('accepts a case that arranges through a valid recipe', () => {
    expect(
      checkCases([tc({ recipe: 'cart', params: { priceCents: 5000 } })], () => ARRANGED),
      'valid setup',
    ).toEqual([]);
  });

  it('flags a missing setup, an unknown recipe and invalid params', () => {
    const problems = [
      ...checkCases([tc(undefined)], () => ARRANGED),
      ...checkCases([tc({ recipe: 'basket', params: {} })], () => ARRANGED),
      ...checkCases([tc({ recipe: 'cart', params: { priceCents: -1 } })], () => ARRANGED),
    ];
    expect(
      problems.map((p) => p.split(': ')[1]?.slice(0, 20)),
      'one problem each',
    ).toEqual(['no `setup` (add the ', 'setup.recipe "basket', 'setup params']);
  });

  it('flags preconditions that set themselves up, and skips deprecated cases', () => {
    const own = '## Preconditions\n\n- A cart, set up over the API.\n';
    expect(
      checkCases([tc({ recipe: 'cart', params: {} })], () => own).length,
      'hand-made setup, no --case command',
    ).toBe(2);
    expect(
      checkCases([tc(undefined, 'deprecated')], () => own),
      'deprecated cases are not run',
    ).toEqual([]);
    expect(
      checkCases([tc(undefined, 'outdated')], () => own),
      'an outdated case is still checked: it runs again once updated',
    ).toEqual([expect.stringContaining('no `setup`')]);
  });
});
