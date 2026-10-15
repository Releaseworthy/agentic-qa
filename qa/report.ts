import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT } from './vault';

/** Writes `out/<name>.json` and `out/<name>.md`; appends the Markdown to the GitHub job summary when there is one. */
export function writeReport(name: string, data: unknown, markdown: string): { json: string; md: string } {
  const json = join(ROOT, 'out', `${name}.json`);
  const md = join(ROOT, 'out', `${name}.md`);
  mkdirSync(dirname(json), { recursive: true });
  writeFileSync(json, JSON.stringify(data, null, 2));
  writeFileSync(md, markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  return { json, md };
}

/** `key=value` lines for later workflow steps (`steps.<id>.outputs.<key>`). */
export function setOutputs(values: Record<string, string | number | boolean>): void {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(values)
      .map(([k, v]) => `${k}=${String(v)}\n`)
      .join(''),
  );
}

export function table(header: string[], rows: (string | number)[][]): string {
  const esc = (c: string | number) => String(c).replaceAll('|', '\\|');
  return [
    `| ${header.map(esc).join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`),
  ].join('\n');
}
