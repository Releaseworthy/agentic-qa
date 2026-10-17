/**
 * The code graph: every TypeScript file in scope, its imports (resolved through
 * tsconfig path aliases) and the symbols it defines: exported functions,
 * classes, types, and the methods of exported classes (page-object actions,
 * API helpers).
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { Glob } from 'bun';

export const ROOT = resolve(import.meta.dir, '..');
/** What the search covers: the product, the framework, the tests, the QA tooling. */
export const SCOPE = ['app', 'framework', 'tests', 'qa', 'codesearch', 'agents'];

export type SymbolKind = 'function' | 'class' | 'const' | 'type' | 'interface' | 'enum' | 'method';

export type CodeSymbol = {
  name: string;
  kind: SymbolKind;
  file: string;
  line: number;
  /** The declaration line, trimmed. Enough to see the signature. */
  signature: string;
  /** For methods: the class they belong to. */
  owner?: string;
};

export type CodeFile = { path: string; imports: string[]; symbols: CodeSymbol[]; lines: number };

export type CodeIndex = {
  files: Map<string, CodeFile>;
  importers: Map<string, Set<string>>;
  symbols: CodeSymbol[];
};

const IMPORT =
  /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const DECL =
  /^export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(function|class|const|type|interface|enum)\s+([A-Za-z_$][\w$]*)/;
const METHOD =
  /^\s{2}(?:(?:public|protected|readonly|static|override)\s+)*(?:async\s+)?([a-z_$][\w$]*)\s*(?:<[^>]*>)?\(/;
const SKIP_METHODS = new Set(['constructor', 'if', 'for', 'while', 'switch', 'return', 'catch']);

type Aliases = [prefix: string, targets: string[]][];

function loadAliases(): Aliases {
  const tsconfig = JSON.parse(readFileSync(join(ROOT, 'tsconfig.json'), 'utf8')) as {
    compilerOptions: { paths?: Record<string, string[]> };
  };
  return Object.entries(tsconfig.compilerOptions.paths ?? {}).map(([k, v]) => [k, v]);
}

function resolveImport(from: string, spec: string, aliases: Aliases): string | undefined {
  let base: string | undefined;
  if (spec.startsWith('.')) base = resolve(ROOT, dirname(from), spec);
  else
    for (const [pattern, targets] of aliases) {
      const target = targets[0];
      if (!target) continue;
      if (pattern.endsWith('/*') && spec.startsWith(pattern.slice(0, -1)))
        base = resolve(ROOT, target.slice(0, -1) + spec.slice(pattern.length - 1));
      else if (pattern === spec) base = resolve(ROOT, target);
      if (base) break;
    }
  if (!base) return undefined;
  for (const candidate of [base, `${base}.ts`, join(base, 'index.ts')])
    if (candidate.endsWith('.ts') && existsSync(candidate)) return relative(ROOT, candidate).replaceAll('\\', '/');
  return undefined;
}

function parseFile(path: string, text: string, aliases: Aliases): CodeFile {
  const imports = new Set<string>();
  for (const m of text.matchAll(IMPORT)) {
    const spec = m[1] ?? m[2];
    const target = spec ? resolveImport(path, spec, aliases) : undefined;
    if (target && target !== path) imports.add(target);
  }
  const symbols: CodeSymbol[] = [];
  let owner: string | undefined;
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const decl = DECL.exec(line);
    if (decl?.[1] && decl[2]) {
      const kind = decl[1] as SymbolKind;
      symbols.push({ name: decl[2], kind, file: path, line: i + 1, signature: line.trim().replace(/\s*\{$/, '') });
      owner = kind === 'class' ? decl[2] : undefined;
      return;
    }
    if (line.startsWith('}')) owner = undefined;
    const method = owner ? METHOD.exec(line) : null;
    if (owner && method?.[1] && !SKIP_METHODS.has(method[1]))
      symbols.push({
        name: method[1],
        kind: 'method',
        file: path,
        line: i + 1,
        signature: line.trim().replace(/\s*\{$/, ''),
        owner,
      });
  });
  return { path, imports: [...imports], symbols, lines: lines.length };
}

let cached: { index: CodeIndex; stamp: string } | undefined;

/** Every .ts file in SCOPE, and a stamp of their paths and modification times (plus tsconfig's, for the aliases). */
function scan(): { paths: string[]; stamp: string } {
  const paths: string[] = [];
  for (const dir of SCOPE)
    for (const rel of new Glob(`${dir}/**/*.ts`).scanSync({ cwd: ROOT })) paths.push(rel.replaceAll('\\', '/'));
  paths.sort();
  const mtime = (p: string): number => statSync(join(ROOT, p)).mtimeMs;
  return {
    paths,
    stamp: [`tsconfig.json:${mtime('tsconfig.json')}`, ...paths.map((p) => `${p}:${mtime(p)}`)].join('|'),
  };
}

/**
 * The index of every .ts file in SCOPE. Cached, and rebuilt whenever a file was added, removed or changed since. The
 * codesearch MCP server lives as long as an agent session, and the agent writes page objects and helpers as it goes.
 */
export function codeIndex({ fresh = false } = {}): CodeIndex {
  const { paths, stamp } = scan();
  if (cached && !fresh && cached.stamp === stamp) return cached.index;
  const aliases = loadAliases();
  const files = new Map<string, CodeFile>();
  for (const path of paths) files.set(path, parseFile(path, readFileSync(join(ROOT, path), 'utf8'), aliases));
  const importers = new Map<string, Set<string>>();
  for (const f of files.values())
    for (const target of f.imports) {
      let set = importers.get(target);
      if (!set) importers.set(target, (set = new Set()));
      set.add(f.path);
    }
  const index: CodeIndex = { files, importers, symbols: [...files.values()].flatMap((f) => f.symbols) };
  cached = { index, stamp };
  return index;
}

/** Files reachable from `path` within `depth` hops, each way: what it imports and what imports it. */
export function related(path: string, depth = 1, index = codeIndex()): { imports: string[]; importers: string[] } {
  const walk = (start: string, next: (p: string) => Iterable<string>): string[] => {
    const seen = new Set<string>([start]);
    let frontier = [start];
    for (let d = 0; d < depth; d++) {
      const nxt: string[] = [];
      for (const p of frontier)
        for (const q of next(p))
          if (!seen.has(q)) {
            seen.add(q);
            nxt.push(q);
          }
      frontier = nxt;
    }
    seen.delete(start);
    return [...seen].sort();
  };
  return {
    imports: walk(path, (p) => index.files.get(p)?.imports ?? []),
    importers: walk(path, (p) => index.importers.get(p) ?? []),
  };
}
