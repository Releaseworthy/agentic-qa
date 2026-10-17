/**
 * The GitHub Pages report for one CI run: the release decision, the evidence behind it (test results, feature
 * health, business-rule traceability, open defects) and the sign-off, rendered from the JSON the engines write.
 *
 * One self-contained HTML file: inline CSS and script, no external request. A light and a dark theme follow the
 * system setting until the reader picks one with the toggle; the choice is kept in localStorage.
 * `scripts/site-index.ts` gathers the inputs and writes the file.
 */

import type { DefectMetrics, TriageRow } from '@qa/defects';
import type { Decision, Finding, GateReport } from '@qa/release-gate';
import type { TraceRow, Traceability } from '@qa/traceability';

export type RunInfo = {
  /** "#22" in CI, "Local" outside it. */
  label: string;
  /** Full commit sha, when known. */
  sha?: string;
  /** When the tests started, already formatted for people. */
  started?: string;
  durationMs?: number;
  /** Test runs per Playwright project. */
  projects: { name: string; tests: number }[];
  repoUrl: string;
  commitUrl?: string;
  runUrl?: string;
};

export type SiteData = {
  gate: GateReport;
  trace: Traceability;
  triage: { rows: TriageRow[]; metrics: DefectMetrics };
  run: RunInfo;
};

/** localStorage key for the reader's theme choice. */
export const THEME_KEY = 'agentic-qa-theme';

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'pin' | 'neutral';

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value: string | number): string => String(value).replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);
/** Engine text quotes file paths in backticks: they render as code. */
const rich = (text: string): string => esc(text).replace(/`([^`]+)`/g, '<code>$1</code>');
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const pct = (part: number, whole: number): number => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

/** 5541 ms is "5.5 s"; from a minute up, "2 min 5 s". */
export function formatDuration(ms: number): string {
  const tenths = Math.round(ms / 100) / 10;
  if (tenths < 60) return `${tenths.toFixed(1)} s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

const DECISION_TONE: Record<Decision, Tone> = { GO: 'ok', 'CONDITIONAL GO': 'warn', 'NO-GO': 'bad' };
const FEATURE_TONE: Record<string, Tone> = { healthy: 'ok', 'at risk': 'warn', failing: 'bad', untested: 'neutral' };
const SEVERITY_TONE: Record<string, Tone> = { critical: 'bad', high: 'bad', medium: 'warn', low: 'neutral' };
const MANUAL_TONE: Record<string, Tone> = { passed: 'ok', failed: 'bad', blocked: 'warn' };

const ICONS = {
  logo: '<path d="M12 3l8 3v6c0 4.6-3.4 8.3-8 9-4.6-.7-8-4.4-8-9V6z"/><path d="m9 12 2 2 4-4.5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z"/>',
  hash: '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
  commit: '<circle cx="12" cy="12" r="3.5"/><path d="M2 12h6.5M15.5 12H22"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  timer: '<path d="M10 2h4M12 14l3-3"/><circle cx="12" cy="14" r="8"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
} as const;
type IconName = keyof typeof ICONS;

const icon = (name: IconName): string =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
const GITHUB =
  '<svg class="icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';

const pill = (tone: Tone, label: string, dot = true): string =>
  `<span class="pill tone-${tone}">${dot ? '<i aria-hidden="true"></i>' : ''}${esc(label)}</span>`;
const none = (text = 'None'): string => `<span class="none">${esc(text)}</span>`;
const chips = (ids: string[], tone?: Tone): string =>
  ids.length
    ? `<span class="chips">${ids.map((id) => `<code class="chip${tone ? ` tone-${tone}` : ''}">${esc(id)}</code>`).join('')}</span>`
    : none();
const link = (href: string | undefined, html: string): string => (href ? `<a href="${esc(href)}">${html}</a>` : html);
/** The latest manual execution of a set of cases: passed, failed, blocked or not run. */
const manualResult = (result: string): string =>
  `<span class="pill pill--xs tone-${MANUAL_TONE[result] ?? 'neutral'}">${esc(capital(result))}</span>`;

function section(id: string, title: string, body: string, count?: number, lede?: string): string {
  return `<section class="section" id="${id}" aria-labelledby="${id}-title">
<div class="section__head"><div><h2 id="${id}-title">${esc(title)}${count === undefined ? '' : `<span class="count">${count}</span>`}</h2>${lede ? `<p class="section__lede">${esc(lede)}</p>` : ''}</div></div>
${body}
</section>`;
}

function summary(gate: GateReport): { runs: string; findings: string } {
  const s = gate.stats;
  const blockers = gate.findings.filter((f) => f.level === 'blocker').length;
  const risks = gate.findings.length - blockers;
  const runs =
    s.total === 0
      ? 'No test results in this run.'
      : s.failed + s.flaky === 0
        ? `All ${plural(s.total, 'test run')} behaved as expected${s.skipped ? `, ${s.skipped} skipped` : ''}.`
        : `${s.failed} failed and ${s.flaky} flaky out of ${plural(s.total, 'test run')}.`;
  const findings = blockers
    ? `${plural(blockers, 'blocker')} must be resolved before release.`
    : risks
      ? `No blockers; ${plural(risks, 'residual risk')} to accept at sign-off.`
      : 'No blockers and no residual risks.';
  return { runs, findings };
}

