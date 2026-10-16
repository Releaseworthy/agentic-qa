import { describe, expect, it } from 'bun:test';
import { Vault, type Doc } from '@qa/vault';
import { validate } from '@qa/vault-check';
import { doc } from '@tests/unit/fakes';

const titled = (id: string, type: string, meta: Record<string, unknown> = {}): Doc =>
  doc(id, type, { title: `${id} title`, ...meta });
const base = [
  titled('FEAT-CART', 'feature', { criticality: 4, rules: ['BR-CART-01'] }),
  titled('BR-CART-01', 'rule', { feature: 'FEAT-CART', severity: 'high' }),
];
const check = (...docs: Doc[]) => validate(new Vault([...base, ...docs]));

describe('validate', () => {
  it('accepts a well-formed defect', () => {
    const def = titled('DEF-003', 'defect', { status: 'confirmed', severity: 'high', feature: 'FEAT-CART' });
    expect(check(def)).toEqual([]);
  });

  it('rejects a severity the gate cannot rank', () => {
    const def = titled('DEF-003', 'defect', { status: 'confirmed', severity: 'High', feature: 'FEAT-CART' });
    expect(check(def).join('\n')).toContain('severity');
  });

  it('rejects a document in another type’s folder, or with another type’s id', () => {
    const disguised = { ...titled('BR-CART-01', 'defect', { status: 'new', severity: 'low', feature: 'FEAT-CART' }) };
    disguised.path = 'knowledge/rules/BR-CART-01.md';
    const problems = check(disguised).join('\n');
    expect(problems, 'folder').toContain('a defect lives in knowledge/defects/');
    expect(problems, 'id pattern').toContain('a defect id matches');
    expect(problems, 'duplicate id').toContain('id also used by');
  });

  it('rejects references to features and rules that do not exist', () => {
    const tc = titled('TC-CART-009', 'test-case', {
      feature: 'FEAT-NOPE',
      covers: ['BR-CART-99'],
      priority: 'high',
      status: 'ready',
      automated_by: 'none',
    });
    expect(check(tc)).toEqual([
      'knowledge/test-cases/TC-CART-009.md (TC-CART-009): feature FEAT-NOPE is not a feature',
      'knowledge/test-cases/TC-CART-009.md (TC-CART-009): covers BR-CART-99 is not a rule',
    ]);
  });
});
