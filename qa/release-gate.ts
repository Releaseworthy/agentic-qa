/**
 * Go/No-Go release assessment from evidence: test results, coverage, open
 * defects and business impact. The decision is for a human to sign off; this
 * report is what they sign off on.
 *
 *   bun run qa:gate                                    from out/results.json
 *   bun run qa:gate --results merged.json --strict     exit 1 on NO-GO
 *   --manual <dir>                                     manual runs (default out/manual-runs/)
 *
 * NO-GO when any of:
 *   - a test or a manual case fails on a feature of criticality ≥ 4, or on a critical/high rule;
 *   - an open defect is critical or high (open = not closed or rejected; a fix nobody retested is open);
 *   - a critical rule has neither an automated test nor a passing manual run;
 *   - the pass rate is below 95 %.
 * CONDITIONAL GO when there are other failures, flaky tests, open medium/low
 * defects, or untested non-critical rules. Each one is listed as a residual risk
 * with the mitigation it needs. GO otherwise.
 */

import { parseArgs } from 'node:util';
import { latestResults, readRuns, type ManualResult } from '@qa/manual-runs';
import { table, setOutputs, writeReport } from '@qa/report';
import { listTests, readResults, traceTags, withResults, type TestRecord } from '@qa/tests-catalog';
import { trace } from '@qa/traceability';
import { SEVERITY_RANK, Vault } from '@qa/vault';

export type Decision = 'GO' | 'CONDITIONAL GO' | 'NO-GO';

export type Finding = { level: 'blocker' | 'risk'; what: string; mitigation: string };

export type GateReport = {
  decision: Decision;
  stats: {
    total: number;
    passed: number;
    failed: number;
    flaky: number;
    skipped: number;
    knownDefects: number;
    passRate: number;
    catalog: number;
  };
  findings: Finding[];
  features: {
    id: string;
    title: string;
    criticality: number;
    tests: number;
    failed: number;
    flaky: number;
    openDefects: string[];
    status: string;
  }[];
};

const MIN_PASS_RATE = 0.95;

/**
 * `catalog`: every test the suite defines, with this run's results laid over it (`withResults`). Coverage is judged
 * on it, so an impact-selected run doesn't read as missing tests, and a `test.fail` pin or a skip that ran counts as
 * what it is.
 */
export function assess(
  vault: Vault,
  results: TestRecord[],
  catalog: TestRecord[] = results,
  manual: ManualResult[] = [],
): GateReport {
  const ran = results.filter((t) => t.status !== 'listed');
  const failed = ran.filter((t) => t.status === 'unexpected');
  const flaky = ran.filter((t) => t.status === 'flaky');
  const skipped = ran.filter((t) => t.status === 'skipped');
  const knownDefects = ran.filter((t) => t.expectedStatus === 'failed' && t.status === 'expected');
  const executed = ran.length - skipped.length;
  const passRate = executed ? (executed - failed.length) / executed : 0;
  const findings: Finding[] = [];
  const blocker = (what: string, mitigation: string) => findings.push({ level: 'blocker', what, mitigation });
  const risk = (what: string, mitigation: string) => findings.push({ level: 'risk', what, mitigation });

  if (executed === 0) blocker('No test results', 'Run the regression suite before assessing the release');

  for (const t of failed) {
    const tags = traceTags(t);
    const critical = tags.filter(
      (tag) => (vault.feature(tag)?.criticality ?? 0) >= 4 || SEVERITY_RANK[vault.rule(tag)?.severity ?? 'low'] >= 3,
    );
    const where = `\`${t.file}\` › ${t.title} [${t.project}]`;
    if (critical.length)
      blocker(
        `Failing on ${critical.join(', ')}: ${where}`,
        'Fix the product or the test, then re-run; a test is never weakened to pass',
      );
    else risk(`Failing: ${where}`, 'Triage: product bug (file a defect) or test defect (fix the test)');
  }
  for (const t of flaky)
    risk(`Flaky: \`${t.file}\` › ${t.title} [${t.project}]`, 'Find the missing wait or shared data; retries hide it');

  for (const d of vault.openDefects()) {
    const msg = `Open ${d.severity} defect ${d.id}: ${d.title} (${d.feature})`;
    if (SEVERITY_RANK[d.severity] >= 3) blocker(msg, 'Fix before release, or a product owner explicitly accepts it');
    else risk(msg, 'Release note / known issue; schedule the fix');
  }

  const coverage = trace(vault, catalog, manual);
  for (const id of coverage.untestedRules) {
    const sev = vault.rule(id)?.severity ?? 'medium';
    const msg = `Rule ${id} (${sev}) has no automated test and no passing manual run`;
    if (sev === 'critical')
      blocker(msg, 'Add an automated test (api-testgen / automate-tc) or run its manual case (run-testcases)');
    else risk(msg, 'Cover it with an automated test, or run its manual case before release');
  }
  for (const id of coverage.manualOnlyRules)
    risk(`Rule ${id} is verified only by a manual run`, 'Automate its manual case (automate-tc)');

  for (const r of manual.filter((m) => m.result === 'failed' || m.result === 'blocked')) {
    const tc = vault.testCases.find((c) => c.id === r.id);
    const ids = [tc?.feature ?? '', ...(tc?.covers ?? [])];
    const critical =
      r.result === 'failed' &&
      ids.some(
        (id) => (vault.feature(id)?.criticality ?? 0) >= 4 || SEVERITY_RANK[vault.rule(id)?.severity ?? 'low'] >= 3,
      );
    const msg = `Manual case ${r.id} ${r.result} (${r.runId})${r.defects.length ? `: ${r.defects.join(', ')}` : ''}`;
    if (critical) blocker(msg, 'Fix and retest (retest-bug), or update the case if it is out of date');
    else risk(msg, r.result === 'blocked' ? 'Unblock and run it' : 'Triage the failure (bug-triage)');
  }
  if (executed && passRate < MIN_PASS_RATE)
    blocker(
      `Pass rate ${(passRate * 100).toFixed(1)} % < ${MIN_PASS_RATE * 100} %`,
      'Stabilise the suite before deciding',
    );
  if (skipped.length) risk(`${skipped.length} tests skipped`, 'Confirm each skip is intended');

  const features = vault.features.map((f) => {
    const ts = ran.filter((t) => traceTags(t).includes(f.id));
    const fFailed = ts.filter((t) => t.status === 'unexpected').length;
    const fFlaky = ts.filter((t) => t.status === 'flaky').length;
    const openDefects = vault.openDefects(f.id).map((d) => d.id);
    return {
      id: f.id,
      title: f.title,
      criticality: f.criticality,
      tests: ts.length,
      failed: fFailed,
      flaky: fFlaky,
      openDefects,
      status: ts.length === 0 ? 'untested' : fFailed ? 'failing' : fFlaky || openDefects.length ? 'at risk' : 'healthy',
    };
  });

  const decision: Decision = findings.some((f) => f.level === 'blocker')
    ? 'NO-GO'
    : findings.length
      ? 'CONDITIONAL GO'
      : 'GO';
  return {
    decision,
    stats: {
      total: ran.length,
      passed: ran.filter((t) => t.status === 'expected').length,
      failed: failed.length,
      flaky: flaky.length,
      skipped: skipped.length,
      knownDefects: knownDefects.length,
      passRate: Math.round(passRate * 1000) / 1000,
      catalog: new Set(catalog.map((t) => `${t.id}/${t.project}`)).size,
    },
    findings,
    features,
  };
}

