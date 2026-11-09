import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Line checks for the owner's Playwright rules. This workspace file is the
 * source; a repo guards itself with a verbatim copy and a test calling `lintTree`.
 *
 *   bun playwright/lib/lint.ts <root> [dir-or-file ...] [--sleep-allowed=a.ts,b.ts] [--skip-files=c.ts]
 *
 * - waits: RULE-EVERY-PLAYWRIGHT-ACTION-WAITS-FOR-A-VISIBLE-READY-SIGNAL-OR,
 *   RULE-NEVER-USE-ISVISIBLE-IN-PLAYWRIGHT-WAIT-WITH-WAITFOR-VISIBLE
 * - evaluate, xpath: RULE-LOCATORS-BUILT-IN-FIRST-THEN-CSS-XPATH-LAST-NO-PAGE-EVALUATE
 * - timeouts: RULE-TIMEOUTS-FROM-A-TIMEOUT-ENUM-LIKE-OMNIA-DEFAULT-UNLESS-NO-SIGNAL
 *
 * What the rules allow as a last resort (a page script no locator can replace, an
 * XPath, a timeout above DEFAULT) carries `// last-resort: <why>` on its line or in
 * the comment lines right above it. Comment lines and trailing ` // ` comments are
 * not checked. Click and fill are not checked: they get a read-back only where one
 * failed (RULE-WHEN-A-FILL-OR-CLICK-DOES-NOT-TAKE-EFFECT-VERIFY-TYPE-AND-WAIT).
 */
export type Category = "waits" | "evaluate" | "xpath" | "timeouts";
export type Finding = { file: string; line: number; category: Category; why: string; text: string };
export type LintOptions = {
  categories?: Category[];
  /** Root-relative files that may sleep: a retry interval, a humanize helper's random pauses. */
  sleepAllowed?: string[];
  /** Root-relative files never checked, such as a copy of this linter. */
  skipFiles?: string[];
  /** Directory names never entered. */
  skipDirs?: string[];
};

type Check = {
  category: Category;
  why: string;
  pattern: RegExp;
  /** Only in files that import Playwright or a local browser module. */
  browserOnly?: boolean;
  /** Not checked in `sleepAllowed` files. */
  sleep?: boolean;
  /** Passes with a `last-resort:` marker. */
  markable?: boolean;
  /** Files where the check does not apply. */
  exceptIn?: RegExp;
};

