/**
 * Human feedback on a pull request for the `learn` workflow: reviews, review comments (with path and line) and
 * conversation comments, only from the repository's owner, members and collaborators. Anyone can comment on a
 * public repo; an outsider's comment must never become an agent's instruction or a lesson.
 *
 *   bun run qa:pr-feedback <PR number> [--repo owner/name]     → JSON on stdout, out/pr-feedback/<n>.json
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT } from '@qa/vault';

/** GitHub's `author_association` values whose words count. */
export const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

export type RawComment = {
  user?: { login?: string; type?: string } | null;
  author_association?: string;
  body?: string | null;
  path?: string;
  line?: number | null;
  state?: string;
  html_url?: string;
};

export type Feedback = {
  kind: 'review' | 'review-comment' | 'comment';
  author: string;
  body: string;
  url: string;
  path?: string;
  line?: number;
  state?: string;
};

/** Keeps trusted, human, non-empty feedback; counts what was dropped. */
export function trusted(kind: Feedback['kind'], raw: RawComment[]): { kept: Feedback[]; dropped: number } {
  const kept: Feedback[] = [];
  let dropped = 0;
  for (const c of raw) {
    const body = (c.body ?? '').trim();
    if (!body) continue;
    if (!TRUSTED.has(c.author_association ?? '') || c.user?.type === 'Bot') {
      dropped++;
      continue;
    }
    kept.push({
      kind,
      author: c.user?.login ?? '',
      body,
      url: c.html_url ?? '',
      ...(c.path ? { path: c.path } : {}),
      ...(typeof c.line === 'number' ? { line: c.line } : {}),
      ...(c.state ? { state: c.state } : {}),
    });
  }
  return { kept, dropped };
}

/** Every page of a list endpoint (page by page: older gh releases lack `--slurp`). */
function ghJson(path: string): RawComment[] {
  const all: RawComment[] = [];
  for (let page = 1; page <= 50; page++) {
    const run = spawnSync('gh', ['api', `${path}?per_page=100&page=${page}`], { cwd: ROOT, encoding: 'utf8' });
    if (run.status !== 0) throw new Error(`gh api ${path}: ${run.stderr}`);
    const items = JSON.parse(run.stdout) as RawComment[];
    all.push(...items);
    if (items.length < 100) break;
  }
  return all;
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: { repo: { type: 'string', default: '{owner}/{repo}' } },
  });
  const pr = positionals[0];
  if (!pr || !/^\d+$/.test(pr)) throw new Error('usage: bun run qa:pr-feedback <PR number> [--repo owner/name]');
  const base = `repos/${values.repo}`;
  const parts = [
    trusted('review', ghJson(`${base}/pulls/${pr}/reviews`)),
    trusted('review-comment', ghJson(`${base}/pulls/${pr}/comments`)),
    trusted('comment', ghJson(`${base}/issues/${pr}/comments`)),
  ];
  const out = {
    pr: Number(pr),
    feedback: parts.flatMap((p) => p.kept),
    droppedUntrusted: parts.reduce((n, p) => n + p.dropped, 0),
  };
  const dir = join(ROOT, 'out', 'pr-feedback');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${pr}.json`), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}
