import { describe, expect, it } from 'bun:test';
import { latestResults, ManualRun, manualVerdict, progress, type ManualResult } from '@qa/manual-runs';
import { assess } from '@qa/release-gate';
import { trace } from '@qa/traceability';
import { doc, test, vault } from '@tests/unit/fakes';

const step = (result: string, n = 1) => ({ n, result, observed: 'as expected' });
const run = (runId: string, executedAt: string, cases: unknown[]) =>
  ManualRun.parse({ runId, env: 'dev', executedAt, tester: 'agent:manual-tester', cases });
const tcPay = doc('TC-CHK-009', 'test-case', { feature: 'FEAT-CHECKOUT', covers: ['BR-PAY-01'], priority: 'critical' });
const result = (r: ManualResult['result']): ManualResult => ({
  id: 'TC-CHK-009',
  result: r,
  runId: 'r1',
  executedAt: '2026-10-16T10:00:00Z',
  defects: r === 'failed' ? ['DEF-030'] : [],
});

describe('ManualRun', () => {
  it('refuses a case whose result contradicts its steps', () => {
    const parsed = ManualRun.safeParse({
      runId: 'r',
      env: 'dev',
      executedAt: '2026-10-16T10:00:00Z',
      tester: 't',
      cases: [{ id: 'TC-A-001', result: 'passed', steps: [step('passed'), step('failed', 2)], defects: ['DEF-1'] }],
    });
    expect(parsed.success).toBe(false);
  });

  it('refuses a failed case that names neither a defect nor an outdated step', () => {
    const parsed = ManualRun.safeParse({
      runId: 'r',
      env: 'dev',
      executedAt: '2026-10-16T10:00:00Z',
      tester: 't',
      cases: [{ id: 'TC-A-001', result: 'failed', steps: [step('failed')] }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('latestResults', () => {
  it('keeps the newest result per case, and a skip never hides an earlier result', () => {
    const runs = [
      run('r2', '2026-10-16T10:00:00Z', [{ id: 'TC-A-001', result: 'passed', steps: [step('passed')] }]),
      run('r1', '2026-10-15T10:00:00Z', [
        { id: 'TC-A-001', result: 'failed', steps: [step('failed')], defects: ['DEF-1'] },
        { id: 'TC-B-001', result: 'blocked', steps: [step('blocked')] },
      ]),
      run('r3', '2026-10-17T10:00:00Z', [{ id: 'TC-B-001', result: 'skipped', steps: [step('skipped')] }]),
    ];
    expect(latestResults(runs).map((r) => [r.id, r.result, r.runId])).toEqual([
      ['TC-A-001', 'passed', 'r2'],
      ['TC-B-001', 'blocked', 'r1'],
    ]);
  });
});

describe('manualVerdict', () => {
  it('failed beats blocked beats passed', () => {
    const results: ManualResult[] = [
      { ...result('passed'), id: 'TC-1' },
      { ...result('blocked'), id: 'TC-2' },
    ];
    expect(manualVerdict(['TC-1'], results)).toBe('passed');
    expect(manualVerdict(['TC-1', 'TC-2'], results)).toBe('blocked');
    expect(manualVerdict(['TC-9'], results)).toBe('not run');
  });
});

describe('manual results in traceability and the gate', () => {
  const noPayTests = [test({ tags: ['FEAT-CART', 'BR-CART-01'] }), test({ tags: ['FEAT-CATALOG'] })];
  const closed = () => {
    const v = vault([tcPay]);
    for (const d of v.defects) d.status = 'closed';
    return v;
  };

  it('a rule with no automated test but a passing manual case is manual-only, not untested', () => {
    const t = trace(closed(), noPayTests, [result('passed')]);
    expect(t.untestedRules).not.toContain('BR-PAY-01');
    expect(t.manualOnlyRules).toEqual(['BR-PAY-01']);
  });

  it('the gate turns that critical rule from a blocker into a residual risk', () => {
    expect(assess(closed(), noPayTests).decision).toBe('NO-GO');
    const r = assess(closed(), noPayTests, noPayTests, [result('passed')]);
    expect(r.decision).toBe('CONDITIONAL GO');
    expect(r.findings).toContainEqual(
      expect.objectContaining({ level: 'risk', what: expect.stringContaining('BR-PAY-01') }),
    );
  });

  it('a failed manual case on a critical rule blocks the release', () => {
    const tests = [...noPayTests, test({ tags: ['FEAT-CHECKOUT', 'BR-PAY-01'] })];
    const r = assess(closed(), tests, tests, [result('failed')]);
    expect(r.decision).toBe('NO-GO');
    expect(r.findings).toContainEqual(
      expect.objectContaining({ level: 'blocker', what: expect.stringContaining('TC-CHK-009 failed') }),
    );
  });

  it('progress counts every case in the vault, run or not', () => {
    const p = progress(vault([tcPay, doc('TC-CART-009', 'test-case', { feature: 'FEAT-CART' })]), [result('passed')]);
    expect(p.counts).toMatchObject({ passed: 1, 'not run': 1 });
  });
});
