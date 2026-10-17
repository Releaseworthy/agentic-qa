/**
 * Guards the vault against changes that skipped curation. Compares knowledge/ and the learned probes between a base
 * ref and the working tree; each change must be one the knowledge MCP made and recorded.
 *
 *   bun run qa:knowledge-guard [--base origin/main]
 *
 *   knowledge/_curation/ledger.jsonl     append-only; every new line a well-formed decision
 *   knowledge/learnings/, features/      only as an `accepted` ledger line of this diff states it: its doc id and the
 *                                        sha of the file's exact content (an edit after the judge's verdict fails)
 *   knowledge/_curation/proposals/       only for a `needs-human` ledger line of this diff
 *   rag/golden.learned.yaml              probes added by accepted lines, removed by accepted deprecations
 *   knowledge/test-cases/, defects/      QA artifacts written with upsert_document, checked by `qa:vault`
 *   knowledge/setup/SETUP-RECIPES.md     generated; `qa:arrange --check` proves it matches the code
 *   anything else, and every deletion    never from an agent: rules, cards and the overview are Product's
 *
 * Runs in the agent's job, again in the job that publishes its patch, and in CI, where it blocks agentic/* branches
 * and reports on the rest (a human editing a rule in a pull request is how rules change).
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { YAML } from 'bun';
import { table, writeReport } from '@qa/report';
import { ROOT } from '@qa/vault';

/** One file between the base ref and the working tree; `undefined` = absent on that side. */
export type FileChange = { path: string; before: string | undefined; after: string | undefined };
export type GuardFinding = { file: string; allowed: boolean; detail: string };

export const LEDGER = 'knowledge/_curation/ledger.jsonl';
export const LEARNED = 'rag/golden.learned.yaml';
const PROPOSALS = 'knowledge/_curation/proposals/';

type Decision = { id: string; decision: string; kind?: string; doc: string; sha: string };
type Probe = { q?: unknown; expected?: unknown; from?: unknown };

/** The sha rag/curate.py records for an accepted write: the first 12 hex of SHA-256 over the LF content. */
export function contentSha(text: string): string {
  return createHash('sha256').update(text.replaceAll('\r\n', '\n'), 'utf8').digest('hex').slice(0, 12);
}

function idOf(markdown: string): string | undefined {
  const m = /^---\n([\s\S]*?)\n---/.exec(markdown.replaceAll('\r\n', '\n'));
  if (!m?.[1]) return undefined;
  const meta = YAML.parse(m[1]) as Record<string, unknown> | null;
  return typeof meta?.id === 'string' ? meta.id : undefined;
}

const nonEmptyLines = (text: string | undefined): string[] => (text ?? '').split('\n').filter((l) => l.trim() !== '');

function probes(text: string | undefined): Probe[] {
  const parsed: unknown = text ? YAML.parse(text) : [];
  return Array.isArray(parsed) ? (parsed as Probe[]) : [];
}

const probeKey = (p: Probe): string => JSON.stringify([p.q, p.expected, p.from]);
const probeDoc = (p: Probe): string | undefined =>
  Array.isArray(p.expected) && p.expected.length === 1 && typeof p.expected[0] === 'string' ? p.expected[0] : undefined;

/** The decisions a diff appends to the ledger, or why the ledger change is not an append. */
function appended(change: FileChange | undefined): { decisions: Decision[]; problems: string[] } {
  if (!change) return { decisions: [], problems: [] };
  const before = nonEmptyLines(change.before);
  const after = nonEmptyLines(change.after);
  if (before.some((line, i) => after[i] !== line))
    return { decisions: [], problems: ['the ledger is append-only: an earlier decision was changed or removed'] };
  const decisions: Decision[] = [];
  const problems: string[] = [];
  for (const line of after.slice(before.length)) {
    let d: Partial<Decision> | undefined;
    try {
      d = JSON.parse(line) as Partial<Decision>;
    } catch {
      d = undefined;
    }
    if (
      typeof d?.id === 'string' &&
      typeof d.decision === 'string' &&
      typeof d.doc === 'string' &&
      typeof d.sha === 'string'
    )
      decisions.push(d as Decision);
    else problems.push(`not a ledger decision: ${line.slice(0, 80)}`);
  }
  return { decisions, problems };
}

