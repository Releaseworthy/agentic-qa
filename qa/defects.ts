/**
 * Defect triage and metrics from the vault. This is the deterministic half of the `bug-triage` workflow:
 * suggested priority, release blocking, duplicate candidates, age, the test that pins each defect,
 * and the next step in its lifecycle.
 *
 *   bun run qa:triage                    defects that are not closed or rejected
 *   bun run qa:triage DEF-003 DEF-004    just these
 *   bun run qa:triage --all              the whole history (metrics over everything)
 *
 * Priority = severity × the feature's criticality:
 *
 *              criticality ≥ 4   3     ≤ 2
 *   critical        P1          P1    P2
 *   high            P1          P2    P2
 *   medium          P2          P3    P3
 *   low             P3          P4    P4
 *
 * Release blocker: an open high or critical defect (the release gate's rule).
 */

import { parseArgs } from 'node:util';
import { table, writeReport } from '@qa/report';
import { listTests, type TestRecord } from '@qa/tests-catalog';
import { isOpen, Vault, type Defect, type DefectStatus, type Severity } from '@qa/vault';
import { daysSince, now } from '@utils/date';

export type Priority = 'P1' | 'P2' | 'P3' | 'P4';

const MATRIX: Record<Severity, [Priority, Priority, Priority]> = {
  critical: ['P1', 'P1', 'P2'],
  high: ['P1', 'P2', 'P2'],
  medium: ['P2', 'P3', 'P3'],
  low: ['P3', 'P4', 'P4'],
};

export function priorityOf(severity: Severity, criticality: number): Priority {
  return MATRIX[severity][criticality >= 4 ? 0 : criticality === 3 ? 1 : 2];
}

const NEXT: Record<DefectStatus, string> = {
  new: 'Verify it (verify-bug)',
  confirmed: 'Fix',
  open: 'Fix',
  reopened: 'Fix again (the retest failed)',
  fixed: 'Retest (retest-bug)',
  closed: '-',
  rejected: '-',
};

export type TriageRow = {
  id: string;
  title: string;
  status: DefectStatus;
  severity: Severity;
  feature: string;
  criticality: number;
  suggested: Priority;
  /** The priority on record, when someone set one. */
  recorded: string;
  blocker: boolean;
  ageDays: number | null;
  duplicates: string[];
  /** Tests tagged @DEF-<id>. */
  pinnedBy: string[];
  next: string;
};

const stems = (s: string): Set<string> =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3)
      .map((w) => w.slice(0, 5)),
  );

/** Same rule, or same feature with titles sharing ≥ 40 % of their words. Rejected defects are never candidates. */
export function duplicateCandidates(d: Defect, all: Defect[]): string[] {
  const mine = stems(d.title);
  return all
    .filter((o) => o.id !== d.id && o.status !== 'rejected')
    .filter((o) => {
      if (d.rule && o.rule === d.rule) return true;
      if (o.feature !== d.feature) return false;
      const theirs = stems(o.title);
      const shared = [...mine].filter((w) => theirs.has(w)).length;
      return shared / Math.max(1, Math.min(mine.size, theirs.size)) >= 0.4;
    })
    .map((o) => o.id);
}

export function triage(vault: Vault, tests: TestRecord[], today = now()): TriageRow[] {
  return vault.defects.map((d) => {
    const criticality = vault.feature(d.feature)?.criticality ?? 3;
    const pinnedBy = [...new Set(tests.filter((t) => t.tags.includes(d.id)).map((t) => `${t.file} › ${t.title}`))];
    const pinned = pinnedBy.length > 0;
    return {
      id: d.id,
      title: d.title,
      status: d.status,
      severity: d.severity,
      feature: d.feature,
      criticality,
      suggested: priorityOf(d.severity, criticality),
      recorded: d.priority,
      blocker: isOpen(d) && (d.severity === 'critical' || d.severity === 'high'),
      ageDays: d.reported ? daysSince(d.reported, today) : null,
      duplicates: duplicateCandidates(d, vault.defects),
      pinnedBy,
      next:
        (d.status === 'confirmed' || d.status === 'open' || d.status === 'reopened') && !pinned
          ? `Pin it with a test.fail test tagged @${d.id}, then fix`
          : NEXT[d.status],
    };
  });
}

