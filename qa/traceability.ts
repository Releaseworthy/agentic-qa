/**
 * Feature-to-test traceability: every feature and business rule in the vault,
 * the automated tests tagged with it, the manual test cases that cover it, and
 * its open defects. Flags rules nothing verifies.
 *
 *   bun run qa:trace                      from `playwright test --list`
 *   bun run qa:trace --results out/results.json   from a run, with pass/fail per rule
 *   --manual <dir>                                manual runs (default out/manual-runs/)
 */

import { parseArgs } from 'node:util';
import { latestResults, manualVerdict, readRuns, type ManualResult, type ManualResultKind } from '@qa/manual-runs';
import { table, writeReport } from '@qa/report';
import { listTests, readResults, traceTags, type TestRecord } from '@qa/tests-catalog';
import { isOpen, SEVERITY_RANK, Vault, type Severity } from '@qa/vault';

export type TraceRow = {
  id: string;
  kind: 'feature' | 'rule';
  title: string;
  /** Criticality (features, 1–5) or severity (rules). */
  weight: string;
  tests: number;
  passing: number;
  failing: number;
  manual: string[];
  /** Latest manual execution of those cases. */
  manualResult: ManualResultKind | 'not run';
  defects: string[];
  /** manual: no automated test, but its manual cases passed in the latest run. */
  status: 'covered' | 'failing' | 'manual' | 'untested';
};

export type Traceability = {
  rows: TraceRow[];
  /** Rules nothing verifies — no automated test and no passing manual run. */
  untestedRules: string[];
  /** Rules only a manual run verifies. */
  manualOnlyRules: string[];
  untaggedTests: string[];
};

export function trace(vault: Vault, tests: TestRecord[], manualResults: ManualResult[] = []): Traceability {
  // A known-defect pin (`test.fail`) proves the bug is there, not the rule; a skipped test proves nothing.
  const testsFor = (id: string) =>
    tests.filter((t) => traceTags(t).includes(id) && t.expectedStatus !== 'failed' && t.status !== 'skipped');
  const row = (id: string, kind: TraceRow['kind'], title: string, weight: string): TraceRow => {
    const ts = testsFor(id);
    const failing = ts.filter((t) => t.status === 'unexpected').length;
    const passing = ts.filter((t) => t.status === 'expected' || t.status === 'flaky').length;
    const covers = vault.testCases.filter((m) => m.feature === id || m.covers.includes(id)).map((m) => m.id);
    const manualResult = manualVerdict(covers, manualResults);
    const defects = vault.defects.filter((d) => isOpen(d) && (d.feature === id || d.rule === id)).map((d) => d.id);
    return {
      id,
      kind,
      title,
      weight,
      tests: ts.length,
      passing,
      failing,
      manual: covers,
      manualResult,
      defects,
      status:
        failing || manualResult === 'failed'
          ? 'failing'
          : ts.length
            ? 'covered'
            : manualResult === 'passed'
              ? 'manual'
              : 'untested',
    };
  };
  const rows = [
    ...vault.features.map((f) => row(f.id, 'feature', f.title, `criticality ${f.criticality}`)),
    ...vault.rules
      .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.id.localeCompare(b.id))
      .map((r) => row(r.id, 'rule', r.title, r.severity)),
  ];
  return {
    rows,
    untestedRules: rows.filter((r) => r.kind === 'rule' && r.status === 'untested').map((r) => r.id),
    manualOnlyRules: rows.filter((r) => r.kind === 'rule' && r.status === 'manual').map((r) => r.id),
    untaggedTests: tests
      .filter((t) => !traceTags(t).some((tag) => tag.startsWith('FEAT-')))
      .map((t) => `${t.file} › ${t.title}`),
  };
}

export function toMarkdown(t: Traceability, fromRun: boolean): string {
  const icon = { covered: '✅', failing: '❌', manual: '🖐️', untested: '⚠️' } as const;
  const rows = t.rows.map((r) => [
    `${icon[r.status]} ${r.id}`,
    r.title,
    r.weight,
    fromRun ? `${r.passing}/${r.tests}` : r.tests,
    r.manual.length ? `${r.manual.join(', ')} (${r.manualResult})` : '—',
    r.defects.join(', ') || '—',
  ]);
  return [
    '## Traceability',
    '',
    table(['Item', 'Title', 'Weight', fromRun ? 'Passing' : 'Tests', 'Manual cases (last run)', 'Open defects'], rows),
    '',
    t.untestedRules.length
      ? `⚠️ Rules nothing verifies: ${t.untestedRules.join(', ')}`
      : '✅ Every business rule is verified.',
    t.manualOnlyRules.length ? `\n🖐️ Rules only a manual run verifies: ${t.manualOnlyRules.join(', ')}` : '',
    t.untaggedTests.length ? `\n⚠️ ${t.untaggedTests.length} tests carry no @FEAT tag.` : '',
  ].join('\n');
}

export function severityOf(vault: Vault, id: string): Severity | undefined {
  return vault.rule(id)?.severity;
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: { results: { type: 'string' }, manual: { type: 'string' } },
  });
  const tests = values.results ? readResults(values.results) : listTests();
  const result = trace(new Vault(), tests, latestResults(readRuns(values.manual)));
  const md = toMarkdown(result, Boolean(values.results));
  writeReport('traceability', result, md);
  console.log(md);
}
