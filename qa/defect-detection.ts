/**
 * Proves the regression suite catches the seeded defects (mutation-testing style).
 *
 *   bun run qa:defects                 every defect in app/defects.ts, API project
 *   bun run qa:defects --project=chromium --only=free-shipping-boundary
 *
 * First a baseline: the project runs once against ShopLite with no defect on. Then, for each defect, ShopLite starts
 * with only that defect on (its own port) and the project runs again. A defect is "killed" when a test tagged with the
 * business rule it breaks passed on the baseline and fails now; "survived" means the suite would ship that bug. A
 * test that already fails on the clean build proves nothing, so it never counts as a catch. Exits 1 when any defect
 * survives.
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFECTS, type DefectId } from '@app/defects';
import { table, writeReport } from '@qa/report';
import { readResults, type TestRecord } from '@qa/tests-catalog';
import { ROOT } from '@qa/vault';
import { stopwatch, toMs } from '@utils/date';

type Outcome = {
  defect: DefectId;
  rule: string;
  verdict: 'killed' | 'survived';
  caughtBy: string[];
  otherFailures: number;
};

const key = (t: TestRecord): string => `${t.id}/${t.project}`;
const where = (t: TestRecord): string => `${t.file} › ${t.title}`;

async function waitForHealth(url: string, ms = toMs({ seconds: 20 })): Promise<void> {
  const elapsed = stopwatch();
  while (elapsed() < ms) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await Bun.sleep(200);
  }
  throw new Error(`server did not start: ${url}`);
}

/** Runs `project` against a ShopLite of its own with `defects` on ('none' for the clean build). */
async function runSuite(defects: string, port: number, project: string, label: string): Promise<TestRecord[]> {
  // The dev environment's build (test hooks, saved accounts) on a port of its own.
  const server = spawn(process.execPath, ['run', 'framework/setup/app-server.ts'], {
    cwd: ROOT,
    env: { ...process.env, TEST_ENV: 'dev', PORT: String(port), SHOPLITE_DEFECTS: defects },
    stdio: 'ignore',
  });
  try {
    await waitForHealth(`http://localhost:${port}/health`);
    const out = join(ROOT, 'out', 'defect-detection', `${label}.json`);
    mkdirSync(join(ROOT, 'out', 'defect-detection'), { recursive: true });
    spawnSync(
      process.execPath,
      ['--bun', 'playwright', 'test', `--project=${project}`, '--reporter=json', '--retries=0'],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          TEST_ENV: 'dev',
          BASE_URL: `http://localhost:${port}`,
          START_APP: 'false',
          PLAYWRIGHT_JSON_OUTPUT_FILE: out,
          SHOPLITE_DEFECTS: defects,
          CI: '',
        },
        stdio: ['ignore', 'ignore', 'inherit'],
      },
    );
    return readResults(out);
  } finally {
    server.kill();
  }
}

/** Which tests the defect turned red: tagged with its rule, green on the clean build, failing now. */
export function judge(defect: DefectId, baseline: TestRecord[], results: TestRecord[]): Outcome {
  const green = new Set(baseline.filter((t) => t.status === 'expected').map(key));
  const failures = results.filter((t) => t.status === 'unexpected');
  const rule = DEFECTS[defect];
  const caughtBy = failures.filter((t) => t.tags.includes(rule) && green.has(key(t))).map(where);
  return {
    defect,
    rule,
    verdict: caughtBy.length ? 'killed' : 'survived',
    caughtBy,
    otherFailures: failures.length - caughtBy.length,
  };
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: { project: { type: 'string', default: 'api' }, only: { type: 'string' } },
  });
  const ids = (values.only ? values.only.split(',') : Object.keys(DEFECTS)) as DefectId[];
  for (const id of ids) if (!(id in DEFECTS)) throw new Error(`unknown defect ${id}`);
  let port = 3400; // clear of the dev/staging/live stand-ins on 3100-3300
  console.error('▶ baseline (no defect) …');
  const baseline = await runSuite('none', port++, values.project, 'baseline');
  const baselineFailures = baseline.filter((t) => t.status === 'unexpected');
  const outcomes: Outcome[] = [];
  for (const id of ids) {
    console.error(`▶ ${id} (${DEFECTS[id]}) …`);
    outcomes.push(judge(id, baseline, await runSuite(id, port++, values.project, id)));
  }
  const killed = outcomes.filter((o) => o.verdict === 'killed').length;
  const md = [
    `## Seeded-defect detection (${values.project})`,
    '',
    `**${killed} of ${outcomes.length} defects caught.** Baseline without defects: ` +
      `${baseline.length - baselineFailures.length} of ${baseline.length} tests green.`,
    '',
    table(
      ['Defect', 'Breaks', 'Verdict', 'Caught by', 'Other failures'],
      outcomes.map((o) => [
        o.defect,
        o.rule,
        o.verdict === 'killed' ? '✅ killed' : '❌ survived',
        o.caughtBy.slice(0, 3).join('<br>') || '-',
        o.otherFailures,
      ]),
    ),
    ...(baselineFailures.length
      ? ['', `⚠️ Red on the clean build, so they can't count as catches: ${baselineFailures.map(where).join(' · ')}`]
      : []),
  ].join('\n');
  writeReport(
    'defect-detection',
    { baseline: { tests: baseline.length, failing: baselineFailures.map(where) }, outcomes },
    md,
  );
  console.log(md);
  if (killed < outcomes.length) process.exit(1);
}
