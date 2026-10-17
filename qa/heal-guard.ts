/**
 * Guards test maintenance against "make it green". Compares tests and framework between a base ref and the working
 * tree and fails when a change hides a failure instead of following a documented behaviour change.
 *
 *   bun run qa:heal-guard [--base origin/main] [--intended BR-SHIP-01 …] [--result <agent result.json>] [--human "<quote>"]
 *
 * Findings, per changed file:
 *   removed      an assertion or a test is gone                                   never allowed
 *   weakened     an assertion lost strength (exact value → partial → presence),
 *                or moved under a try/catch or .catch(), a condition (if, ternary,
 *                && || ??, switch) or after a return / throw / break / continue   never allowed
 *   suppressed   skip / fixme / only / slow (also at runtime), a test.fail that
 *                doesn't pin an open DEF- the file tags, hard waits, timeouts,
 *                retries, configure(), toPass(); every occurrence counts          never allowed
 *   expected     an assertion's expected value, a `not`, or a test title changed  only with intended-change evidence
 *   data         a literal the test arranges with (price, quantity, code)         only with intended-change evidence
 *   contract     an API schema changed (framework/api/schemas.ts)                 only with intended-change evidence
 *   maintenance  a locator or subject renamed, page objects, helpers, recipes    allowed, listed
 *
 * Intended-change evidence is a rule, feature, card or overview that states the new behaviour, already on the base
 * branch, unchanged in this diff, and changed there after the test file was (Product updated it first). Or a human's
 * confirmation, quoted with --human. A diff of app/ is never evidence,
 * since a code change is also what a bug looks like.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { table, writeReport } from '@qa/report';
import { ROOT, Vault, isOpen, type Doc } from '@qa/vault';
import ts from 'typescript';

export type Kind = 'removed' | 'weakened' | 'suppressed' | 'expected' | 'data' | 'contract' | 'maintenance';
export type Finding = { file: string; kind: Kind; detail: string; allowed: boolean; evidence?: string };
export type Change = { path: string; before: string; after: string };

/** Never allowed, whatever the evidence. */
const FORBIDDEN: ReadonlySet<Kind> = new Set(['removed', 'weakened', 'suppressed']);
const NEEDS_EVIDENCE: ReadonlySet<Kind> = new Set(['expected', 'data', 'contract']);
const EVIDENCE_TYPES: ReadonlySet<string> = new Set(['rule', 'feature', 'card', 'overview']);

const SCHEMAS = 'framework/api/schemas.ts';
const LOOSENING_FILES = ['playwright.config.ts', 'framework/config/timeouts.ts'];
/** Product tests and the framework they stand on. Excludes tests/unit (the QA engines' own tests). */
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
  /** What around it can stop it from running or from failing the test (see `guardsOf`); empty when nothing. */
  guards: string[];
};

/** A file parsed by the TypeScript compiler, and its text with every comment blanked out (same offsets). */
type Source = { file: ts.SourceFile; code: string };

const SOURCES = new Map<string, Source>();

