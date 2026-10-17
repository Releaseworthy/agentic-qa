import { statSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { codeIndex, related, ROOT } from '@codesearch/index';
import { findSymbol, listHelpers, search, terms } from '@codesearch/search';
import { now, shift } from '@utils/date';

describe('terms', () => {
  it('splits camelCase and drops stop words and short words', () => {
    expect(terms('applyCoupon to the cart of a user')).toEqual(['apply', 'coupon', 'cart', 'user']);
  });
});

describe('code index (this repository)', () => {
  const index = codeIndex();

  it('resolves tsconfig path aliases into import edges', () => {
    expect(index.files.get('framework/fixtures.ts')?.imports).toContain('framework/pages/cart-page.ts');
    expect(related('app/domain/pricing.ts').importers).toContain('app/domain/cart.ts');
  });

  it('indexes page-object methods with their class', () => {
    const { definitions } = findSymbol('CartPage.applyCoupon');
    expect(definitions).toEqual([
      expect.objectContaining({ file: 'framework/pages/cart-page.ts', kind: 'method', owner: 'CartPage' }),
    ]);
  });

  it('ranks the defining files first for a natural-language query', () => {
    const files = search('apply coupon', { limit: 5 }).map((r) => r.file);
    expect(files).toContain('app/domain/cart.ts');
    expect(files).toContain('framework/api/cart-api.ts');
  });

  it('lists the data-setup helpers', () => {
    expect(listHelpers('setup')['framework/setup/seed.ts']?.join('\n')).toContain('Seed.async product(');
  });

  it('is rebuilt when a file changes, so a long MCP session sees what an agent just wrote', () => {
    const file = join(ROOT, 'tests', 'unit', 'fakes.ts');
    const before = statSync(file);
    expect(codeIndex(), 'nothing changed: the cached index').toBe(codeIndex());
    const cachedIndex = codeIndex();
    try {
      utimesSync(file, before.atime, shift(now(), { seconds: 5 }));
      expect(codeIndex(), 'a file changed: a fresh index').not.toBe(cachedIndex);
    } finally {
      utimesSync(file, before.atime, before.mtime);
    }
  });
});
