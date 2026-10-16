/**
 * Flakiness from a repeated run: the `flaky-hunt` workflow runs the suspects with `--repeat-each=<n>`
 * (and `--retries=0`, so a retry can't hide a failure), then this ranks every test by how often it failed.
 *
 *   bunx playwright test --grep "<suspects>" --repeat-each=10 --retries=0 --workers=4
 *   bun run qa:flaky [--results out/results.json]
 *
 * stable: never failed · flaky: failed some runs · broken: failed every run (not flaky — a real failure).
 */

import { parseArgs } from 'node:util';
import { table, writeReport } from '@qa/report';
import { readResults, type TestRecord } from '@qa/tests-catalog';

export type Stability = {
  test: string;
  project: string;
  runs: number;
  failures: number;
  rate: number;
  verdict: 'stable' | 'flaky' | 'broken';
  /** Distinct first lines of the failure messages: one cause or several. */
  errors: string[];
};

export function stability(records: TestRecord[]): Stability[] {
  const groups = new Map<string, TestRecord[]>();
  for (const r of records.filter((x) => x.status !== 'skipped' && x.status !== 'listed')) {
    const key = `${r.id}/${r.project}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([, runs]) => {
      const [first] = runs as [TestRecord, ...TestRecord[]];
      // A `flaky` record failed at least one attempt before passing: it counts as a failure here.
      const failed = runs.filter((r) => r.status === 'unexpected' || r.status === 'flaky');
      const rate = failed.length / runs.length;
      return {
        test: `${first.file} › ${first.title}`,
        project: first.project,
        runs: runs.length,
        failures: failed.length,
        rate: Math.round(rate * 1000) / 1000,
        verdict: rate === 0 ? 'stable' : rate === 1 ? 'broken' : 'flaky',
        errors: [...new Set(failed.map((r) => (r.error ?? '').split('\n')[0] ?? '').filter(Boolean))],
      } satisfies Stability;
    })
    .sort((a, b) => b.rate - a.rate || a.test.localeCompare(b.test));
}

export function toMarkdown(rows: Stability[]): string {
  const unstable = rows.filter((r) => r.verdict !== 'stable');
  return [
    '## Test stability',
    '',
    `${rows.length} tests · ${rows.filter((r) => r.verdict === 'flaky').length} flaky · ` +
      `${rows.filter((r) => r.verdict === 'broken').length} broken · runs per test: ${Math.max(0, ...rows.map((r) => r.runs))}`,
    '',
    unstable.length
      ? table(
          ['Test', 'Project', 'Failed', 'Rate', 'Verdict', 'Errors'],
          unstable.map((r) => [
            r.test,
            r.project,
            `${r.failures}/${r.runs}`,
            `${(r.rate * 100).toFixed(0)} %`,
            r.verdict,
            r.errors.join('<br>') || '—',
          ]),
        )
      : '✅ Every test passed every run.',
  ].join('\n');
}

if (import.meta.main) {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { results: { type: 'string' } } });
  const rows = stability(readResults(values.results));
  const md = toMarkdown(rows);
  writeReport('stability', rows, md);
  console.log(md);
}