export type DefectMetrics = {
  total: number;
  open: number;
  byStatus: Record<string, number>;
  openBySeverity: Record<string, number>;
  openByFeature: Record<string, number>;
  /** Which technique finds defects, i.e. where test effort pays off. */
  foundBy: Record<string, number>;
  rejectedBy: Record<string, number>;
  meanOpenAgeDays: number | null;
  reopened: number;
};

const countBy = <T>(items: T[], key: (t: T) => string): Record<string, number> =>
  items.reduce<Record<string, number>>((acc, t) => {
    const k = key(t) || 'unknown';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

export function metrics(vault: Vault, rows: TriageRow[]): DefectMetrics {
  const open = vault.defects.filter(isOpen);
  const ages = rows.filter((r) => open.some((d) => d.id === r.id) && r.ageDays !== null).map((r) => r.ageDays ?? 0);
  return {
    total: vault.defects.length,
    open: open.length,
    byStatus: countBy(vault.defects, (d) => d.status),
    openBySeverity: countBy(open, (d) => d.severity),
    openByFeature: countBy(open, (d) => d.feature),
    foundBy: countBy(vault.defects, (d) => (typeof d.meta.found_by === 'string' ? d.meta.found_by : '')),
    rejectedBy: countBy(
      vault.defects.filter((d) => d.status === 'rejected'),
      (d) => (typeof d.meta.resolution === 'string' ? d.meta.resolution : ''),
    ),
    meanOpenAgeDays: ages.length ? Math.round((ages.reduce((a, b) => a + b, 0) / ages.length) * 10) / 10 : null,
    reopened: vault.defects.filter((d) => d.status === 'reopened' || Number(d.meta.reopened ?? 0) > 0).length,
  };
}

export function toMarkdown(rows: TriageRow[], m: DefectMetrics): string {
  const kv = (r: Record<string, number>) =>
    Object.entries(r)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ') || '-';
  return [
    '## Defect triage',
    '',
    table(
      [
        'Defect',
        'Status',
        'Severity',
        'Priority (suggested / recorded)',
        'Blocker',
        'Age',
        'Duplicates?',
        'Pinned by',
        'Next',
      ],
      rows.map((r) => [
        `${r.id}: ${r.title}`,
        r.status,
        r.severity,
        `${r.suggested} / ${r.recorded || '-'}${r.recorded && r.recorded !== r.suggested ? ' ⚠️' : ''}`,
        r.blocker ? '🔴 yes' : 'no',
        r.ageDays === null ? '-' : `${r.ageDays} d`,
        r.duplicates.join(', ') || '-',
        r.pinnedBy.length ? r.pinnedBy.join('<br>') : '-',
        r.next,
      ]),
    ),
    '',
    '### Metrics',
    '',
    `- ${m.open} open of ${m.total} · by status: ${kv(m.byStatus)}`,
    `- Open by severity: ${kv(m.openBySeverity)} · by feature: ${kv(m.openByFeature)}`,
    `- Found by: ${kv(m.foundBy)}`,
    `- Rejected: ${kv(m.rejectedBy)} · reopened: ${m.reopened} · mean open age: ${m.meanOpenAgeDays ?? '-'} d`,
  ].join('\n');
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: { all: { type: 'boolean' } },
    allowPositionals: true,
  });
  const vault = new Vault();
  const all = triage(vault, listTests());
  const rows = all.filter((r) =>
    positionals.length
      ? positionals.includes(r.id)
      : (values.all ?? false) || (r.status !== 'closed' && r.status !== 'rejected'),
  );
  const m = metrics(vault, all);
  const md = toMarkdown(rows, m);
  writeReport('triage', { rows, metrics: m }, md);
  console.log(md);
}
