/**
 * Builds the GitHub Pages landing page for one CI run (qa/site-report.ts renders it) from the JSON the engines
 * wrote: the release gate, traceability and defect triage, plus the run's start and duration from the Playwright
 * JSON when it is there. The full Playwright HTML report is linked at report/.
 *
 *   bun run scripts/site-index.ts <site dir> [--from <dir>]
 *     reads release-gate.json, traceability.json, triage.json and results.json from --from (default out/)
 *     writes <site dir>/index.html
 *
 * Times are shown in REPORT_TIME_ZONE (default Asia/Ho_Chi_Minh, GMT+7, the maintainer's zone).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { DefectMetrics, TriageRow } from '@qa/defects';
import type { GateReport } from '@qa/release-gate';
import { renderSite, type RunInfo } from '@qa/site-report';
import { flatten, type PlaywrightJson } from '@qa/tests-catalog';
import type { Traceability } from '@qa/traceability';
import { ROOT } from '@qa/vault';
import { formatInZone, fromIso } from '@utils/date';

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: { from: { type: 'string' } },
  allowPositionals: true,
});
const site = positionals[0] ?? 'site';
const from = values.from ?? join(ROOT, 'out');
const read = (file: string): unknown => {
  const path = join(from, file);
  if (!existsSync(path)) throw new Error(`${path} is missing: run qa:gate, qa:trace and qa:triage first`);
  return JSON.parse(readFileSync(path, 'utf8'));
};

const env = process.env;
const zone = env.REPORT_TIME_ZONE ?? 'Asia/Ho_Chi_Minh';
const repoUrl =
  env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY
    ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`
    : 'https://github.com/Releaseworthy/agentic-qa';

const run: RunInfo = {
  label: env.GITHUB_RUN_NUMBER ? `#${env.GITHUB_RUN_NUMBER}` : 'Local',
  projects: [],
  repoUrl,
  ...(env.GITHUB_SHA ? { sha: env.GITHUB_SHA, commitUrl: `${repoUrl}/commit/${env.GITHUB_SHA}` } : {}),
  ...(env.GITHUB_RUN_ID ? { runUrl: `${repoUrl}/actions/runs/${env.GITHUB_RUN_ID}` } : {}),
};

if (existsSync(join(from, 'results.json'))) {
  const results = read('results.json') as PlaywrightJson;
  const { startTime, duration } = results.stats ?? {};
  if (typeof startTime === 'string') run.started = formatInZone(fromIso(startTime), zone);
  if (typeof duration === 'number') run.durationMs = duration;
  const perProject = new Map<string, number>();
  for (const t of flatten(results)) perProject.set(t.project, (perProject.get(t.project) ?? 0) + 1);
  run.projects = [...perProject].map(([name, tests]) => ({ name, tests }));
}

const html = renderSite({
  gate: read('release-gate.json') as GateReport,
  trace: read('traceability.json') as Traceability,
  triage: read('triage.json') as { rows: TriageRow[]; metrics: DefectMetrics },
  run,
});
writeFileSync(join(site, 'index.html'), html);
console.log(`wrote ${join(site, 'index.html')}`);
