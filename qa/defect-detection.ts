/**
 * Proves the regression suite catches the seeded defects (mutation-testing style).
 *
 *   bun run qa:defects                 every defect in app/defects.ts, API project
 *   bun run qa:defects --project=chromium --only=free-shipping-boundary
 *
 * For each defect: start ShopLite with only that defect on (its own port), run
 * the whole project against it, and require at least one failing test tagged
 * with the business rule the defect breaks. "killed" = caught, "survived" = the
 * suite would ship that bug. Exits 1 when any defect survives.
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFECTS, type DefectId } from '@app/defects';
import { table, writeReport } from '@qa/report';
import { readResults } from '@qa/tests-catalog';
import { ROOT } from '@qa/vault';
import { stopwatch, toMs } from '@utils/date';

type Outcome = {
  defect: DefectId;
  rule: string;
  verdict: 'killed' | 'survived';
  caughtBy: string[];
  otherFailures: number;
};

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

async function runAgainst(defect: DefectId, port: number, project: string): Promise<Outcome> {
  // The dev environment's build (test hooks, saved accounts) on a port of its own.
  const server = spawn(process.execPath, ['run', 'framework/setup/app-server.ts'], {
    cwd: ROOT,
    env: { ...process.env, TEST_ENV: 'dev', PORT: String(port), SHOPLITE_DEFECTS: defect },
    stdio: 'ignore',
  });
  try {
    await waitForHealth(`http://localhost:${port}/health`);
    const out = join(ROOT, 'out', 'defect-detection', `${defect}.json`);
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
          SHOPLITE_DEFECTS: defect,
          CI: '',
        },
        stdio: ['ignore', 'ignore', 'inherit'],
      },
    );
    const failures = readResults(out).filter((t) => t.status === 'unexpected');
    const rule = DEFECTS[defect];
    const caughtBy = failures.filter((t) => t.tags.includes(rule)).map((t) => `${t.file} › ${t.title}`);
    return {
      defect,
      rule,
      verdict: caughtBy.length ? 'killed' : 'survived',
      caughtBy,
      otherFailures: failures.length - caughtBy.length,
    };
  } finally {
    server.kill();
  }
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: { project: { type: 'string', default: 'api' }, only: { type: 'string' } },
  });
  const ids = (values.only ? values.only.split(',') : Object.keys(DEFECTS)) as DefectId[];
  const outcomes: Outcome[] = [];
  let port = 3400; // clear of the dev/staging/live stand-ins on 3100–3300
  for (const id of ids) {
    if (!(id in DEFECTS)) throw new Error(`unknown defect ${id}`);
    console.error(`▶ ${id} (${DEFECTS[id]}) …`);
    outcomes.push(await runAgainst(id, port++, values.project));
  }
  const killed = outcomes.filter((o) => o.verdict === 'killed').length;
  const md = [
    `## Seeded-defect detection (${values.project})`,
    '',
    `**${killed} of ${outcomes.length} defects caught.**`,
    '',
    table(
      ['Defect', 'Breaks', 'Verdict', 'Caught by', 'Other failures'],
      outcomes.map((o) => [
        o.defect,
        o.rule,
        o.verdict === 'killed' ? '✅ killed' : '❌ survived',
        o.caughtBy.slice(0, 3).join('<br>') || '—',
        o.otherFailures,
      ]),
    ),
  ].join('\n');
  writeReport('defect-detection', outcomes, md);
  console.log(md);
  if (killed < outcomes.length) process.exit(1);
}
