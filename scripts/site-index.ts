/**
 * Builds the GitHub Pages landing page for one CI run: the release assessment
 * and traceability (rendered from their Markdown) plus a link to the full
 * Playwright HTML report.
 *
 *   bun run scripts/site-index.ts <site dir>     expects release-gate.md, traceability.md, report/
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { marked } from 'marked';

const site = process.argv[2] ?? 'site';
const section = async (file: string): Promise<string> => marked.parse(readFileSync(join(site, file), 'utf8'));
const run = process.env.GITHUB_RUN_NUMBER ? `run #${process.env.GITHUB_RUN_NUMBER}` : 'local run';
const sha = (process.env.GITHUB_SHA ?? '').slice(0, 7);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>agentic-qa · QA report</title>
<style>
  :root { --fg:#17233a; --muted:#5d6879; --line:#d7e0e5; --accent:#087f7b; --bg:#fff; }
  @media (prefers-color-scheme: dark) { :root { --fg:#e6edf3; --muted:#9aa7b4; --line:#30363d; --accent:#3fb9b3; --bg:#0d1117; } }
  body { margin:0; padding:24px 16px; font:15px/1.5 system-ui,sans-serif; color:var(--fg); background:var(--bg); }
  main { max-width:1100px; margin:0 auto; }
  a { color:var(--accent); }
  table { border-collapse:collapse; width:100%; margin:8px 0 16px; font-size:14px; display:block; overflow-x:auto; }
  th, td { border-bottom:1px solid var(--line); padding:6px 8px; text-align:left; vertical-align:top; }
  .meta { color:var(--muted); }
  .cta { display:inline-block; margin:8px 0 24px; padding:8px 14px; border:1px solid var(--accent); border-radius:6px; text-decoration:none; }
</style>
</head>
<body><main>
<h1>agentic-qa · QA report</h1>
<p class="meta">${run}${sha ? ` · ${sha}` : ''} · <a href="https://github.com/hoanglan9569/agentic-qa">repository</a></p>
<a class="cta" href="report/index.html">Open the Playwright report →</a>
${await section('release-gate.md')}
${await section('traceability.md')}
</main></body></html>
`;
writeFileSync(join(site, 'index.html'), html);
console.log(`wrote ${join(site, 'index.html')}`);
