/**
 * Guards test maintenance against "make it green". Compares tests and framework between a base ref and the working
 * tree and fails when a change hides a failure instead of following a documented behaviour change.
 *
 *   bun run qa:heal-guard [--base origin/main] [--intended BR-SHIP-01 …] [--result <agent result.json>] [--human "<quote>"]
 *
 * Findings, per changed file:
 *   removed      an assertion or a test is gone                                   never allowed
 *   weakened     an assertion lost strength (exact value → partial → presence)    never allowed
 *   suppressed   skip / fixme / only / slow (also at runtime), a test.fail that
 *                doesn't pin an open DEF- the file tags, hard waits, timeouts,
 *                retries, configure(), toPass() — each occurrence, not a count     never allowed
 *   expected     an assertion's expected value, a `not`, or a test title changed  only with intended-change evidence
 *   data         a literal the test arranges with (price, quantity, code)         only with intended-change evidence
 *   contract     an API schema changed (framework/api/schemas.ts)                 only with intended-change evidence
 *   maintenance  a locator or subject renamed, page objects, helpers, recipes    allowed — listed
 *
 * Intended-change evidence is a rule, feature, card or overview that states the new behaviour, already on the base
 * branch, unchanged in this diff, and changed there after the test file was — Product updated it first. Or a human's
 * confirmation, quoted with --human. A diff of app/ is never evidence: the code changing is exactly what a bug looks like.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { table, writeReport } from '@qa/report';
import { ROOT, Vault, isOpen, type Doc } from '@qa/vault';

export type Kind = 'removed' | 'weakened' | 'suppressed' | 'expected' | 'data' | 'contract' | 'maintenance';
export type Finding = { file: string; kind: Kind; detail: string; allowed: boolean; evidence?: string };
export type Change = { path: string; before: string; after: string };

/** Never allowed, whatever the evidence. */
const FORBIDDEN: ReadonlySet<Kind> = new Set(['removed', 'weakened', 'suppressed']);
const NEEDS_EVIDENCE: ReadonlySet<Kind> = new Set(['expected', 'data', 'contract']);
const EVIDENCE_TYPES: ReadonlySet<string> = new Set(['rule', 'feature', 'card', 'overview']);

const SCHEMAS = 'framework/api/schemas.ts';
const LOOSENING_FILES = ['playwright.config.ts', 'framework/config/timeouts.ts'];
/** Product tests and the framework they stand on — not tests/unit (the QA engines' own tests). */
const IN_SCOPE = /^(tests\/(?:api|ui)\/.*\.ts|framework\/.*\.ts|playwright\.config\.ts)$/;

// ---- reading assertions ---------------------------------------------------------------------------------

/** Exact value 3 · partial 2 · presence 1. A matcher moving down this scale proves less. */
const EXACT: readonly string[] = [
  'toBe',
  'toEqual',
  'toStrictEqual',
  'toHaveText',
  'toHaveValue',
  'toHaveValues',
  'toHaveCount',
  'toHaveURL',
  'toHaveTitle',
  'toHaveAttribute',
  'toHaveLength',
  'toHaveClass',
  'toHaveCSS',
  'toBeCloseTo',
  'expectRefused',
];
const PARTIAL: readonly string[] = [
  'toContainText',
  'toContain',
  'toContainEqual',
  'toMatch',
  'toMatchObject',
  'toHaveProperty',
  'toBeGreaterThan',
  'toBeGreaterThanOrEqual',
  'toBeLessThan',
  'toBeLessThanOrEqual',
  'toBeInstanceOf',
  'toThrow',
];
const strength = (matcher: string) => (EXACT.includes(matcher) ? 3 : PARTIAL.includes(matcher) ? 2 : 1);

export type Assertion = {
  text: string;
  subject: string;
  message: string;
  not: boolean;
  matcher: string;
  expected: string;
};