function hero(d: SiteData): string {
  const { gate, run } = d;
  const s = gate.stats;
  const tone = DECISION_TONE[gate.decision];
  const { runs, findings } = summary(gate);
  const meta = (name: IconName, label: string, value: string): string =>
    `<div class="meta"><dt>${icon(name)}${esc(label)}</dt><dd>${value}</dd></div>`;
  const rows = [
    meta('hash', 'Run', link(run.runUrl, esc(run.label))),
    run.sha ? meta('commit', 'Commit', link(run.commitUrl, `<code>${esc(run.sha.slice(0, 7))}</code>`)) : '',
    run.started ? meta('clock', 'Started', esc(run.started)) : '',
    run.durationMs === undefined ? '' : meta('timer', 'Duration', esc(formatDuration(run.durationMs))),
    run.projects.length
      ? meta(
          'layers',
          'Projects',
          `<span class="chips">${run.projects.map((p) => `<span class="chip chip--plain">${esc(p.name)} <b>${p.tests}</b></span>`).join('')}</span>`,
        )
      : '',
  ];
  return `<section class="hero card tone-${tone}" id="overview" aria-labelledby="decision">
<span class="hero__glow" aria-hidden="true"></span>
<div class="hero__main">
<h1 id="decision"><span class="eyebrow">Release assessment</span><span class="decision"><span class="decision__dot" aria-hidden="true"></span>${esc(gate.decision)}</span></h1>
<p class="hero__summary"><strong>${esc(runs)}</strong> ${esc(findings)}</p>
${s.catalog > s.total ? `<p class="hero__note">${icon('alert')}Selected by change impact: ${s.total} of ${s.catalog} tests ran.</p>` : ''}
<div class="hero__actions">
<a class="btn btn--primary" href="report/index.html">${icon('play')}Open the Playwright report</a>
${run.runUrl ? `<a class="btn" href="${esc(run.runUrl)}">${GITHUB}Workflow run</a>` : ''}
</div>
</div>
<dl class="hero__meta">${rows.join('')}</dl>
</section>`;
}

function kpis(d: SiteData): string {
  const s = d.gate.stats;
  const executed = s.total - s.skipped;
  const clean = s.passed - s.knownDefects;
  const ringTone: Tone = s.failed ? 'bad' : s.flaky ? 'warn' : 'ok';
  const circumference = 2 * Math.PI * 42;
  const rate = (s.passRate * 100).toFixed(1);
  const segments: [Tone, string, number][] = [
    ['ok', 'Passed', clean],
    ['pin', 'Known defect', s.knownDefects],
    ['bad', 'Failed', s.failed],
    ['warn', 'Flaky', s.flaky],
    ['neutral', 'Skipped', s.skipped],
  ];
  const bar = segments
    .filter(([, , n]) => n > 0)
    .map(([tone, , n]) => `<span class="seg tone-${tone}" style="width:${pct(n, s.total)}%"></span>`)
    .join('');
  const legend = segments
    .map(([tone, label, n]) => `<li><i class="dot tone-${tone}" aria-hidden="true"></i>${label} <b>${n}</b></li>`)
    .join('');
  const rules = d.trace.rows.filter((r) => r.kind === 'rule');
  const verified = rules.filter((r) => r.status === 'covered' || r.status === 'manual').length;
  const failingRules = rules.filter((r) => r.status === 'failing').length;
  const rulesTone: Tone = failingRules ? 'bad' : verified === rules.length ? 'ok' : 'warn';
  const m = d.triage.metrics;
  const blockers = d.triage.rows.filter((r) => r.blocker).length;
  const bySeverity = Object.entries(m.openBySeverity);
  return `<section class="kpis" aria-label="Key figures">
<article class="card kpi kpi--ring">
<div class="ring tone-${ringTone}" role="img" aria-label="Pass rate ${rate} %">
<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="ring__track" cx="50" cy="50" r="42"/><circle class="ring__value" cx="50" cy="50" r="42" stroke-dasharray="${(s.passRate * circumference).toFixed(1)} ${circumference.toFixed(1)}"/></svg>
<span class="ring__label"><span>${rate}<small>%</small></span></span>
</div>
<div class="kpi__text"><p class="kpi__label">Pass rate</p><p class="kpi__hint">${plural(executed, 'executed run')}</p><p class="kpi__hint">${s.failed} failed, ${s.flaky} flaky</p></div>
</article>
<article class="card kpi">
<p class="kpi__label">Test runs</p>
<p class="kpi__value">${s.total}</p>
<div class="stack" role="img" aria-label="${segments.map(([, label, n]) => `${label} ${n}`).join(', ')}">${bar}</div>
<ul class="legend">${legend}</ul>
</article>
<article class="card kpi">
<p class="kpi__label">Business rules verified</p>
<p class="kpi__value">${verified}<span class="kpi__of">/${rules.length}</span></p>
<div class="bar tone-${rulesTone}"><span style="width:${pct(verified, rules.length)}%"></span></div>
<p class="kpi__hint">By a passing test or a passing manual run${failingRules ? `; ${failingRules} failing` : ''}</p>
</article>
<article class="card kpi">
<p class="kpi__label">Open defects</p>
<p class="kpi__value">${m.open}<span class="kpi__of"> of ${m.total}</span></p>
<div class="chips">${bySeverity.length ? bySeverity.map(([sev, n]) => pill(SEVERITY_TONE[sev] ?? 'neutral', `${n} ${sev}`)).join('') : pill('ok', 'none open')}</div>
<p class="kpi__hint">${blockers ? plural(blockers, 'release blocker') : 'No release blockers'}</p>
</article>
</section>`;
}