function learnedProbes(change: FileChange, accepted: Decision[]): GuardFinding[] {
  const before = probes(change.before);
  const after = probes(change.after);
  const had = new Set(before.map(probeKey));
  const has = new Set(after.map(probeKey));
  const added = after.filter((p) => !had.has(probeKey(p)));
  const findings: GuardFinding[] = [];
  for (const p of added) {
    const by = accepted.find((d) => d.id === p.from && d.doc === probeDoc(p) && d.kind !== 'deprecate');
    findings.push({
      file: LEARNED,
      allowed: Boolean(by),
      detail: by ? `probe for ${by.doc} (${by.id})` : `probe "${String(p.q)}" has no accepted decision in this diff`,
    });
  }
  for (const p of before.filter((x) => !has.has(probeKey(x)))) {
    // Re-learning the same question replaces its probe; a deprecation removes the document's probes.
    const replaced = added.some((a) => a.q === p.q);
    const by = accepted.find((d) => d.kind === 'deprecate' && d.doc === probeDoc(p));
    findings.push({
      file: LEARNED,
      allowed: replaced || Boolean(by),
      detail: replaced
        ? `probe "${String(p.q)}" re-learned`
        : by
          ? `probe for ${by.doc} removed by its deprecation (${by.id})`
          : `probe "${String(p.q)}" removed without an accepted deprecation`,
    });
  }
  return findings;
}

/** Every change to the vault and the learned probes, judged against the ledger lines the same diff appends. */
export function guard(changes: FileChange[]): GuardFinding[] {
  const findings: GuardFinding[] = [];
  const add = (file: string, allowed: boolean, detail: string): void => {
    findings.push({ file, allowed, detail });
  };
  const ledger = appended(changes.find((c) => c.path === LEDGER));
  for (const problem of ledger.problems) add(LEDGER, false, problem);
  if (ledger.decisions.length) add(LEDGER, true, `${ledger.decisions.length} new decision(s)`);
  const accepted = ledger.decisions.filter((d) => d.decision === 'accepted');

  for (const c of changes) {
    if (c.path === LEDGER) continue;
    if (c.path === LEARNED) {
      findings.push(...learnedProbes(c, accepted));
      continue;
    }
    if (!c.path.startsWith('knowledge/')) continue;
    if (c.after === undefined) {
      add(c.path, false, 'deleted: an agent deprecates vault documents and never removes them');
      continue;
    }
    const folder = c.path.split('/')[1] ?? '';
    if (folder === 'test-cases' || folder === 'defects')
      add(c.path, true, 'QA artifact (upsert_document), checked by qa:vault');
    else if (c.path === 'knowledge/setup/SETUP-RECIPES.md')
      add(c.path, true, 'generated from framework/setup/recipes.ts, qa:arrange --check proves it');
    else if (c.path.startsWith(PROPOSALS)) {
      const id = basename(c.path, '.md');
      const filed = ledger.decisions.some((d) => d.id === id && d.decision === 'needs-human');
      add(
        c.path,
        filed,
        filed ? `filed for a human (${id})` : 'a proposal file without its needs-human ledger decision',
      );
    } else if (folder === 'learnings' || folder === 'features') {
      const id = idOf(c.after);
      const sha = contentSha(c.after);
      const by = accepted.find((d) => d.doc === id && d.sha === sha);
      add(
        c.path,
        Boolean(by),
        by
          ? `accepted by ${by.id} (sha ${sha})`
          : `no accepted ledger decision in this diff matches ${id ?? 'it'} at sha ${sha}, so it skipped the gate and the judge`,
      );
    } else add(c.path, false, `${folder || c.path} is Product's: a human edits it; an agent files propose_knowledge`);
  }
  return findings;
}

function git(args: string[]): { ok: boolean; out: string } {
  const run = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: run.status === 0, out: run.stdout };
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: { base: { type: 'string', default: 'origin/main' } },
  });
  const base = values.base;
  if (!git(['rev-parse', '--verify', '--quiet', base]).ok) throw new Error(`--base ${base} is not a ref`);
  const scope = ['knowledge', LEARNED];
  const paths = [
    ...git(['diff', '--name-only', base, '--', ...scope]).out.split('\n'),
    ...git(['ls-files', '--others', '--exclude-standard', '--', ...scope]).out.split('\n'),
  ].filter(Boolean);
  const changes: FileChange[] = [...new Set(paths)].map((path) => {
    const before = git(['show', `${base}:${path}`]);
    return {
      path,
      before: before.ok ? before.out : undefined,
      after: existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path), 'utf8') : undefined,
    };
  });
  const findings = guard(changes);
  const blocked = findings.filter((f) => !f.allowed);
  const md = [
    `## Knowledge guard: ${blocked.length ? `BLOCKED (${blocked.length})` : 'OK'}`,
    '',
    `Base \`${base}\` · ${changes.length} changed file(s) in knowledge/ and the learned probes.`,
    '',
    findings.length
      ? table(
          ['', 'File', 'Detail'],
          findings.map((f) => [f.allowed ? '✓' : '✗', f.file, f.detail]),
        )
      : 'Nothing to review.',
    '',
    blocked.length
      ? 'The vault changes only through the knowledge MCP: test cases and defects with `upsert_document`, everything ' +
        'else with `propose_knowledge` → `knowledge-curator` → `commit_knowledge`. Revert the blocked files.'
      : '',
  ].join('\n');
  writeReport('knowledge-guard', { base, findings }, md);
  console.log(md);
  process.exit(blocked.length ? 1 : 0);
}