export function toMarkdown(r: GateReport): string {
  const badge = { GO: '🟢 GO', 'CONDITIONAL GO': '🟡 CONDITIONAL GO', 'NO-GO': '🔴 NO-GO' }[r.decision];
  const s = r.stats;
  const blockers = r.findings.filter((f) => f.level === 'blocker');
  const risks = r.findings.filter((f) => f.level === 'risk');
  return [
    `## Release assessment: ${badge}`,
    '',
    (s.catalog > s.total ? `Impact-selected run: ${s.total} of ${s.catalog} tests.\n\n` : '') +
      `${s.total} test runs · ${s.passed} passed · ${s.failed} failed · ${s.flaky} flaky · ${s.skipped} skipped · ` +
      `${s.knownDefects} known-defect tests (expected to fail) · pass rate ${(s.passRate * 100).toFixed(1)} %`,
    '',
    blockers.length
      ? `### Blockers\n\n${table(
          ['Blocker', 'Required'],
          blockers.map((f) => [f.what, f.mitigation]),
        )}\n`
      : '',
    risks.length
      ? `### Residual risks\n\n${table(
          ['Risk', 'Mitigation'],
          risks.map((f) => [f.what, f.mitigation]),
        )}\n`
      : '',
    '### Features',
    '',
    table(
      ['Feature', 'Criticality', 'Tests', 'Failed', 'Flaky', 'Open defects', 'Status'],
      r.features.map((f) => [
        `${f.id}: ${f.title}`,
        f.criticality,
        f.tests,
        f.failed,
        f.flaky,
        f.openDefects.join(', ') || '-',
        f.status,
      ]),
    ),
    '',
    '### Sign-off',
    '',
    '- [ ] QA lead: evidence reviewed',
    '- [ ] Product owner: residual risks accepted',
  ].join('\n');
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: { results: { type: 'string' }, manual: { type: 'string' }, strict: { type: 'boolean' } },
  });
  const results = readResults(values.results);
  const projects = [...new Set(results.map((t) => t.project))];
  const manual = latestResults(readRuns(values.manual));
  const catalog = withResults(listTests(projects.length ? projects : undefined), results);
  const report = assess(new Vault(), results, catalog, manual);
  const md = toMarkdown(report);
  writeReport('release-gate', report, md);
  setOutputs({ decision: report.decision });
  console.log(md);
  if (values.strict && report.decision === 'NO-GO') process.exit(1);
}