function findingsSection(list: Finding[]): string {
  if (!list.length)
    return section(
      'findings',
      'Findings',
      `<div class="card empty">${icon('check')}No blockers and no residual risks.</div>`,
      0,
    );
  const ordered = [...list.filter((f) => f.level === 'blocker'), ...list.filter((f) => f.level === 'risk')];
  const items = ordered
    .map((f) => {
      const blocker = f.level === 'blocker';
      const tone: Tone = blocker ? 'bad' : 'warn';
      return `<li class="finding">
<span class="finding__icon tone-${tone}">${icon(blocker ? 'x' : 'alert')}</span>
<div class="finding__body"><p class="finding__what">${rich(f.what)}</p><p class="finding__fix"><span>${blocker ? 'Required' : 'Mitigation'}</span>${rich(f.mitigation)}</p></div>
${pill(tone, blocker ? 'Blocker' : 'Residual risk')}
</li>`;
    })
    .join('');
  return section(
    'findings',
    'Findings',
    `<ul class="card findings">${items}</ul>`,
    list.length,
    'Blockers stop the release. Residual risks are accepted at sign-off, each with its mitigation.',
  );
}

function featuresSection(d: SiteData): string {
  const trace = new Map(d.trace.rows.map((r) => [r.id, r]));
  const cards = d.gate.features
    .map((f) => {
      const t = trace.get(f.id);
      const ran = t ? t.tests - t.notRun : f.tests;
      const passing = t ? t.passing : f.tests - f.failed;
      const bars = Array.from({ length: 5 }, (_, i) => `<i${i < f.criticality ? ' class="on"' : ''}></i>`).join('');
      const manual = t?.manual ?? [];
      return `<article class="card feature">
<div class="feature__top"><code class="id">${esc(f.id)}</code>${pill(FEATURE_TONE[f.status] ?? 'neutral', capital(f.status))}</div>
<h3>${esc(f.title)}</h3>
<div class="crit" role="img" aria-label="Criticality ${f.criticality} of 5"><span class="crit__bars" aria-hidden="true">${bars}</span>Criticality ${f.criticality}/5</div>
<dl class="stats">
<div><dt>Passing</dt><dd>${passing}<small>/${ran}</small></dd></div>
<div><dt>Failed</dt><dd${f.failed ? ' class="is-bad"' : ''}>${f.failed}</dd></div>
<div><dt>Flaky</dt><dd${f.flaky ? ' class="is-warn"' : ''}>${f.flaky}</dd></div>
</dl>
${t?.notRun ? `<p class="feature__note">${t.notRun} more not selected in this run</p>` : ''}
<div class="kv"><div class="kv__head"><span>Manual cases</span>${manual.length && t ? manualResult(t.manualResult) : ''}</div>${chips(manual)}</div>
<div class="kv"><div class="kv__head"><span>Open defects</span></div>${chips(f.openDefects, 'bad')}</div>
</article>`;
    })
    .join('');
  return section(
    'features',
    'Features',
    `<div class="features">${cards}</div>`,
    d.gate.features.length,
    'Health per feature: automated results, manual cases and open defects.',
  );
}

const TRACE_STATUS: Record<TraceRow['status'], [Tone, string]> = {
  covered: ['ok', 'Verified'],
  failing: ['bad', 'Failing'],
  manual: ['info', 'Manual only'],
  untested: ['warn', 'Untested'],
};

function rulesSection(t: Traceability): string {
  const rules = t.rows.filter((r) => r.kind === 'rule');
  const rows = rules
    .map((r) => {
      const ran = r.tests - r.notRun;
      const [tone, label] = TRACE_STATUS[r.status];
      const automated = r.tests
        ? `<div class="meter"><span class="bar tone-${r.failing ? 'bad' : 'ok'}"><span style="width:${pct(r.passing, ran)}%"></span></span><span class="meter__text">${r.passing}/${ran}</span></div>${r.notRun ? `<span class="none">${r.notRun} not run</span>` : ''}`
        : none('No automated test');
      const manual = r.manual.length ? `${chips(r.manual)}${manualResult(r.manualResult)}` : none();
      return `<tr>
<td data-label="Rule"><div class="rule"><code class="id">${esc(r.id)}</code><span>${esc(r.title)}</span></div></td>
<td data-label="Severity">${pill(SEVERITY_TONE[r.weight] ?? 'neutral', capital(r.weight), false)}</td>
<td data-label="Automated"><div class="cell-stack">${automated}</div></td>
<td data-label="Manual cases"><div class="cell-stack">${manual}</div></td>
<td data-label="Open defects">${chips(r.defects, 'bad')}</td>
<td data-label="Status">${pill(tone, label)}</td>
</tr>`;
    })
    .join('');
  const notes = [
    t.untestedRules.length
      ? `<p class="callout tone-warn">${icon('alert')}Rules nothing verifies: ${esc(t.untestedRules.join(', '))}</p>`
      : `<p class="callout tone-ok">${icon('check')}Every business rule is verified.</p>`,
    t.manualOnlyRules.length
      ? `<p class="callout tone-info">${icon('user')}Rules only a manual run verifies: ${esc(t.manualOnlyRules.join(', '))}</p>`
      : '',
    t.untaggedTests.length
      ? `<p class="callout tone-warn">${icon('alert')}${plural(t.untaggedTests.length, 'test')} carry no @FEAT tag.</p>`
      : '',
  ].join('');
  return section(
    'rules',
    'Business rules',
    `<div class="card table-card"><div class="table-scroll"><table>
<thead><tr><th scope="col">Rule</th><th scope="col">Severity</th><th scope="col">Automated</th><th scope="col">Manual cases (last run)</th><th scope="col">Open defects</th><th scope="col">Status</th></tr></thead>
<tbody>${rows}</tbody>
</table></div></div>
<div class="callouts">${notes}</div>`,
    rules.length,
    'Traceability from each rule to the tests and manual cases that verify it.',
  );
}

