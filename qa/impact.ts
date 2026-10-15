/**
 * Change-impact analysis and risk-based regression selection.
 *
 *   bun run qa:impact                       changes on this branch vs origin/main (or main)
 *   bun run qa:impact --base HEAD~3
 *   bun run qa:impact --files app/domain/pricing.ts,knowledge/rules/BR-SHIP-01.md
 *
 * Changed files → impacted features, through three paths:
 *   1. a feature card lists the file in `code:` (direct, weight 1.0);
 *   2. the file is imported — up to 3 hops — by a feature's code (weight 0.6, 0.4, 0.3);
 *   3. a vault document changed: a rule → its feature, a feature card → itself.
 * Framework and spec changes select the specs that import them. Global files
 * (server bootstrap, store, config, lockfile) select everything.
 *
 * Risk per feature = criticality (1–5) × impact weight × change-size factor ×
 * (1 + 0.5 per open defect). Output: out/impact.{json,md}, plus the Playwright
 * `--grep` that runs exactly the impacted tests (GitHub outputs `grep`, `full`).
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { codeIndex, type CodeIndex } from '../codesearch/index';
import { setOutputs, table, writeReport } from './report';
import { listTests, traceTags, type TestRecord } from './tests-catalog';
import { ROOT, Vault } from './vault';

export type ChangedFile = { path: string; linesChanged: number };

export type FeatureImpact = {
  id: string;
  title: string;
  criticality: number;
  weight: number;
  risk: number;
  level: 'high' | 'medium' | 'low';
  because: string[];
  openDefects: string[];
};

export type ImpactReport = {
  base: string;
  changed: ChangedFile[];
  full: boolean;
  fullReason?: string;
  features: FeatureImpact[];
  rules: string[];
  specs: string[];
  tests: { selected: number; total: number };
  grep: string;
  unmapped: string[];
};

/** Changing one of these can break anything: run the whole suite. */
const GLOBAL = [
  /^app\/(server|store|http)\.ts$/,
  /^framework\/(config|fixtures)\.ts$/,
  /^framework\/api\/client\.ts$/,
  /^playwright\.config\.ts$/,
  /^package\.json$/,
  /^bun\.lock$/,
  /^tsconfig\.json$/,
];
/** Files with no runtime effect on the product or the tests. */
const NO_TEST_IMPACT = [
  /\.md$/,
  /^\.claude\//,
  /^rag\//,
  /^agents\//,
  /^codesearch\//,
  /^qa\//,
  /^\.github\//,
  /^docs?\//,
  /^LICENSE$/,
  /^\.(git|prettier)/,
  /^eslint\.config\.ts$/,
  /^pyproject\.toml$/,
  /^uv\.lock$/,
  /^tests\/unit\//,
  /^knowledge\/(learnings|test-cases|cards|product)\//,
];
const HOP_WEIGHT = [1.0, 0.6, 0.4, 0.3];

/**
 * Specs that use what a framework file defines. Every spec imports everything
 * through `@fixtures`, so plain import edges would select the whole suite;
 * instead a spec counts when it names one of the file's exported symbols, a
 * fixture built from one (`cartPage` ← `new CartPage`), or a property typed
 * with one (`api.cart` ← `cart: CartApi`).
 */
export function specsUsing(
  path: string,
  index: CodeIndex,
  read = (p: string) => readFileSync(join(ROOT, p), 'utf8'),
): string[] {
  const file = index.files.get(path);
  if (!file) return [];
  const exported = file.symbols.filter((s) => s.kind !== 'method').map((s) => s.name);
  const aliases = new Set<string>(exported);
  const frameworkFiles = [...index.files.keys()].filter((p) => p.startsWith('framework/'));
  for (const name of exported) {
    for (const p of frameworkFiles) {
      const text = read(p);
      for (const m of text.matchAll(new RegExp(`(\\w+):\\s*async[^\\n]*new ${name}\\(`, 'g')))
        if (m[1]) aliases.add(m[1]);
      for (const m of text.matchAll(new RegExp(`readonly (\\w+): ${name};`, 'g'))) if (m[1]) aliases.add(`.${m[1]}.`);
    }
  }
  const specs: string[] = [];
  for (const spec of index.files.keys()) {
    if (!spec.endsWith('.spec.ts')) continue;
    if (index.files.get(spec)?.imports.includes(path)) {
      specs.push(spec);
      continue;
    }
    const text = read(spec);
    if ([...aliases].some((a) => (a.startsWith('.') ? text.includes(a) : new RegExp(`\\b${a}\\b`).test(text))))
      specs.push(spec);
  }
  return specs.sort();
}

