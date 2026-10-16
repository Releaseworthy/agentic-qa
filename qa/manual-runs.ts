/**
 * Manual test execution: the record `run-testcases` writes for every manual case it walks through
 * (`out/manual-runs/<runId>.json`), and the latest result per case, which traceability and the
 * release gate read next to the automated results.
 *
 *   bun run qa:manual                          progress of the manual suite
 *   bun run qa:manual --check <file>           validate one run record; exit 1 when it is malformed
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { table, writeReport } from '@qa/report';
import { ROOT, Vault, type TestCase } from '@qa/vault';

export const MANUAL_DIR = join(ROOT, 'out', 'manual-runs');

const Result = z.enum(['passed', 'failed', 'blocked', 'skipped']);
export type ManualResultKind = z.infer<typeof Result>;

const Step = z.object({
  n: z.number().int().positive(),
  result: Result,
  /** What was seen, verbatim — the expected result is in the case itself. */
  observed: z.string().min(1),
  evidence: z.string().optional(),
});

const Case = z
  .object({
    id: z.string().regex(/^TC-/),
    result: Result,
    steps: z.array(Step).min(1),
    defects: z.array(z.string().regex(/^DEF-/)).default([]),
    /** The case itself is out of date (a label changed on purpose): what to change in it. */
    caseNeedsUpdate: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((c, ctx) => {
    const has = (r: ManualResultKind) => c.steps.some((s) => s.result === r);
    const expected: ManualResultKind = has('failed')
      ? 'failed'
      : has('blocked')
        ? 'blocked'
        : c.steps.every((s) => s.result === 'skipped')
          ? 'skipped'
          : 'passed';
    if (c.result !== expected)
      ctx.addIssue({ code: 'custom', message: `${c.id}: steps say ${expected}, the case says ${c.result}` });
    if (c.result === 'failed' && c.defects.length === 0 && !c.caseNeedsUpdate)
      ctx.addIssue({ code: 'custom', message: `${c.id}: a failed case names its defect or what in the case is wrong` });
  });

export const ManualRun = z.object({
  runId: z.string().min(1),
  env: z.string().min(1),
  /** ISO timestamp. */
  executedAt: z.string().min(10),
  tester: z.string().min(1),
  cases: z.array(Case).min(1),
});
export type ManualRun = z.infer<typeof ManualRun>;

export type ManualResult = {
  id: string;
  result: ManualResultKind;
  runId: string;
  executedAt: string;
  defects: string[];
  caseNeedsUpdate?: string;
};

export function readRuns(dir = MANUAL_DIR): ManualRun[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ManualRun.parse(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
}

/** The most recent result of each case across runs; `skipped` never replaces a real result. */
export function latestResults(runs: ManualRun[]): ManualResult[] {
  const latest = new Map<string, ManualResult>();
  for (const run of [...runs].sort((a, b) => a.executedAt.localeCompare(b.executedAt)))
    for (const c of run.cases) {
      if (c.result === 'skipped' && latest.has(c.id)) continue;
      latest.set(c.id, {
        id: c.id,
        result: c.result,
        runId: run.runId,
        executedAt: run.executedAt,
        defects: c.defects,
        ...(c.caseNeedsUpdate ? { caseNeedsUpdate: c.caseNeedsUpdate } : {}),
      });
    }
  return [...latest.values()];
}

/** The combined manual result of the cases covering a feature or rule: failed beats blocked beats passed. */
export function manualVerdict(caseIds: string[], results: ManualResult[]): ManualResultKind | 'not run' {
  const run = results.filter((r) => caseIds.includes(r.id) && r.result !== 'skipped');
  if (!run.length) return 'not run';
  if (run.some((r) => r.result === 'failed')) return 'failed';
  if (run.some((r) => r.result === 'blocked')) return 'blocked';
  return 'passed';
}

export type ManualProgress = {
  total: number;
  counts: Record<ManualResultKind | 'not run', number>;
  cases: (Pick<TestCase, 'id' | 'title' | 'feature' | 'priority'> & {
    result: ManualResultKind | 'not run';
    runId?: string;
    defects: string[];
    caseNeedsUpdate?: string;
  })[];
};

export function progress(vault: Vault, results: ManualResult[]): ManualProgress {
  const counts: ManualProgress['counts'] = { passed: 0, failed: 0, blocked: 0, skipped: 0, 'not run': 0 };
  const cases = vault.testCases.map((tc): ManualProgress['cases'][number] => {
    const r = results.find((x) => x.id === tc.id);
    const result = r?.result ?? 'not run';
    counts[result]++;
    return {
      id: tc.id,
      title: tc.title,
      feature: tc.feature,
      priority: tc.priority,
      result,
      ...(r ? { runId: r.runId } : {}),
      defects: r?.defects ?? [],
      ...(r?.caseNeedsUpdate ? { caseNeedsUpdate: r.caseNeedsUpdate } : {}),
    };
  });
  return { total: cases.length, counts, cases };
}

export function toMarkdown(p: ManualProgress): string {
  const icon = { passed: '✅', failed: '❌', blocked: '⛔', skipped: '⏭️', 'not run': '⬜' } as const;
  const c = p.counts;
  return [
    '## Manual test execution',
    '',
    `${p.total} cases · ${c.passed} passed · ${c.failed} failed · ${c.blocked} blocked · ${c['not run']} not run`,
    '',
    table(
      ['Case', 'Title', 'Feature', 'Priority', 'Result', 'Defects', 'Case update needed'],
      p.cases.map((x) => [
        x.id,
        x.title,
        x.feature,
        x.priority,
        `${icon[x.result]} ${x.result}${x.runId ? ` (${x.runId})` : ''}`,
        x.defects.join(', ') || '—',
        x.caseNeedsUpdate ?? '—',
      ]),
    ),
  ].join('\n');
}

if (import.meta.main) {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { check: { type: 'string' } } });
  if (values.check) {
    const parsed = ManualRun.safeParse(JSON.parse(readFileSync(values.check, 'utf8')));
    if (!parsed.success) {
      console.error(parsed.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n'));
      process.exit(1);
    }
    console.log(`${values.check}: ${parsed.data.cases.length} cases, valid`);
    process.exit(0);
  }
  const result = progress(new Vault(), latestResults(readRuns()));
  const md = toMarkdown(result);
  writeReport('manual-progress', result, md);
  console.log(md);
}