function defectsSection(triage: SiteData['triage']): string {
  const m = triage.metrics;
  const cards = triage.rows
    .map((r) => {
      const differs = r.recorded !== '' && r.recorded !== r.suggested;
      return `<article class="card defect">
<div class="defect__top"><code class="id">${esc(r.id)}</code>${pill(SEVERITY_TONE[r.severity] ?? 'neutral', capital(r.severity))}${pill('neutral', capital(r.status), false)}${r.blocker ? pill('bad', 'Release blocker') : ''}</div>
<h3>${esc(r.title)}</h3>
<dl class="facts">
<div><dt>Feature</dt><dd><code class="chip">${esc(r.feature)}</code></dd></div>
<div><dt>Priority</dt><dd>${esc(r.suggested)} <span class="muted">suggested</span>${r.recorded ? `, ${esc(r.recorded)} <span class="muted">recorded</span>` : ''}${differs ? ` ${pill('warn', 'differs', false)}` : ''}</dd></div>
<div><dt>Age</dt><dd>${r.ageDays === null ? none('Unknown') : esc(plural(r.ageDays, 'day'))}</dd></div>
<div><dt>Possible duplicates</dt><dd>${r.duplicates.length ? chips(r.duplicates) : none()}</dd></div>
</dl>
<div class="pinned"><span class="label">Pinned by</span>${r.pinnedBy.length ? r.pinnedBy.map((p) => `<code>${esc(p)}</code>`).join('') : none('No test yet')}</div>
<p class="next">${icon('arrow')}<span><b>Next:</b> ${esc(r.next)}</span></p>
</article>`;
    })
    .join('');
  const kv = (r: Record<string, number>): string => {
    const entries = Object.entries(r);
    return entries.length
      ? `<span class="chips">${entries.map(([k, v]) => `<span class="chip chip--plain">${esc(k)} <b>${v}</b></span>`).join('')}</span>`
      : none();
  };
  const metric = (label: string, value: string): string =>
    `<div class="metric"><dt>${esc(label)}</dt><dd>${value}</dd></div>`;
  const metrics = [
    metric('Open', `<b>${m.open} of ${m.total}</b>`),
    metric('Mean open age', `<b>${m.meanOpenAgeDays === null ? 'Unknown' : esc(plural(m.meanOpenAgeDays, 'day'))}</b>`),
    metric('Reopened', `<b>${m.reopened}</b>`),
    metric('By status', kv(m.byStatus)),
    metric('Open by severity', kv(m.openBySeverity)),
    metric('Found by', kv(m.foundBy)),
    Object.keys(m.rejectedBy).length ? metric('Rejected', kv(m.rejectedBy)) : '',
  ].join('');
  return section(
    'defects',
    'Defect triage',
    `<div class="triage">
${cards ? `<div class="defects">${cards}</div>` : `<div class="card empty">${icon('check')}No open defects.</div>`}
<div class="card metrics"><p class="metrics__title">Defect metrics, whole history</p><dl>${metrics}</dl></div>
</div>`,
    triage.rows.length,
    'Open defects with their suggested priority, the test that pins each one and the next step.',
  );
}

function signoffSection(): string {
  const row = (who: string, what: string): string =>
    `<div class="signoff__row"><span class="signoff__box" aria-hidden="true"></span><div class="signoff__who"><b>${who}</b><span>${what}</span></div>${pill('neutral', 'Not signed yet', false)}</div>`;
  return section(
    'signoff',
    'Sign-off',
    `<div class="card signoff">${row('QA lead', 'Evidence reviewed')}${row('Product owner', 'Residual risks accepted')}</div>`,
    undefined,
    'The gate recommends; people decide. The release goes out once both have signed.',
  );
}

const LIGHT = {
  bg: '#f5f7fa',
  'glow-a': 'rgb(20 184 166 / 12%)',
  'glow-b': 'rgb(99 102 241 / 8%)',
  surface: '#ffffff',
  'surface-2': '#f8fafc',
  'surface-3': '#eef2f6',
  border: '#e3e8ef',
  'border-strong': '#cfd7e2',
  text: '#0b1220',
  muted: '#526072',
  accent: '#0f766e',
  'accent-strong': '#0d9488',
  'accent-soft': 'rgb(13 148 136 / 9%)',
  'btn-bg': '#0f766e',
  'btn-hover': '#115e59',
  'btn-ink': '#ffffff',
  'code-bg': '#f1f5f9',
  shadow: '0 1px 2px rgb(16 24 40 / 4%), 0 12px 32px -18px rgb(16 24 40 / 18%)',
  ok: '#15803d',
  'ok-bg': '#dcfce7',
  'ok-solid': '#22c55e',
  warn: '#b45309',
  'warn-bg': '#fef3c7',
  'warn-solid': '#f59e0b',
  bad: '#b91c1c',
  'bad-bg': '#fee2e2',
  'bad-solid': '#ef4444',
  info: '#1d4ed8',
  'info-bg': '#dbeafe',
  'info-solid': '#3b82f6',
  pin: '#6d28d9',
  'pin-bg': '#ede9fe',
  'pin-solid': '#8b5cf6',
  neutral: '#475569',
  'neutral-bg': '#eef2f6',
  'neutral-solid': '#94a3b8',
};