const CHECKS: Check[] = [
  { category: "waits", why: "waitForTimeout: wait for the next state", pattern: /\bwaitForTimeout\s*\(/, sleep: true },
  { category: "waits", why: "networkidle: wait for the element or response that proves ready", pattern: /networkidle/i },
  { category: "waits", why: "isVisible(): use waitFor visible or appears()", pattern: /\.isVisible\s*\(/ },
  {
    category: "waits",
    why: "sleep in a browser file: use retryUntil",
    pattern: /\bBun\.sleep\s*\(|\bsetTimeout\s*\(\s*(resolve|res|r)\s*,/,
    browserOnly: true,
    sleep: true,
  },
  {
    category: "evaluate",
    why: "page script (evaluate, $eval, waitForFunction): use a locator or a Playwright API",
    pattern: /\.(evaluate|evaluateAll|evaluateHandle|\$eval|\$\$eval|waitForFunction)\s*\(/,
    markable: true,
  },
  { category: "xpath", why: "XPath: use a built-in or CSS locator", pattern: /xpath=|\.locator\(\s*["'`](\(*\/\/|\.\.)/, markable: true },
  {
    category: "timeouts",
    why: "numeric timeout: use a Timeout member, or none for the default",
    pattern: /\btimeout(Ms)?\s*[:=]\s*\d|\btimeout(Ms)?\b[^;,)]*\?\?\s*\d|\bsetDefault(Navigation)?Timeout\(\s*\d|\bappears\([^()]*,\s*\d/,
    browserOnly: true,
  },
  {
    category: "timeouts",
    why: "timeout above Timeout.DEFAULT",
    pattern: /\bTimeout\.(LONG|VERY_LONG|MAX)\b/,
    markable: true,
    exceptIn: /(^|\/)playwright\.config\.[cm]?[jt]s$/,
  },
];

const ALL: Category[] = ["waits", "evaluate", "xpath", "timeouts"];
const DRIVES_BROWSER =
  /from\s+["'](playwright-core|playwright|@playwright\/test|patchright|rebrowser-playwright)["']|from\s+["'][./]+(lib\/)?browser["']/;
const COMMENT_LINE = /^\s*(\/\/|\*|\/\*)/;
const TRAILING_COMMENT = /\s\/\/\s.*$/;
const MARKER = /last-resort:\s*\S/;
const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const DEFAULT_SKIP_DIRS = [
  "node_modules", ".git", "dist", "build", "out", "coverage", "test-results", "playwright-report",
  ".profiles", ".cli", ".state", ".astro", ".wrangler", ".vercel",
];

/** A marker on the line, or in the unbroken run of comment lines just above it. */
function marked(lines: string[], index: number): boolean {
  if (MARKER.test(lines[index] ?? "")) return true;
  for (let i = index - 1; i >= 0 && index - i <= 4 && COMMENT_LINE.test(lines[i] ?? ""); i--) {
    if (MARKER.test(lines[i] ?? "")) return true;
  }
  return false;
}

/** Findings for one file's text; `file` is the root-relative path with forward slashes. */
export function lintText(file: string, text: string, options: LintOptions = {}): Finding[] {
  const categories = new Set(options.categories ?? ALL);
  const browser = DRIVES_BROWSER.test(text);
  const sleepAllowed = options.sleepAllowed?.includes(file) ?? false;
  const checks = CHECKS.filter(
    (c) => categories.has(c.category) && (!c.browserOnly || browser) && !(c.sleep && sleepAllowed) && !c.exceptIn?.test(file),
  );
  const lines = text.split(/\r?\n/);
  const found: Finding[] = [];
  lines.forEach((raw, index) => {
    if (COMMENT_LINE.test(raw)) return;
    const code = raw.replace(TRAILING_COMMENT, "");
    for (const check of checks) {
      if (!check.pattern.test(code) || (check.markable && marked(lines, index))) continue;
      found.push({ file, line: index + 1, category: check.category, why: check.why, text: raw.trim().slice(0, 160) });
    }
  });
  return found;
}

function collect(path: string, skipDirs: Set<string>): string[] {
  if (!statSync(path).isDirectory()) return SOURCE.test(path) && !path.endsWith(".d.ts") ? [path] : [];
  return readdirSync(path).flatMap((name) => (skipDirs.has(name) ? [] : collect(join(path, name), skipDirs)));
}

/** Findings for every source file under `targets` (paths relative to `root`). */
export function lintTree(root: string, targets: string[], options: LintOptions = {}): Finding[] {
  const skipDirs = new Set(options.skipDirs ?? DEFAULT_SKIP_DIRS);
  return targets
    .flatMap((target) => collect(join(root, target), skipDirs))
    .flatMap((path) => {
      const file = relative(root, path).replaceAll("\\", "/");
      return options.skipFiles?.includes(file) ? [] : lintText(file, readFileSync(path, "utf8"), options);
    });
}

export function formatFinding(f: Finding): string {
  return `${f.file}:${f.line} [${f.category}] ${f.why}\n    ${f.text}`;
}

if ((import.meta as { main?: boolean }).main) {
  const args = process.argv.slice(2);
  // PowerShell turns an unquoted a,b into "a b": split on commas and spaces both.
  const list = (flag: string) =>
    args.filter((a) => a.startsWith(`--${flag}=`)).flatMap((a) => a.slice(flag.length + 3).split(/[,\s]+/).filter(Boolean));
  const [root = ".", ...targets] = args.filter((a) => !a.startsWith("--"));
  const found = lintTree(root, targets.length ? targets : ["."], {
    sleepAllowed: list("sleep-allowed"),
    skipFiles: list("skip-files"),
  });
  for (const finding of found) console.log(formatFinding(finding));
  console.log(`${found.length} finding(s)`);
  process.exit(found.length ? 1 : 0);
}
