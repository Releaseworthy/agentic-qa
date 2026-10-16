import { describe, expect, it } from 'bun:test';
import { duplicateCandidates, metrics, priorityOf, triage } from '@qa/defects';
import { Vault } from '@qa/vault';
import { doc, test, vault } from '@tests/unit/fakes';
import { fromIso } from '@utils/date';

const TODAY = fromIso('2026-10-16T12:00:00Z');
const defect = (id: string, meta: Record<string, unknown>) =>
  doc(id, 'defect', { feature: 'FEAT-CART', severity: 'medium', status: 'confirmed', ...meta });

describe('priorityOf', () => {
  it('follows severity × feature criticality', () => {
    expect(priorityOf('critical', 2)).toBe('P2');
    expect(priorityOf('high', 5)).toBe('P1');
    expect(priorityOf('high', 3)).toBe('P2');
    expect(priorityOf('medium', 4)).toBe('P2');
    expect(priorityOf('low', 3)).toBe('P4');
  });
});

describe('triage', () => {
  it('suggests the priority, flags blockers and counts the age', () => {
    const v = vault([defect('DEF-010', { severity: 'high', reported: '2026-10-06' })]);
    const row = triage(v, [], TODAY).find((r) => r.id === 'DEF-010');
    expect(row).toMatchObject({ suggested: 'P1', blocker: true, ageDays: 10 });
  });

  it('asks for a pinning test until one is tagged with the defect', () => {
    const v = vault([defect('DEF-010', {})]);
    expect(triage(v, [], TODAY).find((r) => r.id === 'DEF-010')?.next).toContain('Pin it');
    const pinned = triage(v, [test({ tags: ['FEAT-CART', 'DEF-010'], title: 'DEF-010 x' })], TODAY);
    expect(pinned.find((r) => r.id === 'DEF-010')).toMatchObject({
      next: 'Fix',
      pinnedBy: ['tests/api/x.spec.ts › DEF-010 x'],
    });
  });

  it('routes a fixed defect to retest and a new one to verification', () => {
    const v = vault([defect('DEF-010', { status: 'fixed' }), defect('DEF-011', { status: 'new' })]);
    const rows = triage(v, [], TODAY);
    expect(rows.find((r) => r.id === 'DEF-010')?.next).toContain('retest-bug');
    expect(rows.find((r) => r.id === 'DEF-011')?.next).toContain('verify-bug');
  });

  it('a fixed but not retested high defect still blocks; a rejected one does not', () => {
    const v = vault([
      defect('DEF-010', { severity: 'high', status: 'fixed' }),
      defect('DEF-011', { severity: 'high', status: 'rejected' }),
    ]);
    const rows = triage(v, [], TODAY);
    expect(rows.find((r) => r.id === 'DEF-010')?.blocker).toBe(true);
    expect(rows.find((r) => r.id === 'DEF-011')?.blocker).toBe(false);
  });
});

describe('duplicateCandidates', () => {
  it('matches the same rule, or the same feature with a similar title, never a rejected one', () => {
    const all = new Vault([
      defect('DEF-020', { rule: 'BR-CART-01', title: 'PATCH accepts 11 units' }),
      defect('DEF-021', { rule: 'BR-CART-01', title: 'Anything' }),
      { ...defect('DEF-022', {}), title: 'Cart quantity limit ignored on update' },
      { ...defect('DEF-023', {}), title: 'Quantity limit ignored on cart update path' },
      { ...defect('DEF-024', { status: 'rejected' }), title: 'Quantity limit ignored on cart update' },
      { ...defect('DEF-025', { feature: 'FEAT-AUTH' }), title: 'Quantity limit ignored on cart update' },
    ]).defects;
    const find = (id: string) => all.find((d) => d.id === id)!;
    expect(duplicateCandidates(find('DEF-020'), all)).toEqual(['DEF-021']);
    expect(duplicateCandidates(find('DEF-022'), all)).toEqual(['DEF-023']);
  });
});

describe('metrics', () => {
  it('counts open defects by severity and the techniques that found them', () => {
    const v = vault([
      defect('DEF-010', { severity: 'high', found_by: 'ad hoc testing', reported: '2026-10-11' }),
      defect('DEF-011', { status: 'rejected', resolution: 'duplicate', found_by: 'ad hoc testing' }),
    ]);
    const m = metrics(v, triage(v, [], TODAY));
    expect(m.open).toBe(2); // DEF-009 (fakes) + DEF-010
    expect(m.openBySeverity).toEqual({ low: 1, high: 1 });
    expect(m.foundBy['ad hoc testing']).toBe(2);
    expect(m.rejectedBy).toEqual({ duplicate: 1 });
    expect(m.meanOpenAgeDays).toBe(5);
  });
});