const DARK: typeof LIGHT = {
  bg: '#090d12',
  'glow-a': 'rgb(45 212 191 / 9%)',
  'glow-b': 'rgb(129 140 248 / 7%)',
  surface: '#10161e',
  'surface-2': '#141b24',
  'surface-3': '#1c2531',
  border: '#222c39',
  'border-strong': '#2f3b4b',
  text: '#e8eef5',
  muted: '#9babbc',
  accent: '#5eead4',
  'accent-strong': '#2dd4bf',
  'accent-soft': 'rgb(45 212 191 / 11%)',
  'btn-bg': '#2dd4bf',
  'btn-hover': '#5eead4',
  'btn-ink': '#042f2a',
  'code-bg': '#0c1218',
  shadow: '0 1px 0 rgb(255 255 255 / 3%) inset, 0 16px 40px -20px rgb(0 0 0 / 70%)',
  ok: '#4ade80',
  'ok-bg': 'rgb(34 197 94 / 14%)',
  'ok-solid': '#22c55e',
  warn: '#fbbf24',
  'warn-bg': 'rgb(245 158 11 / 14%)',
  'warn-solid': '#f59e0b',
  bad: '#f87171',
  'bad-bg': 'rgb(239 68 68 / 15%)',
  'bad-solid': '#ef4444',
  info: '#93c5fd',
  'info-bg': 'rgb(59 130 246 / 16%)',
  'info-solid': '#3b82f6',
  pin: '#c4b5fd',
  'pin-bg': 'rgb(139 92 246 / 17%)',
  'pin-solid': '#8b5cf6',
  neutral: '#a3b1c2',
  'neutral-bg': 'rgb(148 163 184 / 12%)',
  'neutral-solid': '#64748b',
};

const tokens = (theme: typeof LIGHT): string =>
  Object.entries(theme)
    .map(([k, v]) => `--${k}:${v};`)
    .join('');

const TONES: Tone[] = ['ok', 'warn', 'bad', 'info', 'pin', 'neutral'];

