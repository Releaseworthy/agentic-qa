import type { CodeFile, CodeIndex } from '@codesearch/index';
import type { TestRecord } from '@qa/tests-catalog';
import { Vault, type Doc } from '@qa/vault';

export function doc(id: string, type: string, meta: Record<string, unknown> = {}): Doc {
  return { id, type, title: `${id} title`, path: `knowledge/${type}s/${id}.md`, meta: { id, type, ...meta } };
}

/** FEAT-CART (crit 4, cart.ts + pricing.ts) with BR-CART-01; FEAT-CHECKOUT (crit 5, orders.ts) with BR-PAY-01; one open low defect. */
export function vault(extra: Doc[] = []): Vault {
  return new Vault([
    doc('FEAT-CART', 'feature', {
      criticality: 4,
      code: ['app/domain/cart.ts', 'app/domain/pricing.ts'],
      rules: ['BR-CART-01'],
    }),
    doc('FEAT-CHECKOUT', 'feature', { criticality: 5, code: ['app/domain/orders.ts'], rules: ['BR-PAY-01'] }),
    doc('FEAT-CATALOG', 'feature', { criticality: 3, code: ['app/domain/catalog.ts'] }),
    doc('BR-CART-01', 'rule', { feature: 'FEAT-CART', severity: 'high' }),
    doc('BR-PAY-01', 'rule', { feature: 'FEAT-CHECKOUT', severity: 'critical' }),
    doc('DEF-009', 'defect', { feature: 'FEAT-CHECKOUT', severity: 'low', status: 'open' }),
    ...extra,
  ]);
}

/** orders.ts imports cart.ts imports pricing.ts; a spec imports a page object. */
export function codeIndex(): CodeIndex {
  const f = (path: string, imports: string[] = []): CodeFile => ({ path, imports, symbols: [], lines: 10 });
  const files = new Map<string, CodeFile>(
    (
      [
        f('app/domain/pricing.ts'),
        f('app/domain/cart.ts', ['app/domain/pricing.ts']),
        f('app/domain/orders.ts', ['app/domain/cart.ts']),
        f('app/domain/catalog.ts'),
        f('app/domain/orphan.ts'),
        {
          ...f('framework/pages/cart-page.ts'),
          symbols: [
            {
              name: 'CartPage',
              kind: 'class' as const,
              file: 'framework/pages/cart-page.ts',
              line: 1,
              signature: 'export class CartPage',
            },
          ],
        },
        f('tests/ui/cart.spec.ts', ['framework/pages/cart-page.ts']),
      ] satisfies CodeFile[]
    ).map((x) => [x.path, x]),
  );
  const importers = new Map<string, Set<string>>();
  for (const file of files.values())
    for (const t of file.imports) importers.set(t, new Set([...(importers.get(t) ?? []), file.path]));
  return { files, importers, symbols: [...files.values()].flatMap((x) => x.symbols) };
}

export function test(over: Partial<TestRecord> & { tags: string[] }): TestRecord {
  return {
    id: Math.random().toString(36).slice(2),
    file: 'tests/api/x.spec.ts',
    title: 'a test',
    project: 'api',
    status: 'expected',
    expectedStatus: 'passed',
    durationMs: 10,
    ...over,
  };
}