function level(risk: number): FeatureImpact['level'] {
  return risk >= 3 ? 'high' : risk >= 1.5 ? 'medium' : 'low';
}

/** log-scaled: 1 line → 1.0, 50 lines → ~1.4, 500 lines → ~1.6. */
function sizeFactor(lines: number): number {
  return 1 + Math.log10(1 + lines) / 4.5;
}

export function analyzeImpact(
  changed: ChangedFile[],
  { vault, index, tests, base = '' }: { vault: Vault; index: CodeIndex; tests: TestRecord[]; base?: string },
): ImpactReport {
  const impacts = new Map<string, { weight: number; lines: number; because: Set<string> }>();
  const hit = (featureId: string, weight: number, lines: number, why: string): void => {
    const cur = impacts.get(featureId) ?? { weight: 0, lines: 0, because: new Set<string>() };
    cur.weight = Math.max(cur.weight, weight);
    cur.lines += lines;
    cur.because.add(why);
    impacts.set(featureId, cur);
  };
  const specs = new Set<string>();
  const rules = new Set<string>();
  const unmapped: string[] = [];
  let fullReason: string | undefined;

  for (const { path, linesChanged } of changed) {
    if (GLOBAL.some((re) => re.test(path))) {
      fullReason ??= `${path} is shared by every test`;
      continue;
    }
    // Vault documents with test impact: rules and feature cards.
    const doc = vault.docs.find((d) => d.path === path);
    if (doc?.type === 'rule') {
      const rule = vault.rule(doc.id);
      rules.add(doc.id);
      if (rule?.feature) hit(rule.feature, 1.0, linesChanged, `rule ${doc.id} changed`);
      continue;
    }
    if (doc?.type === 'feature') {
      hit(doc.id, 0.8, linesChanged, 'feature card changed');
      continue;
    }
    if (path.endsWith('.spec.ts') && path.startsWith('tests/')) {
      specs.add(path);
      continue;
    }
    if (path.startsWith('framework/')) {
      for (const spec of specsUsing(path, index)) specs.add(spec);
      continue;
    }
    if (path.startsWith('app/')) {
      let mapped = false;
      for (const f of vault.features)
        if (f.code.includes(path)) {
          hit(f.id, HOP_WEIGHT[0] ?? 1, linesChanged, `${path} is its code`);
          mapped = true;
        }
      // Reverse dependencies: who imports the changed file, hop by hop.
      let frontier = [path];
      const seen = new Set(frontier);
      for (let hop = 1; hop <= 3; hop++) {
        const next: string[] = [];
        for (const p of frontier)
          for (const importer of index.importers.get(p) ?? [])
            if (!seen.has(importer)) {
              seen.add(importer);
              next.push(importer);
              for (const f of vault.features)
                if (f.code.includes(importer)) {
                  hit(f.id, HOP_WEIGHT[hop] ?? 0.3, linesChanged, `${importer} imports ${p}`);
                  mapped = true;
                }
            }
        frontier = next;
      }
      if (path.startsWith('app/web/')) {
        // The UI bundle: every UI test.
        for (const t of tests) if (t.file.startsWith('tests/ui/')) specs.add(t.file);
        mapped = true;
      }
      if (!mapped) unmapped.push(path);
      continue;
    }
    if (!NO_TEST_IMPACT.some((re) => re.test(path))) unmapped.push(path);
  }

  const features: FeatureImpact[] = [...impacts.entries()]
    .map(([id, i]) => {
      const f = vault.feature(id);
      const criticality = f?.criticality ?? 3;
      const openDefects = vault.openDefects(id).map((d) => d.id);
      const risk =
        Math.round(criticality * i.weight * sizeFactor(i.lines) * (1 + 0.5 * openDefects.length) * 100) / 100;
      return {
        id,
        title: f?.title ?? id,
        criticality,
        weight: i.weight,
        risk,
        level: level(risk),
        because: [...i.because],
        openDefects,
      };
    })
    .sort((a, b) => b.risk - a.risk);

  const ids = new Set([...features.map((f) => f.id), ...rules]);
  const selected = fullReason
    ? tests
    : tests.filter((t) => specs.has(t.file) || traceTags(t).some((tag) => ids.has(tag)));
  // Playwright's --grep matches the file path as well as title and tags, so one regex selects both.
  const specPattern = (s: string): string =>
    s
      .replace(/^tests\//, '')
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replaceAll('/', '[\\\\/]');
  const grepParts = [...[...ids].map((id) => `@${id}\\b`), ...[...specs].map(specPattern)];
  const grep = fullReason ? '' : grepParts.join('|');

  return {
    base,
    changed,
    full: Boolean(fullReason),
    ...(fullReason ? { fullReason } : {}),
    features,
    rules: [...rules],
    specs: [...specs].sort(),
    tests: { selected: selected.length, total: tests.length },
    grep,
    unmapped,
  };
}

export function toMarkdown(r: ImpactReport): string {
  const lines = [`## Change impact${r.base ? ` vs \`${r.base}\`` : ''}`, ''];
  lines.push(
    r.full
      ? `**Full regression** — ${r.fullReason ?? ''}.`
      : `**${r.tests.selected} of ${r.tests.total}** tests selected (${r.features.length} features, ${r.specs.length} specs).`,
    '',
  );
  if (r.features.length)
    lines.push(
      table(
        ['Risk', 'Feature', 'Criticality', 'Why', 'Open defects'],
        r.features.map((f) => [
          `${f.level} (${f.risk})`,
          `${f.id} — ${f.title}`,
          f.criticality,
          f.because.slice(0, 3).join('; '),
          f.openDefects.join(', ') || '—',
        ]),
      ),
      '',
    );
  if (r.specs.length) lines.push(`Specs selected directly: ${r.specs.map((s) => `\`${s}\``).join(', ')}`, '');
  if (r.unmapped.length)
    lines.push(
      `⚠️ Changed files no feature card maps (add them to a card's \`code:\`): ${r.unmapped.map((s) => `\`${s}\``).join(', ')}`,
      '',
    );
  lines.push(
    `<details><summary>${r.changed.length} changed files</summary>\n\n${r.changed.map((c) => `- \`${c.path}\` (${c.linesChanged} lines)`).join('\n')}\n</details>`,
  );
  return lines.join('\n');
}

function git(...args: string[]): string {
  const run = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`git ${args.join(' ')}: ${run.stderr}`);
  return run.stdout;
}

function changedFiles(base: string): ChangedFile[] {
  const out = git('diff', '--numstat', `${base}...HEAD`) + git('diff', '--numstat', 'HEAD');
  const byPath = new Map<string, number>();
  for (const line of out.split('\n')) {
    const [added, removed, path] = line.split('\t');
    if (!path) continue;
    const n = (Number(added) || 0) + (Number(removed) || 0);
    byPath.set(path, (byPath.get(path) ?? 0) + n);
  }
  return [...byPath].map(([path, linesChanged]) => ({ path, linesChanged }));
}

function defaultBase(): string {
  for (const ref of ['origin/main', 'main'])
    if (spawnSync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd: ROOT }).status === 0) return ref;
  return 'HEAD~1';
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: { base: { type: 'string' }, files: { type: 'string' }, quiet: { type: 'boolean' } },
  });
  const base = values.base ?? (values.files ? '' : defaultBase());
  const changed = values.files
    ? values.files
        .split(/[,\s]+/)
        .filter(Boolean)
        .map((path) => ({ path: path.trim(), linesChanged: 1 }))
    : changedFiles(base);
  const report = analyzeImpact(changed, { vault: new Vault(), index: codeIndex(), tests: listTests(), base });
  const md = toMarkdown(report);
  writeReport('impact', report, md);
  setOutputs({
    grep: report.grep,
    full: report.full,
    selected: report.tests.selected,
    none: !report.full && report.tests.selected === 0,
  });
  if (!values.quiet) console.log(md);
}