const CSS = `
:root{${tokens(LIGHT)}color-scheme:light;--sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;--mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;--radius:16px}
:root[data-theme="dark"]{${tokens(DARK)}color-scheme:dark}
@media (prefers-color-scheme:dark){:root:not([data-theme]){${tokens(DARK)}color-scheme:dark}}
${TONES.map((t) => `.tone-${t}{--tone:var(--${t});--tone-bg:var(--${t}-bg);--tone-solid:var(--${t}-solid)}`).join('\n')}
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:84px}
body{margin:0;font:15px/1.55 var(--sans);color:var(--text);background:var(--bg);-webkit-font-smoothing:antialiased}
.page-glow{position:absolute;inset:61px 0 auto;z-index:-1;height:380px;background:radial-gradient(55% 100% at 15% 0,var(--glow-a),transparent 70%),radial-gradient(45% 90% at 95% 0,var(--glow-b),transparent 70%);pointer-events:none}
a{color:var(--accent);text-underline-offset:3px}
code{font-family:var(--mono);font-size:.9em}
h1,h2,h3,p{margin:0}
.icon{width:18px;height:18px;flex:none}
:focus-visible{outline:2px solid var(--accent-strong);outline-offset:2px;border-radius:6px}
.wrap{width:min(100% - 32px,1160px);margin-inline:auto}
.skip{position:absolute;left:16px;top:-60px;z-index:20;padding:8px 14px;border-radius:10px;background:var(--btn-bg);color:var(--btn-ink);font-weight:600;text-decoration:none}
.skip:focus{top:12px}
.topbar{position:sticky;top:0;z-index:10;background:var(--bg);background:color-mix(in srgb,var(--bg) 80%,transparent);-webkit-backdrop-filter:saturate(160%) blur(14px);backdrop-filter:saturate(160%) blur(14px);border-bottom:1px solid var(--border)}
.topbar__in{display:flex;align-items:center;gap:16px;height:60px}
.brand{display:flex;align-items:center;gap:10px;color:var(--text);text-decoration:none;font-weight:700;letter-spacing:-.01em;white-space:nowrap}
.brand__mark{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,#2dd4bf,#0f766e);color:#fff;box-shadow:0 6px 14px -6px rgb(13 148 136 / 70%)}
.brand__mark .icon{width:17px;height:17px}
.brand__sep{color:var(--border-strong);font-weight:400}
.brand__sub{color:var(--muted);font-weight:500}
.nav{display:flex;gap:2px;margin-left:8px}
.nav a{padding:6px 10px;border-radius:8px;color:var(--muted);text-decoration:none;font-size:14px;font-weight:500}
.nav a:hover{color:var(--text);background:var(--surface-3)}
.topbar__end{display:flex;align-items:center;gap:8px;margin-left:auto}
.icon-btn{display:inline-grid;place-items:center;width:38px;height:38px;padding:0;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--muted);cursor:pointer;text-decoration:none}
.icon-btn:hover{color:var(--text);border-color:var(--border-strong)}
.theme-toggle .icon-sun{display:none}
:root[data-theme="dark"] .theme-toggle .icon-sun{display:block}
:root[data-theme="dark"] .theme-toggle .icon-moon{display:none}
.btn{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 16px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font-size:14px;font-weight:600;text-decoration:none;white-space:nowrap}
.btn:hover{border-color:var(--border-strong);background:var(--surface-2)}
.btn .icon{width:16px;height:16px}
.btn--primary{border-color:transparent;background:var(--btn-bg);color:var(--btn-ink);box-shadow:0 8px 20px -10px var(--accent-strong)}
.btn--primary:hover{border-color:transparent;background:var(--btn-hover)}
.btn--sm{height:38px;padding:0 12px;font-size:13px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow)}
main{padding-bottom:24px}
.hero{position:relative;overflow:hidden;display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:32px;margin-top:28px;padding:32px}
.hero__glow{position:absolute;top:-220px;right:-140px;width:540px;height:540px;background:radial-gradient(closest-side,var(--tone-bg),transparent);pointer-events:none}
.hero__main,.hero__meta{position:relative}
.eyebrow{display:block;margin-bottom:12px;color:var(--accent);font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}
.decision{display:flex;align-items:center;gap:16px;color:var(--tone);font-size:clamp(34px,5.4vw,52px);font-weight:800;line-height:1.02;letter-spacing:-.035em}
.decision__dot{position:relative;flex:none;width:14px;height:14px;border-radius:50%;background:var(--tone-solid);box-shadow:0 0 0 6px var(--tone-bg)}
.decision__dot::after{content:"";position:absolute;inset:0;border-radius:50%;background:var(--tone-solid);animation:pulse 2.4s ease-out infinite}
@keyframes pulse{from{transform:scale(1);opacity:.55}to{transform:scale(3.2);opacity:0}}
.hero__summary{max-width:58ch;margin-top:18px;color:var(--muted);font-size:17px}
.hero__summary strong{color:var(--text);font-weight:600}
.hero__note{display:inline-flex;align-items:center;gap:8px;margin-top:14px;padding:6px 12px;border-radius:999px;background:var(--warn-bg);color:var(--warn);font-size:13px;font-weight:600}
.hero__note .icon{width:15px;height:15px}
.hero__actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:26px}
.hero__meta{align-self:start;margin:0;padding:6px;border:1px solid var(--border);border-radius:14px;background:var(--surface-2)}
.meta{display:flex;align-items:center;gap:12px;padding:11px 12px}
.meta+.meta{border-top:1px solid var(--border)}
.meta .icon{width:16px;height:16px}
.meta dt{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:13px;white-space:nowrap}
.meta dd{margin:0 0 0 auto;font-size:14px;font-weight:600;text-align:right}
.meta dd a{color:var(--text)}
.meta .chips{justify-content:flex-end}
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-top:16px}
.kpi{display:flex;flex-direction:column;gap:10px;min-width:0;padding:20px}
.kpi--ring{flex-direction:row;align-items:center;gap:18px}
.kpi__text{display:flex;flex-direction:column;gap:4px}
.kpi__label{color:var(--muted);font-size:13px;font-weight:600}
.kpi__value{font-size:34px;font-weight:750;line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.kpi__of{color:var(--muted);font-size:17px;font-weight:600;letter-spacing:0}
.kpi__hint{color:var(--muted);font-size:13px}
.ring{position:relative;flex:none;width:96px;height:96px}
.ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.ring circle{fill:none;stroke-width:9}
.ring__track{stroke:var(--surface-3)}
.ring__value{stroke:var(--tone-solid);stroke-linecap:round}
.ring__label{position:absolute;inset:0;display:grid;place-items:center;font-size:19px;font-weight:750;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.ring__label>span{padding:2px 4px;border-radius:999px;background:var(--surface)}
.ring__label small{font-size:12px;color:var(--muted);font-weight:600}
.stack{display:flex;gap:2px;height:10px;overflow:hidden;border-radius:999px;background:var(--surface-3)}
.seg{display:block;height:100%;background:var(--tone-solid)}
.legend{display:flex;flex-wrap:wrap;gap:4px 12px;margin:0;padding:0;list-style:none;color:var(--muted);font-size:12.5px}
.legend li{display:inline-flex;align-items:center;gap:6px}
.legend b{color:var(--text);font-variant-numeric:tabular-nums}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--tone-solid)}
.bar{display:block;height:8px;overflow:hidden;border-radius:999px;background:var(--surface-3)}
.bar>span{display:block;height:100%;border-radius:inherit;background:var(--tone-solid)}
.section{margin-top:52px}
.section__head{margin-bottom:16px}
h2{display:flex;align-items:center;gap:10px;font-size:21px;font-weight:700;letter-spacing:-.015em}
.count{display:inline-grid;place-items:center;min-width:26px;height:22px;padding:0 8px;border-radius:999px;background:var(--surface-3);color:var(--muted);font-size:12px;font-weight:700}
.section__lede{margin-top:4px;color:var(--muted);font-size:14px}
.pill{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:999px;background:var(--tone-bg);color:var(--tone);font-size:12px;font-weight:650;white-space:nowrap}
.pill i{width:6px;height:6px;border-radius:50%;background:currentColor}
.chips{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.chip{padding:2px 8px;border:1px solid var(--border);border-radius:7px;background:var(--surface-2);color:var(--text);font-family:var(--mono);font-size:12px;white-space:nowrap}
.chip.tone-bad{border-color:transparent;background:var(--tone-bg);color:var(--tone)}
.chip--plain{font-family:var(--sans);font-size:12.5px;color:var(--muted)}
.chip--plain b{color:var(--text);font-variant-numeric:tabular-nums}
.id{padding:2px 8px;border-radius:7px;background:var(--surface-3);color:var(--muted);font-size:12px;font-weight:600;white-space:nowrap}
.none,.muted{color:var(--muted)}
.none{font-size:13px}
.empty{display:flex;align-items:center;gap:12px;padding:18px 20px;color:var(--muted);font-weight:500}
.empty .icon{color:var(--ok)}
.findings{margin:0;padding:6px;list-style:none}
.finding{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:start;padding:14px}
.finding+.finding{border-top:1px solid var(--border)}
.finding__icon{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:var(--tone-bg);color:var(--tone)}
.finding__what{font-weight:600;overflow-wrap:anywhere}
.finding__fix{margin-top:6px;color:var(--muted);font-size:14px}
.finding__fix span{margin-right:8px;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase}
.features{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.feature{display:flex;flex-direction:column;gap:14px;padding:20px}
.feature__top{display:flex;align-items:center;justify-content:space-between;gap:8px}
h3{font-size:16px;font-weight:650;letter-spacing:-.01em}
.crit{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:12.5px}
.crit__bars{display:inline-flex;gap:3px}
.crit__bars i{width:14px;height:6px;border-radius:3px;background:var(--surface-3)}
.crit__bars i.on{background:var(--accent-strong)}
.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0}
.stats div{padding:10px 12px;border:1px solid var(--border);border-radius:11px;background:var(--surface-2)}
.stats dt{color:var(--muted);font-size:12px}
.stats dd{margin:2px 0 0;font-size:19px;font-weight:700;font-variant-numeric:tabular-nums}
.stats dd small{color:var(--muted);font-size:13px;font-weight:600}
.stats .is-bad{color:var(--bad)}
.stats .is-warn{color:var(--warn)}
.feature__note{color:var(--muted);font-size:12.5px}
.kv{display:flex;flex-direction:column;gap:6px}
.kv__head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:20px}
.kv__head>span:first-child{color:var(--muted);font-size:12px;font-weight:600}
.pill--xs{height:20px;padding:0 8px;font-size:11px}
.table-card{overflow:hidden}
.table-scroll{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:14px}
th{padding:12px 16px;border-bottom:1px solid var(--border);background:var(--surface-2);color:var(--muted);font-size:11.5px;font-weight:700;letter-spacing:.06em;text-align:left;text-transform:uppercase;white-space:nowrap}
td{padding:12px 16px;border-bottom:1px solid var(--border);vertical-align:middle}
tbody tr:last-child td{border-bottom:0}
tbody tr:hover td{background:var(--surface-2)}
.rule{display:flex;flex-direction:column;align-items:flex-start;gap:5px;min-width:220px}
.rule span{font-weight:600}
.meter{display:flex;align-items:center;gap:10px;min-width:120px}
.meter .bar{flex:1;height:6px}
.meter__text{font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}
.cell-stack{display:flex;flex-direction:column;align-items:flex-start;gap:6px}
.cell-stack>.meter{align-self:stretch}
.callouts{display:grid;gap:8px;margin-top:12px}
.callout{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:12px;background:var(--tone-bg);color:var(--tone);font-size:14px;font-weight:600}
.triage{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:16px;align-items:start}
.defects{display:grid;gap:16px}
.defect{display:flex;flex-direction:column;gap:14px;padding:20px}
.defect__top{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 16px;margin:0}
.facts dt{color:var(--muted);font-size:12px;font-weight:600}
.facts dd{margin:3px 0 0;font-size:14px;font-weight:550}
.pinned{display:flex;flex-direction:column;gap:6px}
.label{color:var(--muted);font-size:12px;font-weight:600}
.pinned code{display:block;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--code-bg);font-size:12px;line-height:1.5;overflow-wrap:anywhere}
.next{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:var(--accent-soft);font-size:14px}
.next .icon{width:16px;height:16px;color:var(--accent)}
.metrics{padding:6px 20px}
.metrics__title{padding:14px 0 6px;color:var(--muted);font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.metrics dl{margin:0}
.metric{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0}
.metric+.metric{border-top:1px solid var(--border)}
.metric dt{color:var(--muted);font-size:13.5px;white-space:nowrap}
.metric dd{margin:0;text-align:right}
.metric .chips{justify-content:flex-end}
.metric b{font-size:15px;font-variant-numeric:tabular-nums}
.signoff__row{display:flex;align-items:center;gap:14px;padding:16px 20px}
.signoff__row+.signoff__row{border-top:1px solid var(--border)}
.signoff__box{flex:none;width:20px;height:20px;border:2px solid var(--border-strong);border-radius:6px}
.signoff__who{display:flex;flex-direction:column}
.signoff__who b{font-weight:650}
.signoff__who span{color:var(--muted);font-size:14px}
.signoff__row .pill{margin-left:auto}
.footer{margin-top:64px;padding:28px 0 44px;border-top:1px solid var(--border);color:var(--muted);font-size:13px}
.footer__in{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px 24px}
.footer a{color:var(--muted)}
.footer a:hover{color:var(--text)}
body,.card,.topbar,.btn,.icon-btn,.chip,.stats div,.hero__meta,th,td{transition:background-color .2s ease,border-color .2s ease,color .2s ease}
@media (max-width:1080px){.nav{display:none}.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.features{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:900px){.triage{grid-template-columns:1fr}}
@media (max-width:640px){thead{display:none}table,tbody,tr,td{display:block}tr{padding:14px 16px;border-bottom:1px solid var(--border)}tbody tr:last-child{border-bottom:0}td,tbody tr:last-child td{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0;border:0}td::before{content:attr(data-label);flex:none;color:var(--muted);font-size:12px;font-weight:600}td:first-child{display:block;padding:0 0 8px}td:first-child::before{content:none}tbody tr:hover td{background:none}.rule{min-width:0}.cell-stack{align-items:flex-end}.cell-stack>.meter{align-self:auto;width:170px;min-width:0}}
@media (max-width:760px){.hero{grid-template-columns:1fr;gap:24px;padding:24px}.hero__glow{display:none}.features{grid-template-columns:1fr}.brand__sep,.brand__sub{display:none}.finding{grid-template-columns:auto minmax(0,1fr)}.finding .pill{grid-column:2;justify-self:start}}
@media (max-width:520px){.kpis{grid-template-columns:1fr}.facts{grid-template-columns:1fr}.btn__text{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.btn--sm{width:38px;padding:0;justify-content:center}.hero__actions .btn{flex:1 1 100%;justify-content:center}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}html{scroll-behavior:auto}}
@media print{.topbar,.skip,.page-glow,.hero__glow{display:none}.card{box-shadow:none;break-inside:avoid}}
`;

