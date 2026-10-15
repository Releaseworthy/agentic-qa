/** Playwright's JSON (from a run, or from `--list`) flattened to one record per test × project. */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './vault';

export type TestStatus = 'expected' | 'unexpected' | 'flaky' | 'skipped' | 'listed';

export type TestRecord = {
  /** Playwright's stable test id. */
  id: string;
  /** Repo-relative spec path. */
  file: string;
  /** Describe chain › title. */
  title: string;
  tags: string[];
  project: string;
  status: TestStatus;
  /** "failed" for a `test.fail()` known-defect test. */
  expectedStatus: string;
  durationMs: number;
  error?: string;
};

type JsonResult = { status: string; duration: number; error?: { message?: string } };
type JsonTest = { projectName: string; expectedStatus: string; status: string; results: JsonResult[] };
type JsonSpec = { id: string; title: string; tags: string[]; file: string; tests: JsonTest[] };
type JsonSuite = { title: string; file: string; specs?: JsonSpec[]; suites?: JsonSuite[] };
export type PlaywrightJson = { suites: JsonSuite[]; stats?: Record<string, unknown> };

const ESC = String.fromCharCode(27);
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');
const stripAnsi = (s: string): string => s.replace(ANSI, '');

export function flatten(report: PlaywrightJson): TestRecord[] {
  const out: TestRecord[] = [];
  const walk = (suite: JsonSuite, chain: string[]): void => {
    // The top-level suite is the file; describe blocks below it join the chain.
    for (const spec of suite.specs ?? [])
      for (const t of spec.tests) {
        const last = t.results.at(-1);
        const message = last?.error?.message;
        out.push({
          id: spec.id,
          file: `tests/${spec.file}`,
          title: [...chain, spec.title].join(' › '),
          tags: spec.tags.map((tag) => tag.replace(/^@/, '')),
          project: t.projectName,
          status: t.results.length === 0 ? 'listed' : (t.status as TestStatus),
          expectedStatus: t.expectedStatus,
          durationMs: t.results.reduce((s, r) => s + r.duration, 0),
          ...(message ? { error: stripAnsi(message).slice(0, 400) } : {}),
        });
      }
    for (const child of suite.suites ?? []) walk(child, [...chain, child.title]);
  };
  for (const file of report.suites) walk(file, []);
  return out;
}

export function readResults(path = join(ROOT, 'out', 'results.json')): TestRecord[] {
  if (!existsSync(path)) throw new Error(`no test results at ${path} — run the tests first (bun run test)`);
  return flatten(JSON.parse(readFileSync(path, 'utf8')) as PlaywrightJson);
}

/** Every test the suite defines, without running it (`playwright test --list`). */
export function listTests(projects: string[] = ['api', 'chromium']): TestRecord[] {
  const args = ['--bun', 'playwright', 'test', '--list', '--reporter=json', ...projects.map((p) => `--project=${p}`)];
  const run = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const start = run.stdout.indexOf('{');
  if (start < 0) throw new Error(`playwright --list failed:\n${run.stderr}`);
  return flatten(JSON.parse(run.stdout.slice(start)) as PlaywrightJson);
}

/** Feature (FEAT-*), rule (BR-*) and defect (DEF-*) ids a test is tagged with. */
export function traceTags(t: TestRecord): string[] {
  return t.tags.filter((tag) => /^(FEAT|BR|DEF)-/.test(tag));
}