function source(src: string): Source {
  const hit = SOURCES.get(src);
  if (hit) return hit;
  const file = ts.createSourceFile(
    'heal-guard.ts',
    src,
    { languageVersion: ts.ScriptTarget.Latest, jsDocParsingMode: ts.JSDocParsingMode.ParseNone },
    true,
    ts.ScriptKind.TS,
  );
  // Every comment sits in the trivia before some token (the end-of-file token for the last ones).
  const comments = new Map<number, number>();
  const visit = (node: ts.Node): void => {
    const children = node.getChildren(file);
    for (const child of children) visit(child);
    if (children.length) return;
    for (const c of ts.getLeadingCommentRanges(src, node.pos) ?? []) comments.set(c.pos, c.end);
    for (const c of ts.getTrailingCommentRanges(src, node.end) ?? []) comments.set(c.pos, c.end);
  };
  visit(file);
  let code = '';
  let at = 0;
  for (const [start, end] of [...comments].sort(([a], [b]) => a - b)) {
    if (start < at) continue;
    code += src.slice(at, start) + ' '.repeat(end - start);
    at = end;
  }
  code += src.slice(at);
  if (SOURCES.size > 32) SOURCES.clear();
  const parsed = { file, code };
  SOURCES.set(src, parsed);
  return parsed;
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();
const textOf = (s: Source, node: ts.Node) => oneLine(s.code.slice(node.getStart(s.file), node.end));

/** Comments out, whitespace collapsed: formatting never counts as a change. */
function normalize(src: string): string {
  return oneLine(source(src).code);
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

const LOGICAL: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

/** Statements after which the rest of their block never runs. */
const EXITS: Partial<Record<ts.SyntaxKind, string>> = {
  [ts.SyntaxKind.ReturnStatement]: 'return',
  [ts.SyntaxKind.ThrowStatement]: 'throw',
  [ts.SyntaxKind.BreakStatement]: 'break',
  [ts.SyntaxKind.ContinueStatement]: 'continue',
};

const statementsOf = (node: ts.Node): readonly ts.Statement[] | undefined =>
  ts.isBlock(node) ||
  ts.isSourceFile(node) ||
  ts.isModuleBlock(node) ||
  ts.isCaseClause(node) ||
  ts.isDefaultClause(node)
    ? node.statements
    : undefined;

/** A catch block swallows the failure unless it rethrows (a `throw` among its own statements). */
const swallows = (clause: ts.CatchClause | undefined) =>
  clause !== undefined && !clause.block.statements.some((s) => ts.isThrowStatement(s));

/**
 * What around a node can stop it from running or from failing the test, innermost first: a try/catch or a `.catch()`
 * that swallows the failure, a catch block, a condition (if, ternary, `&&` `||` `??`, switch case), or a return /
 * throw / break / continue before it in the same block. Loops and callbacks never called are not seen.
 */
function guardsOf(node: ts.Node): string[] {
  const guards: string[] = [];
  for (let child = node; !ts.isSourceFile(child); child = child.parent) {
    const parent = child.parent;
    if (ts.isTryStatement(parent)) {
      if (child === parent.tryBlock && swallows(parent.catchClause)) guards.push('inside try/catch');
      else if (child === parent.catchClause) guards.push('inside a catch block');
    } else if (ts.isIfStatement(parent) && child !== parent.expression) guards.push('under an if');
    else if (ts.isConditionalExpression(parent) && child !== parent.condition) guards.push('under a ternary');
    else if (ts.isBinaryExpression(parent) && child === parent.right && LOGICAL.has(parent.operatorToken.kind))
      guards.push(`under ${ts.tokenToString(parent.operatorToken.kind) ?? 'a logical operator'}`);
    else if ((ts.isCaseClause(parent) && child !== parent.expression) || ts.isDefaultClause(parent))
      guards.push('under a switch case');
    else if (
      ts.isPropertyAccessExpression(parent) &&
      child === parent.expression &&
      parent.name.text === 'catch' &&
      ts.isCallExpression(parent.parent) &&
      parent.parent.expression === parent
    )
      guards.push('inside .catch()');
    const statements = statementsOf(parent);
    const at = statements?.indexOf(child as ts.Statement) ?? -1;
    // A function declaration is hoisted, so a return before it doesn't make it unreachable.
    if (statements && at > 0 && !ts.isFunctionDeclaration(child)) {
      const exit = statements
        .slice(0, at)
        .map((s) => EXITS[s.kind])
        .find((e) => e !== undefined);
      if (exit) guards.push(`unreachable after ${exit}`);
    }
  }
  return guards;
}

const CHAIN = new Set(['not', 'resolves', 'rejects']);

/** `expect(…)`, `expect.soft(…)` or `expect.poll(…)`: the call an assertion chain starts from. */
const isExpect = (callee: ts.Expression) =>
  (ts.isIdentifier(callee) && callee.text === 'expect') ||
  (ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'expect' &&
    (callee.name.text === 'soft' || callee.name.text === 'poll'));

/** The assertion a call makes: `expect(x, 'msg').not.toBe(y)` or `expectRefused(call, status, code)`. */
function assertionAt(s: Source, call: ts.CallExpression): Assertion | undefined {
  const callee = call.expression;
  if (ts.isIdentifier(callee) && callee.text === 'expectRefused') {
    const [subject, ...expected] = call.arguments;
    return {
      text: textOf(s, call),
      subject: subject ? textOf(s, subject) : '',
      message: '',
      not: false,
      matcher: 'expectRefused',
      expected: expected.map((a) => textOf(s, a)).join(', '),
      guards: guardsOf(call),
    };
  }
  if (!ts.isPropertyAccessExpression(callee)) return undefined;
  let target = callee.expression;
  let not = false;
  while (ts.isPropertyAccessExpression(target) && CHAIN.has(target.name.text)) {
    not ||= target.name.text === 'not';
    target = target.expression;
  }
  if (!ts.isCallExpression(target) || !isExpect(target.expression)) return undefined;
  const [subject, message] = target.arguments;
  return {
    text: textOf(s, call),
    subject: subject ? textOf(s, subject) : '',
    message: message ? textOf(s, message) : '',
    not,
    matcher: callee.name.text,
    expected: oneLine(s.code.slice(call.arguments.pos, call.arguments.end)),
    guards: guardsOf(call),
  };
}

/** Every assertion in a file, read from its syntax tree, in source order. */
export function assertions(src: string): Assertion[] {
  const s = source(src);
  const found: Assertion[] = [];
  const visit = (node: ts.Node): void => {
    const assertion = ts.isCallExpression(node) ? assertionAt(s, node) : undefined;
    // An expect nested in another one (inside a toPass() block) is part of it.
    if (assertion) found.push(assertion);
    else ts.forEachChild(node, visit);
  };
  visit(s.file);
  return found;
}

const isText = (node: ts.Node) =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node);

const TEST_MODIFIERS = new Set(['only', 'skip', 'fixme', 'fail', 'slow']);

/** `test(…)` or `test.only / skip / fixme / fail / slow(…)`: a call that declares a test. */
const declaresTest = (callee: ts.Expression) =>
  (ts.isIdentifier(callee) && callee.text === 'test') ||
  (ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'test' &&
    TEST_MODIFIERS.has(callee.name.text));

/** Titles of the tests a file declares (`test('…'`, `test.skip('…'`), not steps. */
export function testTitles(src: string): string[] {
  const s = source(src);
  const titles: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && declaresTest(node.expression)) {
      const [title] = node.arguments;
      if (title && isText(title)) titles.push(textOf(s, title).slice(1, -1));
    }
    ts.forEachChild(node, visit);
  };
  visit(s.file);
  return titles;
}