/** Comments out, whitespace collapsed: formatting never counts as a change. */
function normalize(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Index just past the bracket that closes the one at `open`, skipping strings. */
function close(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < s.length && s[i] !== c; i++) if (s[i] === '\\') i++;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return s.length;
}

/** Top-level comma-separated arguments of `args` (without the brackets). */
function split(args: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < args.length && args[i] !== c; i++) if (args[i] === '\\') i++;
    } else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) {
      out.push(args.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = args.slice(start).trim();
  if (last) out.push(last);
  return out;
}

export function assertions(src: string): Assertion[] {
  const s = normalize(src);
  const found: Assertion[] = [];
  const start = /\b(expect(?:\.soft|\.poll)?|expectRefused)\s*\(/g;
  let end = 0;
  for (let m = start.exec(s); m; m = start.exec(s)) {
    if (m.index < end) continue; // nested in the previous assertion
    const open = m.index + m[0].length - 1;
    const callEnd = close(s, open);
    const args = split(s.slice(open + 1, callEnd - 1));
    if (m[1] === 'expectRefused') {
      end = callEnd;
      found.push({
        text: s.slice(m.index, callEnd),
        subject: args[0] ?? '',
        message: '',
        not: false,
        matcher: 'expectRefused',
        expected: args.slice(1).join(', '),
      });
      continue;
    }
    const chain = /^((?:\s*\.\s*(?:not|resolves|rejects))*)\s*\.\s*(\w+)\s*\(/.exec(s.slice(callEnd));
    if (!chain) {
      end = callEnd;
      continue;
    }
    const mOpen = callEnd + chain[0].length - 1;
    end = close(s, mOpen);
    found.push({
      text: s.slice(m.index, end),
      subject: args[0] ?? '',
      message: args[1] ?? '',
      not: /\bnot\b/.test(chain[1] ?? ''),
      matcher: chain[2] ?? '',
      expected: s.slice(mOpen + 1, end - 1).trim(),
    });
  }
  return found;
}

/** Titles of the tests a file declares (`test('…'`, `test.skip('…'`), not steps. */
export function testTitles(src: string): string[] {
  const s = normalize(src);
  return [...s.matchAll(/\btest(?:\.(?:only|skip|fixme|fail|slow))?\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g)].map(
    (m) => m[2] ?? '',
  );
}

// ---- comparing ------------------------------------------------------------------------------------------

/** Removes `x` from `xs` (one occurrence); true if it was there. */
function take<T>(xs: T[], match: (x: T) => boolean): T | undefined {
  const i = xs.findIndex(match);
  return i < 0 ? undefined : xs.splice(i, 1)[0];
}

function compareAssertions(file: string, before: Assertion[], after: Assertion[]): Omit<Finding, 'allowed'>[] {
  const out: Omit<Finding, 'allowed'>[] = [];
  const b = [...before];
  const a = [...after];
  // 1. unchanged
  for (const x of [...b]) if (take(a, (y) => y.text === x.text)) take(b, (y) => y === x);
  // 2. same check, only the message or the subject's name changed
  for (const x of [...b]) {
    const y = take(
      a,
      (z) =>
        z.matcher === x.matcher &&
        z.not === x.not &&
        z.expected === x.expected &&
        (z.subject === x.subject || z.message === x.message),
    );
    if (!y) continue;
    take(b, (z) => z === x);
    if (y.subject !== x.subject)
      out.push({ file, kind: 'maintenance', detail: `subject renamed: ${x.subject} → ${y.subject}` });
  }
  // 3. same subject, the check itself changed
  for (const x of [...b]) {
    const y = take(a, (z) => z.subject === x.subject) ?? take(a, (z) => z.message !== '' && z.message === x.message);
    if (!y) continue;
    take(b, (z) => z === x);
    const was = `${x.not ? 'not.' : ''}${x.matcher}(${x.expected})`;
    const now = `${y.not ? 'not.' : ''}${y.matcher}(${y.expected})`;
    if (strength(y.matcher) < strength(x.matcher))
      out.push({ file, kind: 'weakened', detail: `${x.subject}: ${was} → ${now}` });
    else out.push({ file, kind: 'expected', detail: `${x.subject}: ${was} → ${now}` });
  }
  for (const x of b) out.push({ file, kind: 'removed', detail: `assertion: ${x.text.slice(0, 140)}` });
  return out;
}

const SUPPRESSIONS: [RegExp, string][] = [
  [/\b(?:test|describe)(?:\.describe)?\.(?:skip|fixme|only|slow)\s*\(/g, 'skip / fixme / only / slow'],
  [/\b(?:testInfo|test\.info\(\))\s*\.\s*(?:skip|fixme|fail|slow)\s*\(/g, 'skip / fixme / fail / slow at runtime'],
  [/\bwaitForTimeout\s*\(/g, 'a hard wait (waitForTimeout)'],
  [/\bsetTimeout\s*\(/g, 'a timeout or a hard wait (setTimeout)'],
  [/\btimeout\s*:/g, 'an explicit timeout'],
  [/\bretries\s*:/g, 'retries'],
  [/\.configure\s*\(/g, 'test / expect configuration (retries, mode, timeouts)'],
  [/\.toPass\s*\(/g, 'a retry loop (toPass)'],
];

/**
 * Each occurrence as written — the whole call, or the `key: value` — so a suppression moved to another test, or
 * a timeout raised from one value to another, counts as a new one.
 */
function occurrences(s: string, re: RegExp): string[] {
  return [...s.matchAll(re)].map((m) => {
    const end = m.index + m[0].length;
    if (m[0].endsWith('(')) return s.slice(m.index, close(s, end - 1));
    const stop = s.slice(end).search(/[,}]/);
    return s.slice(m.index, stop < 0 ? s.length : end + stop);
  });
}

/** Items of `after` that `before` doesn't have (multiset difference). */
function added(before: string[], after: string[]): string[] {
  const left = [...before];
  return after.filter((x) => !take(left, (y) => y === x));
}

/** `test.fail(…)` calls that don't pin an open defect the file also tags (`@DEF-…`). */
function unpinnedFails(src: string, openDefects: ReadonlySet<string>): string[] {
  const s = normalize(src);
  return [...s.matchAll(/\btest\.fail\s*\(([^)]*)\)/g)]
    .map((m) => m[1] ?? '')
    .filter((args) => {
      const id = /DEF-\d+/.exec(args)?.[0];
      return !(id && openDefects.has(id) && s.includes(`@${id}`));
    });
}

/**
 * Test data a file states outside its assertions, titles, tags and imports: string and number literals in specs
 * (`priceCents: 2500`, `setQuantity(name, 11)`, `'WELCOME10'`), numbers in seed / recipe / card defaults. Changing
 * them can move a test off the boundary it exists for, so it needs the same evidence as a new expected value.
 */
export function dataLiterals(path: string, src: string): string[] {
  const spec = path.startsWith('tests/');
  if (!spec && !/^framework\/(setup\/(seed|recipes)\.ts|data\/)/.test(path)) return [];
  let s = normalize(src);
  for (const a of assertions(src)) s = s.replace(a.text, ' ');
  s = s
    .replace(/\bimport\s[^;]*;/g, ' ')
    .replace(/\btest\.fail\s*\([^)]*\)/g, ' ')
    .replace(/\btag\s*:\s*(?:\[[^\]]*\]|'[^']*'|"[^"]*")/g, ' ')
    .replace(/\b(test(?:\.\w+)?|describe|step)\s*\(\s*(['"`])(?:\\.|(?!\2).)*\2/g, '$1(');
  const strings = spec ? [...s.matchAll(/(['"`])(?:\\.|(?!\1).)*\1/g)].map((m) => m[0]) : [];
  const numbers = [...s.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, ' ').matchAll(/(?<![\w$.])\d[\d_]*(?:\.\d+)?/g)].map(
    (m) => m[0],
  );
  return [...strings, ...numbers];
}

/** What changed in one file, before evidence is applied. */
export function classify(change: Change, openDefects: ReadonlySet<string>): Omit<Finding, 'allowed'>[] {
  const { path, before, after } = change;
  if (normalize(before) === normalize(after)) return [];
  if (LOOSENING_FILES.includes(path))
    return [
      { file: path, kind: 'suppressed', detail: 'timeouts / retries / config changed — never a fix for a failure' },
    ];
  if (path === SCHEMAS) return [{ file: path, kind: 'contract', detail: 'an API response schema changed' }];

  const out: Omit<Finding, 'allowed'>[] = [];
  const nb = normalize(before);
  const na = normalize(after);
  for (const [re, what] of SUPPRESSIONS)
    if (added(occurrences(nb, re), occurrences(na, re)).length)
      out.push({ file: path, kind: 'suppressed', detail: `added ${what}` });
  if (added(unpinnedFails(before, openDefects), unpinnedFails(after, openDefects)).length)
    out.push({ file: path, kind: 'suppressed', detail: 'test.fail without an open DEF- id the file tags' });

  const dataBefore = dataLiterals(path, before);
  const dataAfter = dataLiterals(path, after);
  const dropped = added(dataAfter, dataBefore);
  if (dropped.length) {
    const fresh = added(dataBefore, dataAfter);
    out.push({
      file: path,
      kind: 'data',
      detail: `test data changed: ${dropped.slice(0, 6).join(', ')} → ${fresh.slice(0, 6).join(', ') || '(removed)'}`,
    });
  }

  const tb = testTitles(before);
  const ta = testTitles(after);
  if (ta.length < tb.length)
    out.push({ file: path, kind: 'removed', detail: `tests: ${tb.filter((t) => !ta.includes(t)).join(' · ')}` });
  else
    for (const t of tb.filter((x) => !ta.includes(x)))
      out.push({
        file: path,
        kind: 'expected',
        detail: `test retitled: "${t}" → ${ta
          .filter((x) => !tb.includes(x))
          .map((x) => `"${x}"`)
          .join(', ')}`,
      });

  out.push(...compareAssertions(path, assertions(before), assertions(after)));
  if (!out.length)
    out.push({
      file: path,
      kind: 'maintenance',
      detail: !before ? 'new file' : !after ? 'deleted file' : 'no assertion, test or suppression changed',
    });
  return out;
}

/**
 * Applies the evidence: `evidenceFor(file)` names the intended-change document (or human quote) that covers a file,
 * if any.
 */
export function review(
  changes: Change[],
  openDefects: ReadonlySet<string>,
  evidenceFor: (file: string) => string | undefined,
): Finding[] {
  return changes.flatMap((c) =>
    classify(c, openDefects).map((f) => {
      if (FORBIDDEN.has(f.kind)) return { ...f, allowed: false };
      if (!NEEDS_EVIDENCE.has(f.kind)) return { ...f, allowed: true };
      const evidence = evidenceFor(f.file);
      return evidence ? { ...f, allowed: true, evidence } : { ...f, allowed: false };
    }),
  );
}

// ---- evidence -------------------------------------------------------------------------------------------

/** Ids a spec tags (`@FEAT-…`, `@BR-…`, `@DEF-…`). */
export function tagsOf(src: string): Set<string> {
  return new Set([...src.matchAll(/@((?:FEAT|BR|DEF|CARD)-[A-Z0-9-]+)/g)].map((m) => m[1] ?? ''));
}

/** Does intended-change document `doc` govern a file with these tags? A rule or card also governs its feature's tests. */
export function governs(doc: Doc, tags: ReadonlySet<string>): boolean {
  const feature = typeof doc.meta.feature === 'string' ? doc.meta.feature : '';
  return tags.has(doc.id) || (feature !== '' && tags.has(feature)) || doc.type === 'overview';
}

function git(args: string[]): { ok: boolean; out: string } {
  const run = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return { ok: run.status === 0, out: run.stdout.trim() };
}

const lastChange = (base: string, path: string) =>
  Number(git(['log', '-1', '--format=%ct', base, '--', path]).out || 0);

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      base: { type: 'string', default: 'origin/main' },
      intended: { type: 'string', multiple: true, default: [] },
      result: { type: 'string' },
      human: { type: 'string' },
    },
  });
  const base = values.base;
  if (!git(['rev-parse', '--verify', '--quiet', base]).ok) throw new Error(`--base ${base} is not a ref`);

  const changed = [
    ...git(['diff', '--name-only', base]).out.split('\n'),
    ...git(['ls-files', '--others', '--exclude-standard']).out.split('\n'),
  ].filter((p) => IN_SCOPE.test(p));
  const changes: Change[] = [...new Set(changed)].map((path) => ({
    path,
    before: git(['show', `${base}:${path}`]).out,
    after: existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path), 'utf8') : '',
  }));

  const intended = new Set(values.intended);
  if (values.result) {
    const record = JSON.parse(readFileSync(values.result, 'utf8')) as { result?: { intended?: { doc: string }[] } };
    for (const i of record.result?.intended ?? []) intended.add(i.doc);
  }

  const vault = new Vault();
  const openDefects = new Set(vault.defects.filter(isOpen).map((d) => d.id));
  const notes: string[] = [];
  const valid: Doc[] = [];
  for (const id of intended) {
    const doc = vault.docs.find((d) => d.id === id);
    const why = !doc
      ? 'not in the vault'
      : !EVIDENCE_TYPES.has(doc.type)
        ? `a ${doc.type} — only a rule, feature, card or overview documents behaviour`
        : !git(['cat-file', '-e', `${base}:${doc.path}`]).ok
          ? `not on ${base} — Product's documents land on the base branch first`
          : !git(['diff', '--quiet', base, '--', doc.path]).ok
            ? 'changed in this diff — a behaviour change goes to a human (needs_human proposal), not along with the test'
            : '';
    if (doc && !why) valid.push(doc);
    notes.push(`${id}: ${why || 'a valid document — it covers a file only if it changed after that file did'}`);
  }

  const evidenceFor = (file: string): string | undefined => {
    if (values.human) return `human: "${values.human}"`;
    const change = changes.find((c) => c.path === file);
    const tags = tagsOf(change?.after ?? '');
    const fileChanged = lastChange(base, file);
    const doc = valid.find((d) => (file === SCHEMAS || governs(d, tags)) && lastChange(base, d.path) > fileChanged);
    return doc && `${doc.id} (changed after ${file})`;
  };

  const findings = review(changes, openDefects, evidenceFor);
  const blocked = findings.filter((f) => !f.allowed);
  const md = [
    `## Heal guard — ${blocked.length ? `BLOCKED (${blocked.length})` : 'OK'}`,
    '',
    `Base \`${base}\` · ${changes.length} changed file(s) in tests/ and framework/.`,
    ...(notes.length ? ['', 'Intended-change evidence:', ...notes.map((n) => `- ${n}`)] : []),
    ...(values.human ? ['', `Human confirmation: "${values.human}"`] : []),
    '',
    findings.length
      ? table(
          ['', 'File', 'Change', 'Detail', 'Evidence'],
          findings.map((f) => [f.allowed ? '✓' : '✗', f.file, f.kind, f.detail, f.evidence ?? '']),
        )
      : 'Nothing to review.',
    '',
    blocked.length
      ? 'A blocked change hides a failure or changes expected behaviour without proof it was intended. Revert it; ' +
        'classify the failure (`.claude/rules/failure-triage.md`) — a product bug is reported, not healed.'
      : '',
  ].join('\n');
  writeReport('heal-guard', { base, intended: notes, findings }, md);
  console.log(md);
  process.exit(blocked.length ? 1 : 0);
}
