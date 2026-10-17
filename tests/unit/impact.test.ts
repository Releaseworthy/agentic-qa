import { describe, expect, it } from 'bun:test';
import { analyzeImpact } from '@qa/impact';
import { codeIndex, test, vault } from '@tests/unit/fakes';

const tests = [
  test({ tags: ['FEAT-CART', 'BR-CART-01'], file: 'tests/api/cart.spec.ts' }),
  test({ tags: ['FEAT-CHECKOUT', 'BR-PAY-01'], file: 'tests/api/orders.spec.ts' }),
  test({ tags: ['FEAT-CATALOG'], file: 'tests/api/products.spec.ts' }),
  test({ tags: ['FEAT-CART'], file: 'tests/ui/cart.spec.ts', project: 'chromium' }),
];
const run = (paths: string[]) =>
  analyzeImpact(
    paths.map((path) => ({ path, linesChanged: 10 })),
    { vault: vault(), index: codeIndex(), tests },
  );

describe('analyzeImpact', () => {
  it('maps a changed file to the features whose code it is, and to their importers', () => {
    const r = run(['app/domain/pricing.ts']);
    expect(r.features.map((f) => f.id)).toEqual(['FEAT-CART', 'FEAT-CHECKOUT']);
    const cart = r.features.find((f) => f.id === 'FEAT-CART');
    const checkout = r.features.find((f) => f.id === 'FEAT-CHECKOUT');
    expect(cart?.weight).toBe(1);
    // orders.ts reaches pricing.ts in two hops.
    expect(checkout?.weight).toBe(0.4);
    expect(r.tests.selected).toBe(3);
    expect(r.grep).toBe('@FEAT-CART\\b|@FEAT-CHECKOUT\\b');
  });

  it('weights risk by criticality and open defects', () => {
    const r = run(['app/domain/orders.ts', 'app/domain/catalog.ts']);
    const [checkout, catalog] = r.features;
    expect(checkout?.id).toBe('FEAT-CHECKOUT');
    expect(checkout?.openDefects).toEqual(['DEF-009']);
    expect(checkout?.level).toBe('high');
    expect(catalog?.id).toBe('FEAT-CATALOG');
    expect(catalog && checkout && catalog.risk < checkout.risk).toBe(true);
  });

  it('selects the tests of a changed rule and its feature', () => {
    const r = run(['knowledge/rules/BR-CART-01.md']);
    expect(r.rules).toEqual(['BR-CART-01']);
    expect(r.features.map((f) => f.id)).toEqual(['FEAT-CART']);
  });

  it('selects specs that use a changed page object', () => {
    const r = run(['framework/pages/cart-page.ts']);
    expect(r.specs).toEqual(['tests/ui/cart.spec.ts']);
    expect(r.features).toEqual([]);
  });

  it('runs everything when a global file changes', () => {
    const r = run(['app/server.ts']);
    expect(r.full).toBe(true);
    expect(r.tests.selected).toBe(tests.length);
    expect(r.grep).toBe('');
  });

  it('selects nothing for docs and tooling, and calls none of it unmapped', () => {
    const r = run([
      'README.md',
      '.claude/skills/x/SKILL.md',
      'rag/hybrid.py',
      'knowledge/_curation/ledger.jsonl',
      'scripts/site-index.ts',
      '.mcp.json',
      'azure-pipelines.yml',
      'docker-compose.yml',
    ]);
    expect(r.tests.selected).toBe(0);
    expect(r.full).toBe(false);
    expect(r.unmapped, 'nothing here needs a feature card').toEqual([]);
  });

  it('runs everything for product code no feature maps, and reports it', () => {
    const r = run(['README.md', 'app/domain/orphan.ts']);
    expect(r.unmapped).toEqual(['app/domain/orphan.ts']);
    expect(r.full).toBe(true);
    expect(r.tests.selected).toBe(tests.length);
  });

  it('runs everything when the seed or test-hook routes change', () => {
    for (const path of ['app/routes/admin.ts', 'app/routes/test-hooks.ts']) expect(run([path]).full, path).toBe(true);
  });
});
