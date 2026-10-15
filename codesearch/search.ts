/**
 * Hybrid code search: ripgrep text hits, ranked with the code graph.
 *
 * 1. Text: ripgrep finds every line matching any query term; each file scores
 *    Σ tf × idf over the terms (rare terms count more).
 * 2. Symbols: a function, class or method whose name contains a term
 *    (camelCase-aware: `addToCart` matches "cart") lifts its file strongly.
 * 3. Graph: a file imported by — or importing — a strong hit inherits a share of
 *    its score, so the page object behind a matching spec surfaces too; `near`
 *    pins the ranking around one file.
 */

import { spawnSync } from 'node:child_process';
import { rgPath } from '@vscode/ripgrep';
import { codeIndex, related, ROOT, SCOPE, type CodeIndex, type CodeSymbol } from '@codesearch/index';

export type LineHit = { file: string; line: number; text: string };

export type FileResult = {
  file: string;
  score: number;
  lines: LineHit[];
  symbols: CodeSymbol[];
  via: ('text' | 'symbol' | 'graph')[];
};

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'test', 'tests', 'how', 'what', 'where']);

/** Lower-case search terms: camelCase and snake_case split, stop words and 1–2 letter words dropped. */
export function terms(query: string): string[] {
  const words = query
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  return [...new Set(words)];
}

/** Raw ripgrep: fixed-string or regex search over the scope, as line hits. */
export function grep(
  pattern: string,
  {
    regex = false,
    glob,
    ignoreCase = true,
    maxCount = 200,
  }: { regex?: boolean; glob?: string; ignoreCase?: boolean; maxCount?: number } = {},
): LineHit[] {
  const args = ['--json', '--max-count', String(maxCount)];
  if (!regex) args.push('--fixed-strings');
  if (ignoreCase) args.push('--ignore-case');
  if (glob) args.push('--glob', glob);
  args.push('--', pattern, ...SCOPE);
  const out = spawnSync(rgPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const hits: LineHit[] = [];
  for (const line of out.stdout.split('\n')) {
    if (!line.startsWith('{"type":"match"')) continue;
    const m = JSON.parse(line) as { data: { path: { text: string }; line_number: number; lines: { text: string } } };
    hits.push({
      file: m.data.path.text.replaceAll('\\', '/'),
      line: m.data.line_number,
      text: m.data.lines.text.trimEnd(),
    });
  }
  return hits;
}

function symbolTerms(s: CodeSymbol): string[] {
  return terms(`${s.owner ?? ''} ${s.name}`);
}

export function search(
  query: string,
  {
    limit = 10,
    near,
    glob,
    index = codeIndex(),
  }: { limit?: number; near?: string; glob?: string; index?: CodeIndex } = {},
): FileResult[] {
  const qs = terms(query);
  if (qs.length === 0) return [];
  const total = index.files.size;
  const results = new Map<string, FileResult>();
  const entry = (file: string): FileResult => {
    let r = results.get(file);
    if (!r) results.set(file, (r = { file, score: 0, lines: [], symbols: [], via: [] }));
    return r;
  };
  const mark = (r: FileResult, via: FileResult['via'][number]): void => {
    if (!r.via.includes(via)) r.via.push(via);
  };

  // 1. text
  for (const term of qs) {
    const hits = grep(term, { glob });
    const byFile = Map.groupBy(hits, (h) => h.file);
    const idf = Math.log(1 + total / Math.max(1, byFile.size));
    for (const [file, fileHits] of byFile) {
      const r = entry(file);
      r.score += Math.log(1 + fileHits.length) * idf;
      for (const h of fileHits) if (r.lines.length < 8 && !r.lines.some((l) => l.line === h.line)) r.lines.push(h);
      mark(r, 'text');
    }
  }

  // 2. symbols: a name that says the whole query (`applyCoupon` for "apply coupon") is the strongest
  //    signal there is; a partial match counts less, a match on the owning class only a little.
  const symbolBoost = new Map<string, number>();
  for (const s of index.symbols) {
    if (glob && !new Bun.Glob(glob).match(s.file)) continue;
    const matches = (words: string[]) => qs.filter((q) => words.some((t) => t.startsWith(q) || q.startsWith(t))).length;
    const byName = matches(terms(s.name));
    const byOwner = matches(symbolTerms(s)) - byName;
    const boost = byName === qs.length ? 6 : byName > 0 ? 2 * (byName / qs.length) : byOwner > 0 ? 0.3 : 0;
    if (boost === 0) continue;
    const r = entry(s.file);
    symbolBoost.set(s.file, Math.min(8, (symbolBoost.get(s.file) ?? 0) + boost));
    r.symbols.push({ ...s, line: s.line });
    mark(r, 'symbol');
  }
  for (const [file, boost] of symbolBoost) entry(file).score += boost;
  for (const r of results.values())
    r.symbols.sort(
      (a, b) =>
        terms(b.name).filter((t) => qs.some((q) => t.startsWith(q))).length -
        terms(a.name).filter((t) => qs.some((q) => t.startsWith(q))).length,
    );

  // 3. graph: neighbours of the strongest hits inherit 30 % of their score.
  const strongest = [...results.values()].sort((a, b) => b.score - a.score).slice(0, 5);
  for (const top of strongest) {
    const { imports, importers } = related(top.file, 1, index);
    for (const other of [...imports, ...importers]) {
      if (glob && !new Bun.Glob(glob).match(other)) continue;
      const r = entry(other);
      r.score += 0.3 * top.score;
      mark(r, 'graph');
    }
  }
  if (near) {
    const around = related(near, 2, index);
    for (const f of [...around.imports, ...around.importers]) {
      const r = results.get(f);
      if (r) r.score *= 1.5;
    }
  }

  return [...results.values()]
    .map((r) => ({ ...r, score: Math.round(r.score * 100) / 100, symbols: r.symbols.slice(0, 8) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Where `name` is defined and every line that mentions it as a whole word. */
export function findSymbol(name: string, index = codeIndex()): { definitions: CodeSymbol[]; usages: LineHit[] } {
  const definitions = index.symbols.filter((s) => s.name === name || `${s.owner ?? ''}.${s.name}` === name);
  const word = name.includes('.') ? (name.split('.').pop() ?? name) : name;
  const usages = grep(`\\b${word.replace(/[$]/g, '\\$')}\\b`, { regex: true, ignoreCase: false }).filter(
    (h) => !definitions.some((d) => d.file === h.file && d.line === h.line),
  );
  return { definitions, usages: usages.slice(0, 60) };
}

/**
 * The reusable building blocks a new test should use instead of writing its own:
 * API helpers, data-setup helpers, page objects and fixtures, with signatures.
 */
export function listHelpers(
  area?: 'api' | 'pages' | 'setup' | 'data' | 'fixtures',
  index = codeIndex(),
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const s of index.symbols) {
    if (!s.file.startsWith('framework/')) continue;
    if (area && !s.file.startsWith(`framework/${area}`) && !(area === 'fixtures' && s.file === 'framework/fixtures.ts'))
      continue;
    (out[s.file] ??= []).push(s.kind === 'method' ? `  ${s.owner ?? ''}.${s.signature}` : s.signature);
  }
  return out;
}
