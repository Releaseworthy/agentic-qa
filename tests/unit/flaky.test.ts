import { describe, expect, it } from 'bun:test';
import { stability } from '@qa/flaky';
import { test } from '@tests/unit/fakes';

const runs = (id: string, statuses: ('expected' | 'unexpected' | 'flaky')[]) =>
  statuses.map((status) =>
    test({
      id,
      tags: ['FEAT-CART'],
      title: id,
      status,
      error: status === 'expected' ? undefined : 'Timeout 5000ms exceeded\nat …',
    }),
  );

describe('stability', () => {
  it('ranks tests by failure rate and tells flaky from broken', () => {
    const rows = stability([
      ...runs('steady', ['expected', 'expected', 'expected', 'expected']),
      ...runs('wobbly', ['expected', 'unexpected', 'flaky', 'expected']),
      ...runs('dead', ['unexpected', 'unexpected']),
    ]);
    expect(rows.map((r) => [r.test.split(' › ')[1], r.verdict, r.rate])).toEqual([
      ['dead', 'broken', 1],
      ['wobbly', 'flaky', 0.5],
      ['steady', 'stable', 0],
    ]);
    expect(rows[1]?.errors).toEqual(['Timeout 5000ms exceeded']);
  });

  it('keeps projects apart: a test can be stable in one browser and flaky in another', () => {
    const rows = stability([
      ...runs('t', ['expected', 'expected']),
      ...runs('t', ['expected', 'unexpected']).map((r) => ({ ...r, project: 'webkit' })),
    ]);
    expect(rows.map((r) => [r.project, r.verdict])).toEqual([
      ['webkit', 'flaky'],
      ['api', 'stable'],
    ]);
  });
});
