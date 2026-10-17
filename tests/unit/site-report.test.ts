import { describe, expect, it } from 'bun:test';
import type { GateReport } from '@qa/release-gate';
import { formatDuration, renderSite, THEME_KEY, type SiteData } from '@qa/site-report';
import type { TraceRow } from '@qa/traceability';
import { formatInZone, fromIso } from '@utils/date';

const row = (over: Partial<TraceRow>): TraceRow => ({
  id: 'BR-CART-01',
  kind: 'rule',
  title: '1 to 10 units per cart line',
  weight: 'high',
  tests: 3,
  passing: 3,
  failing: 0,
  notRun: 0,
  manual: [],
  manualResult: 'not run',
  defects: [],
  status: 'covered',
  ...over,
});

const gate = (over: Partial<GateReport> = {}): GateReport => ({
  decision: 'CONDITIONAL GO',
  stats: { total: 10, passed: 10, failed: 0, flaky: 0, skipped: 0, knownDefects: 1, passRate: 1, catalog: 10 },
  findings: [
    {
      level: 'risk',
      what: 'Open low defect DEF-001: <b>lower case</b> in `tests/api/orders.spec.ts`',
      mitigation: 'Release note',
    },
  ],
  features: [
    {
      id: 'FEAT-CART',
      title: 'Shopping cart',
      criticality: 4,
      tests: 10,
      failed: 0,
      flaky: 0,
      openDefects: [],
      status: 'healthy',
    },
  ],
  ...over,
});

const data = (over: Partial<SiteData> = {}): SiteData => ({
  gate: gate(),
  trace: {
    rows: [
      row({
        id: 'FEAT-CART',
        kind: 'feature',
        title: 'Shopping cart',
        weight: 'criticality 4',
        tests: 10,
        passing: 10,
      }),
      row({ manual: ['TC-CART-001'] }),
      row({
        id: 'BR-COUP-01',
        title: 'One coupon per cart',
        weight: 'medium',
        tests: 0,
        passing: 0,
        status: 'untested',
      }),
    ],
    untestedRules: ['BR-COUP-01'],
    manualOnlyRules: [],
    untaggedTests: [],
  },
  triage: {
    rows: [],
    metrics: {
      total: 1,
      open: 0,
      byStatus: { closed: 1 },
      openBySeverity: {},
      openByFeature: {},
      foundBy: {},
      rejectedBy: {},
      meanOpenAgeDays: null,
      reopened: 0,
    },
  },
  run: { label: '#22', projects: [{ name: 'api', tests: 10 }], repoUrl: 'https://github.com/o/r' },
  ...over,
});

/** The page text people read: tags, the inline script and the stylesheet removed. */
const visibleText = (html: string): string =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

describe('renderSite', () => {
  it('leads with the decision and a summary of the evidence', () => {
    const html = renderSite(data());
    expect(html).toContain('<title>CONDITIONAL GO · agentic-qa QA report</title>');
    expect(html).toContain('class="hero card tone-warn"');
    expect(visibleText(html)).toContain('All 10 test runs behaved as expected. No blockers; 1 residual risk to accept');
  });

  it('turns blockers into a red NO-GO, and an empty finding list into a clear GO', () => {
    const blocked = renderSite(
      data({ gate: gate({ decision: 'NO-GO', findings: [{ level: 'blocker', what: 'Failing', mitigation: 'Fix' }] }) }),
    );
    expect(blocked).toContain('class="hero card tone-bad"');
    expect(visibleText(blocked)).toContain('1 blocker must be resolved before release.');
    const clean = renderSite(data({ gate: gate({ decision: 'GO', findings: [] }) }));
    expect(clean).toContain('class="hero card tone-ok"');
    expect(visibleText(clean)).toContain('No blockers and no residual risks.');
  });

  it('escapes engine text and renders backticked paths as code', () => {
    const html = renderSite(data());
    expect(html).toContain('&lt;b&gt;lower case&lt;/b&gt;');
    expect(html).not.toContain('<b>lower case</b>');
    expect(html).toContain('<code>tests/api/orders.spec.ts</code>');
  });

  it('ships a light and a dark theme with a toggle that remembers the choice', () => {
    const html = renderSite(data());
    expect(html).toMatch(/<button[^>]*data-theme-toggle[^>]*aria-pressed="false"[^>]*hidden/);
    expect(html).toContain(`const key = ${JSON.stringify(THEME_KEY)};`);
    expect(html).toContain('localStorage.setItem(key, chosen)');
    expect(html).toContain(':root[data-theme="dark"]{');
    // Without JavaScript the system setting still picks the theme.
    expect(html).toContain('@media (prefers-color-scheme:dark){:root:not([data-theme]){');
    // The theme is set in <head>, before the body paints.
    expect(html.indexOf('root.dataset.theme')).toBeLessThan(html.indexOf('<body>'));
  });

  it('flags rules nothing verifies and shows empty values as words, never a hyphen', () => {
    const html = renderSite(data());
    const text = visibleText(html);
    expect(text).toContain('Rules nothing verifies: BR-COUP-01');
    expect(text).toContain('No automated test');
    expect(text).toContain('No open defects.');
    expect(text).not.toMatch(/(^|\s)-(\s|$)/);
    expect(text).not.toContain('\u2014');
  });

  it('links the run, the commit and the Playwright report', () => {
    const html = renderSite(
      data({
        run: {
          label: '#22',
          sha: 'c387b322a1c68117b07e71437ca463cb6eaf87eb',
          commitUrl: 'https://github.com/o/r/commit/c387b32',
          runUrl: 'https://github.com/o/r/actions/runs/1',
          started: 'Oct 18, 2026, 02:10 GMT+7',
          durationMs: 43669,
          projects: [{ name: 'api', tests: 86 }],
          repoUrl: 'https://github.com/o/r',
        },
      }),
    );
    expect(html).toContain('href="report/index.html"');
    expect(html).toContain('<a href="https://github.com/o/r/actions/runs/1">#22</a>');
    expect(html).toContain('<code>c387b32</code>');
    expect(visibleText(html)).toContain('43.7 s');
  });
});

describe('formatDuration', () => {
  it.each([
    [5541.9, '5.5 s'],
    [43669, '43.7 s'],
    [59960, '1 min 0 s'],
    [125000, '2 min 5 s'],
  ])('%p ms reads %p', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('formatInZone', () => {
  it('shows a UTC instant in the given zone, whatever the machine zone', () => {
    expect(formatInZone(fromIso('2026-10-17T19:10:28.026Z'), 'Asia/Ho_Chi_Minh')).toBe('Oct 18, 2026, 02:10 GMT+7');
  });
});