/**
 * Runs in <head> before the first paint: the saved theme, or the system one, on <html data-theme>; then wires the
 * toggle, follows system changes while nothing is saved, and syncs other open tabs.
 */
const THEME_SCRIPT = `(() => {
  const root = document.documentElement;
  const key = ${JSON.stringify(THEME_KEY)};
  const media = matchMedia('(prefers-color-scheme: dark)');
  const read = () => { try { const v = localStorage.getItem(key); return v === 'light' || v === 'dark' ? v : null; } catch { return null; } };
  let chosen = read();
  const apply = () => {
    root.dataset.theme = chosen ?? (media.matches ? 'dark' : 'light');
    const button = document.querySelector('[data-theme-toggle]');
    if (button) button.setAttribute('aria-pressed', String(root.dataset.theme === 'dark'));
  };
  apply();
  media.addEventListener('change', apply);
  addEventListener('storage', (event) => { if (event.key === key) { chosen = read(); apply(); } });
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.querySelector('[data-theme-toggle]');
    if (!button) return;
    button.hidden = false;
    button.addEventListener('click', () => {
      chosen = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(key, chosen); } catch {}
      apply();
    });
    apply();
  });
})();`;

const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0f766e"/><g fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" transform="translate(4 4)"><path d="M12 3l8 3v6c0 4.6-3.4 8.3-8 9-4.6-.7-8-4.4-8-9V6z"/><path d="m9 12 2 2 4-4.5"/></g></svg>',
)}`;

export function renderSite(d: SiteData): string {
  const { runs, findings } = summary(d.gate);
  const description = `${d.gate.decision}: ${runs} ${findings}`;
  const repo = esc(d.run.repoUrl);
  const sections: [string, string][] = [
    ['overview', 'Overview'],
    ['findings', 'Findings'],
    ['features', 'Features'],
    ['rules', 'Rules'],
    ['defects', 'Defects'],
    ['signoff', 'Sign-off'],
  ];
  const nav = sections.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('');
  const data = (file: string, label: string): string => `<a href="${file}">${label}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${esc(d.gate.decision)} · agentic-qa QA report</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="agentic-qa QA report: ${esc(d.gate.decision)}">