// ---- comparing ------------------------------------------------------------------------------------------

/** Removes `x` from `xs` (one occurrence); true if it was there. */
function take<T>(xs: T[], match: (x: T) => boolean): T | undefined {
  const i = xs.findIndex(match);
  return i < 0 ? undefined : xs.splice(i, 1)[0];
}

const check = (x: Assertion) => `${x.not ? 'not.' : ''}${x.matcher}(${x.expected})`;

function compareAssertions(file: string, before: Assertion[], after: Assertion[]): Omit<Finding, 'allowed'>[] {
  const out: Omit<Finding, 'allowed'>[] = [];
  const b = [...before];
  const a = [...after];
  /** Pairs an assertion with its new version; one that now sits under a guard it didn't have proves less. */
  const pair = (x: Assertion, match: (y: Assertion) => boolean): Assertion | undefined => {
    const y = take(a, match);
    if (!y) return undefined;
    take(b, (z) => z === x);
    const guards = added(x.guards, y.guards);
    if (guards.length)
      out.push({ file, kind: 'weakened', detail: `${y.subject}: ${check(y)} is now ${guards.join(', ')}` });
    return y;
  };
  // 1. unchanged, first where it was, then anywhere
  for (const x of [...b]) pair(x, (y) => y.text === x.text && y.guards.join() === x.guards.join());
  for (const x of [...b]) pair(x, (y) => y.text === x.text);
  // 2. same check, only the message or the subject's name changed
  for (const x of [...b]) {
    const y = pair(
      x,
      (z) =>
        z.matcher === x.matcher &&
        z.not === x.not &&
        z.expected === x.expected &&
        (z.subject === x.subject || z.message === x.message),
    );
    if (y && y.subject !== x.subject)
      out.push({ file, kind: 'maintenance', detail: `subject renamed: ${x.subject} → ${y.subject}` });
  }
  // 3. same subject, the check itself changed
  for (const x of [...b]) {
    const y = pair(x, (z) => z.subject === x.subject) ?? pair(x, (z) => z.message !== '' && z.message === x.message);
    if (!y) continue;
    const detail = `${x.subject}: ${check(x)} → ${check(y)}`;
    out.push({ file, kind: strength(y.matcher) < strength(x.matcher) ? 'weakened' : 'expected', detail });
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
 * Each occurrence as written (the whole call, or the `key: value`), so a suppression moved to another test, or
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

const isTestFail = (callee: ts.Expression) =>
  ts.isPropertyAccessExpression(callee) &&
  ts.isIdentifier(callee.expression) &&
  callee.expression.text === 'test' &&
  callee.name.text === 'fail';

/** A call whose first argument is a title: test(…), test.describe(…), describe(…), test.step(…) and their modifiers. */
function titled(callee: ts.Expression): boolean {
  if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'step') return true;
  let root = callee;
  while (ts.isPropertyAccessExpression(root)) root = root.expression;
  return ts.isIdentifier(root) && ['test', 'describe', 'step'].includes(root.text);
}

const isTag = (node: ts.Node) =>
  ts.isPropertyAssignment(node) &&
  (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
  node.name.text === 'tag';

/**
 * Test data a file states outside its assertions, titles, tags and imports: string and number literals in specs
 * (`priceCents: 2500`, `setQuantity(name, 11)`, `'WELCOME10'`), numbers in seed / recipe / card defaults. Changing
 * them can move a test off the boundary it exists for, so it needs the same evidence as a new expected value.
 */
export function dataLiterals(path: string, src: string): string[] {
  const spec = path.startsWith('tests/');
  if (!spec && !/^framework\/(setup\/(seed|recipes)\.ts|data\/)/.test(path)) return [];
  const s = source(src);
  const strings: string[] = [];
  const numbers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || isTag(node)) return;
    if (isText(node)) {
      if (spec) strings.push(textOf(s, node));
      return;
    }
    if (ts.isNumericLiteral(node)) {
      numbers.push(textOf(s, node));
      return;
    }
    if (ts.isCallExpression(node)) {
      // Assertions are compared on their own; test.fail(…) pins a defect, only a test body inside it is data.
      if (assertionAt(s, node)) return;
      if (isTestFail(node.expression)) {
        for (const arg of node.arguments) if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) visit(arg);
        return;
      }
      // A test, describe or step title is not data.
      if (titled(node.expression)) {
        node.arguments.forEach((arg, i) => {
          if (i > 0 || !isText(arg)) visit(arg);
        });
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(s.file);
  return [...strings, ...numbers];
}

/** What changed in one file, before evidence is applied. */
export function classify(change: Change, openDefects: ReadonlySet<string>): Omit<Finding, 'allowed'>[] {
  const { path, before, after } = change;
  if (normalize(before) === normalize(after)) return [];
  if (LOOSENING_FILES.includes(path))
    return [
      {
        file: path,
        kind: 'suppressed',
        detail: 'timeouts / retries / config changed, never a fix for a failure',
      },
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
        ? `a ${doc.type}: only a rule, feature, card or overview documents behaviour`
        : !git(['cat-file', '-e', `${base}:${doc.path}`]).ok
          ? `not on ${base}. Product's documents land on the base branch first`
          : !git(['diff', '--quiet', base, '--', doc.path]).ok
            ? 'changed in this diff. A behaviour change goes to a human (needs_human proposal) instead of shipping with the test'
            : '';
    if (doc && !why) valid.push(doc);
    notes.push(`${id}: ${why || 'a valid document; it covers a file only if it changed after that file did'}`);
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
    `## Heal guard: ${blocked.length ? `BLOCKED (${blocked.length})` : 'OK'}`,
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
        'classify the failure (`.claude/rules/failure-triage.md`). A product bug gets reported instead of healed.'
      : '',
  ].join('\n');
  writeReport('heal-guard', { base, intended: notes, findings }, md);
  console.log(md);
  process.exit(blocked.length ? 1 : 0);
}
