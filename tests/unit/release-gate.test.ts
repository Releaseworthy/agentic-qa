import { describe, expect, it } from 'bun:test';
import { assess } from '@qa/release-gate';
import { doc, test, vault } from '@tests/unit/fakes';

const green = [
  test({ tags: ['FEAT-CART', 'BR-CART-01'] }),
  test({ tags: ['FEAT-CHECKOUT', 'BR-PAY-01'] }),
  test({ tags: ['FEAT-CATALOG'] }),
];
const closed = (v = vault()) => {
  for (const d of v.defects) d.status = 'closed';
  return v;
};

describe('assess', () => {
  it('GO when everything passes, every rule is covered and no defect is open', () => {
    expect(assess(closed(), green).decision).toBe('GO');
  });

  it('CONDITIONAL GO with an open low defect, listed as a residual risk', () => {
    const r = assess(vault(), green);
    expect(r.decision).toBe('CONDITIONAL GO');
    expect(r.findings).toEqual([expect.objectContaining({ level: 'risk', what: expect.stringContaining('DEF-009') })]);
  });

  it('NO-GO when a test fails on a critical feature', () => {
    const results = [
      ...green.slice(0, 1),
      test({ tags: ['FEAT-CHECKOUT', 'BR-PAY-01'], status: 'unexpected' }),
      green[2]!,
    ];
    const r = assess(closed(), results);
    expect(r.decision).toBe('NO-GO');
    expect(r.findings.filter((f) => f.level === 'blocker')).toHaveLength(2); // the failure + pass rate 66 %
  });

  it('a failure on a low-criticality feature is a risk, not a blocker', () => {
    const many = Array.from({ length: 30 }, () => test({ tags: ['FEAT-CART', 'BR-CART-01'] }));
    const results = [
      ...many,
      test({ tags: ['FEAT-CHECKOUT', 'BR-PAY-01'] }),
      test({ tags: ['FEAT-CATALOG'], status: 'unexpected' }),
    ];
    expect(assess(closed(), results).decision).toBe('CONDITIONAL GO');
  });

  it('NO-GO on an open high-severity defect', () => {
    const v = vault([doc('DEF-010', 'defect', { feature: 'FEAT-CART', severity: 'high', status: 'open' })]);
    expect(assess(v, green).decision).toBe('NO-GO');
  });

  it('NO-GO when a critical rule has no automated test', () => {
    const r = assess(
      closed(),
      green.filter((t) => !t.tags.includes('BR-PAY-01')),
    );
    expect(r.findings).toContainEqual(
      expect.objectContaining({ level: 'blocker', what: expect.stringContaining('BR-PAY-01') }),
    );
  });

  it('counts a passing test.fail() as a known defect, not a failure', () => {
    const r = assess(closed(), [...green, test({ tags: ['FEAT-CHECKOUT'], expectedStatus: 'failed' })]);
    expect(r.stats.knownDefects).toBe(1);
    expect(r.stats.failed).toBe(0);
  });

  it('flaky tests make it conditional', () => {
    expect(assess(closed(), [...green, test({ tags: ['FEAT-CATALOG'], status: 'flaky' })]).decision).toBe(
      'CONDITIONAL GO',
    );
  });
});