<meta property="og:description" content="${esc(description)}">
<link rel="icon" href="${FAVICON}">
<script>${THEME_SCRIPT}</script>
<style>${CSS}</style>
</head>
<body>
<div class="page-glow" aria-hidden="true"></div>
<a class="skip" href="#main">Skip to the report</a>
<header class="topbar">
<div class="wrap topbar__in">
<a class="brand" href="#overview"><span class="brand__mark">${icon('logo')}</span>agentic-qa<span class="brand__sep">/</span><span class="brand__sub">QA report</span></a>
<nav class="nav" aria-label="Sections">${nav}</nav>
<div class="topbar__end">
<a class="btn btn--sm" href="report/index.html">${icon('play')}<span class="btn__text">Playwright report</span></a>
<a class="icon-btn" href="${repo}" aria-label="Repository on GitHub">${GITHUB}</a>
<button class="icon-btn theme-toggle" type="button" data-theme-toggle aria-pressed="false" aria-label="Dark theme" title="Switch between light and dark" hidden><span class="icon-moon">${icon('moon')}</span><span class="icon-sun">${icon('sun')}</span></button>
</div>
</div>
</header>
<main id="main" class="wrap">
${hero(d)}
${kpis(d)}
${findingsSection(d.gate.findings)}
${featuresSection(d)}
${rulesSection(d.trace)}
${defectsSection(d.triage)}
${signoffSection()}
</main>
<footer class="footer">
<div class="wrap footer__in">
<p>Built by <code>scripts/site-index.ts</code> from the release gate, traceability and triage engines in <a href="${repo}">agentic-qa</a>.</p>
<p>Markdown: ${data('release-gate.md', 'gate')}, ${data('traceability.md', 'traceability')}, ${data('triage.md', 'triage')}. JSON: ${data('release-gate.json', 'gate')}, ${data('traceability.json', 'traceability')}, ${data('triage.json', 'triage')}.</p>
</div>
</footer>
</body>
</html>
`;
}
