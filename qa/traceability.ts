/**
 * Feature-to-test traceability: every feature and business rule in the vault,
 * the automated tests tagged with it, the manual test cases that cover it, and
 * its open defects. Flags rules nothing verifies.
 *
 *   bun run qa:trace                      from `playwright test --list`
 *   bun run qa:trace --results out/results.json   from a run, with pass/fail per rule
 */

import { parseArgs } from 'node:util';
import { table, writeReport } from './report';
import { listTests, readResults, traceTags, type TestRecord } from './tests-catalog';
import { SEVERITY_RANK, Vault, type Severity } from './vault';

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
  defects: string[];
  status: 'covered' | 'failing' | 'untested';
};

export type Traceability = { rows: TraceRow[]; untestedRules: string[]; untaggedTests: string[] };

export function trace(vault: Vault, tests: TestRecord[]): Traceability {
  const manual = vault.docs.filter((d) => d.type === 'test-case');
  const testsFor = (id: string) => tests.filter((t) => traceTags(t).includes(id));
  const row = (id: string, kind: TraceRow['kind'], title: string, weight: string): TraceRow => {
    const ts = testsFor(id);
    const failing = ts.filter((t) => t.status === 'unexpected').length;
    const passing = ts.filter((t) => t.status === 'expected' || t.status === 'flaky').length;
    const covers = manual
      .filter((m) => m.meta.feature === id || (Array.isArray(m.meta.covers) && m.meta.covers.includes(id)))
      .map((m) => m.id);
    const defects = vault.defects
      .filter((d) => d.status === 'open' && (d.feature === id || d.meta.rule === id))
      .map((d) => d.id);
    return {
      id,
      kind,
      title,
      weight,
      tests: ts.length,
      passing,
      failing,
      manual: covers,
      defects,
      status: ts.length === 0 ? 'untested' : failing ? 'failing' : 'covered',
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
    untaggedTests: tests
      .filter((t) => !traceTags(t).some((tag) => tag.startsWith('FEAT-')))
      .map((t) => `${t.file} › ${t.title}`),
  };
}

export function toMarkdown(t: Traceability, fromRun: boolean): string {
  const icon = { covered: '✅', failing: '❌', untested: '⚠️' } as const;
  const rows = t.rows.map((r) => [
    `${icon[r.status]} ${r.id}`,
    r.title,
    r.weight,
    fromRun ? `${r.passing}/${r.tests}` : r.tests,
    r.manual.join(', ') || '—',
    r.defects.join(', ') || '—',
  ]);
  return [
    '## Traceability',
    '',
    table(['Item', 'Title', 'Weight', fromRun ? 'Passing' : 'Tests', 'Manual cases', 'Open defects'], rows),
    '',
    t.untestedRules.length
      ? `⚠️ Rules no automated test verifies: ${t.untestedRules.join(', ')}`
      : '✅ Every business rule has automated tests.',
    t.untaggedTests.length ? `\n⚠️ ${t.untaggedTests.length} tests carry no @FEAT tag.` : '',
  ].join('\n');
}

export function severityOf(vault: Vault, id: string): Severity | undefined {
  return vault.rule(id)?.severity;
}

if (import.meta.main) {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { results: { type: 'string' } } });
  const tests = values.results ? readResults(values.results) : listTests();
  const result = trace(new Vault(), tests);
  const md = toMarkdown(result, Boolean(values.results));
  writeReport('traceability', result, md);
  console.log(md);
}
