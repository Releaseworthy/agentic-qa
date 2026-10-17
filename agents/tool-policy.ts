/**
 * What an agent may do, checked before every tool call. `.claude/settings.json` runs agents/tool-policy-hook.ts for
 * interactive Claude Code, and agents/run.ts loads the same project settings, so headless runs get the same hook.
 *
 *   Knowledge writes by role   commit_knowledge: only the knowledge-curator subagent (a proposer never judges
 *                              itself) · upsert_document: only qa-writer
 *   File writes                the vault (knowledge/) changes only through the knowledge MCP, never with Write/Edit or
 *                              a shell redirect; a headless run (AGENTIC_QA_RUN set) writes only tests/, framework/, out/
 *   Shell                      no pushes, commits, fetches or remotes; gh read-only (plain GET; PR feedback only through
 *                              `bun run qa:pr-feedback`, which drops comments from outside the repo's members);
 *                              curl/wget only to localhost; no reading the credentials in the environment
 *
 * The shell rules narrow what an agent does by accident or under prompt injection. They are not a sandbox (an agent
 * that writes and runs a script can get around them), so CI also gives the agent job a read-only token, and the job that
 * publishes the agent's patch checks it again (qa/heal-guard.ts, qa/knowledge-guard.ts).
 */

import { isAbsolute, join, relative, resolve } from 'node:path';

const ROOT = join(import.meta.dir, '..');

/** Who is calling and where: the subagent (none = the main session), its working directory, a headless run or not. */
export type Caller = { agentType?: string | undefined; cwd?: string | undefined; headless?: boolean | undefined };

const KNOWLEDGE_WRITERS: Record<string, string> = {
  mcp__knowledge__commit_knowledge: 'knowledge-curator',
  mcp__knowledge__upsert_document: 'qa-writer',
};

/** File tools and the input key that names the file they write. */
const FILE_TOOLS: Record<string, string> = {
  Write: 'file_path',
  Edit: 'file_path',
  MultiEdit: 'file_path',
  NotebookEdit: 'notebook_path',
};

const SECRETS =
  /\b(ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN|GH_TOKEN|GITHUB_TOKEN|AGENT_PR_TOKEN|STRING_HEX_SHOPLITE|LANGSMITH_API_KEY|NEO4J_PASSWORD)\b|\/proc\/[^/\s]+\/environ\b/;
const LOCAL_HOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/;

const VAULT_RULE =
  'the vault changes only through the knowledge MCP: test cases and defects with upsert_document (qa-writer), ' +
  'everything else with propose_knowledge → knowledge-curator → commit_knowledge; Product-owned documents are edited by a human';
const HEADLESS_WRITABLE = ['tests/', 'framework/', 'out/'];

// ---- file writes ----------------------------------------------------------------------------------------------

/** Why writing `path` is refused, or undefined when it may be written. Paths outside the repo (temp files) are free. */
export function writeDenial(path: string, { cwd = ROOT, headless = false }: Caller = {}): string | undefined {
  const rel = relative(ROOT, resolve(cwd, path)).replaceAll('\\', '/');
  if (rel === '..' || rel.startsWith('../') || isAbsolute(rel)) return undefined;
  if (rel === 'knowledge' || rel.startsWith('knowledge/')) return `${rel}: ${VAULT_RULE}`;
  if (headless && !HEADLESS_WRITABLE.some((dir) => rel.startsWith(dir)))
    return `${rel || '.'}: a headless run writes only ${HEADLESS_WRITABLE.join(', ')} (the vault through the knowledge MCP)`;
  return undefined;
}

/** Targets of `>`, `>>`, `&>` and `>|` in one simple command. Ignores `2>&1` and any `>` inside quotes. */
export function redirectTargets(command: string): string[] {
  const masked = command.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, (quoted) => ' '.repeat(quoted.length));
  const targets: string[] = [];
  for (const m of masked.matchAll(/(?:\d|&)?>>?\|?/g)) {
    let i = m.index + m[0].length;
    if (command[i] === '&') continue; // fd duplication: >&2, 2>&1
    while (command[i] === ' ' || command[i] === '\t') i++;
    const target = /^(?:"([^"]*)"|'([^']*)'|([^\s;|&<>()]+))/.exec(command.slice(i));
    if (target) targets.push(target[1] ?? target[2] ?? target[3] ?? '');
  }
  return targets.filter((t) => t !== '' && !/^\/dev\/(null|stdout|stderr)$/.test(t));
}

// ---- shell ----------------------------------------------------------------------------------------------------

/** The text inside `$(…)` and backticks, so a substituted command is checked like any other. */
function substitutions(line: string): string[] {
  const found: string[] = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '$' && line[i + 1] === '(' && line[i + 2] !== '(') {
      let depth = 0;
      for (let j = i + 1; j < line.length; j++) {
        if (line[j] === '(') depth++;
        else if (line[j] === ')' && --depth === 0) {
          found.push(line.slice(i + 2, j));
          i = j;
          break;
        }
      }
    }
  }
  for (const m of line.matchAll(/`([^`]*)`/g)) found.push(m[1] ?? '');
  return found;
}

/**
 * One shell command line → its simple commands (`a && b | c; d & e` → a, b, c, d, e), without leading `VAR=x`, plus
 * the commands inside substitutions. Separators inside quotes don't count; `>|` (a redirect) and `2>&1` aren't ones.
 */
export function commandsOf(line: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: string | undefined;
  for (let i = 0; i < line.length; i++) {
    const c = line[i] ?? '';
    if (quote) {
      current += c;
      if (c === '\\' && quote === '"') current += line[++i] ?? '';
      else if (c === quote) quote = undefined;
      continue;
    }
    if (c === "'" || c === '"') quote = c;
    if (c === '\\') {
      current += c + (line[++i] ?? '');
      continue;
    }
    const two = line.slice(i, i + 2);
    const prev = line[i - 1];
    const width =
      two === '&&' || two === '||' || two === '|&'
        ? 2
        : c === ';' ||
            c === '\n' ||
            (c === '|' && prev !== '>') ||
            (c === '&' && prev !== '>' && prev !== '<' && line[i + 1] !== '>')
          ? 1
          : 0;
    if (width) {
      parts.push(current);
      current = '';
      i += width - 1;
    } else current += c;
  }
  parts.push(current);
  const own = parts.map((p) => p.trim().replace(/^(\w+=\S*\s+)+/, '')).filter(Boolean);
  return [...own, ...substitutions(line).flatMap(commandsOf)];
}

/** Splits a simple command into words; quotes group, they don't nest. */
function words(command: string): string[] {
  return [...command.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
}

/** `/usr/bin/gh`, `gh.exe` and `GH` are all gh. */
function binName(word: string): string {
  return (word.split(/[\\/]/).pop() ?? word).toLowerCase().replace(/\.exe$/, '');
}

/** `--name=value` → [--name, value]; `-Xvalue` → [-X, value]; anything else → [word, undefined]. */
function flagOf(word: string): [string, string | undefined] {
  if (word.startsWith('--')) {
    const at = word.indexOf('=');
    return at < 0 ? [word, undefined] : [word.slice(0, at), word.slice(at + 1)];
  }
  return word.length > 2 ? [word.slice(0, 2), word.slice(2)] : [word, undefined];
}

const PR_FEEDBACK = 'PR comments and reviews come from `bun run qa:pr-feedback <n>` (members only)';
const GH_API_READ_ONLY = '`gh api` is read-only here: a plain GET, with --jq / --paginate / -H at most';
const GH_API_VALUE_FLAGS = new Set(['-q', '--jq', '-t', '--template', '-H', '--header', '--cache', '--hostname']);
const GH_API_SWITCHES = new Set(['--paginate', '--slurp', '-i', '--include', '--silent', '--verbose']);

function ghApiDenial(args: string[]): string | undefined {
  let method = 'GET';
  const endpoints: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const word = args[i] ?? '';
    if (!word.startsWith('-')) {
      endpoints.push(word);
      continue;
    }
    const [flag, attached] = flagOf(word);
    if (flag === '-X' || flag === '--method') method = attached ?? args[++i] ?? '';
    else if (GH_API_VALUE_FLAGS.has(flag)) {
      if (attached === undefined) i++;
    } else if (!(GH_API_SWITCHES.has(flag) && attached === undefined)) return `${GH_API_READ_ONLY} (not ${flag})`;
  }
  if (!['GET', 'HEAD'].includes(method.toUpperCase())) return GH_API_READ_ONLY;
  if (endpoints.some((e) => /^graphql$/i.test(e))) return `${GH_API_READ_ONLY} (not graphql)`;
  if (endpoints.some((e) => /\/(comments|reviews)\b/.test(e))) return PR_FEEDBACK;
  return undefined;
}

function ghDenial(args: string[]): string | undefined {
  const [sub, action] = args;
  if (sub === 'pr' && (action === 'view' || action === 'diff')) {
    const json = args.flatMap((word, i) =>
      word === '--json' ? [args[i + 1] ?? ''] : word.startsWith('--json=') ? [word.slice(7)] : [],
    );
    if (args.includes('--comments') || args.includes('-c') || json.some((j) => /\b(comments|reviews)\b/.test(j)))
      return PR_FEEDBACK;
    return undefined;
  }
  if (sub === 'api') return ghApiDenial(args.slice(1));
  return `\`gh ${sub ?? ''} ${action ?? ''}\` is not allowed. Only gh pr view/diff and read-only gh api are allowed`;
}

/** git options that come before the subcommand and take the next word as their value. */
const GIT_VALUE_OPTIONS = new Set(['-C', '--git-dir', '--work-tree', '--namespace', '--super-prefix']);
const GIT_DENIED = new Set([
  'push',
  'commit',
  'remote',
  'config',
  'credential',
  'fetch',
  'pull',
  'clone',
  'ls-remote',
  'submodule',
]);

function gitDenial(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const word = args[i] ?? '';
    if (!word.startsWith('-')) {
      if (GIT_DENIED.has(word)) return `\`git ${word}\` is not allowed. CI commits, pushes and opens the PR`;
      return undefined;
    }
    const [flag] = flagOf(word);
    // A config override can define an alias that runs anything (`-c alias.x='!git push'`).
    if (flag === '-c' || flag === '--config-env' || flag === '--exec-path')
      return `\`git ${flag}\` is not allowed (no config overrides)`;
    if (GIT_VALUE_OPTIONS.has(word)) i++;
  }
  return undefined;
}

/** Commands that run another command named among their arguments (`xargs -I {} gh …`, `timeout 10 git …`). */
const WRAPPERS = new Set(['command', 'exec', 'nohup', 'time', 'timeout', 'sudo', 'nice', 'xargs']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'pwsh', 'powershell', 'cmd']);
/** Commands this policy looks inside; a wrapper is checked from the first of them it runs. */
const CHECKED = new Set(['git', 'gh', 'curl', 'wget', 'env', 'printenv', 'eval', ...WRAPPERS, ...SHELLS]);
/** Commands that write the files they name. */
const FILE_WRITERS = new Set(['tee', 'cp', 'mv', 'rm', 'touch', 'truncate', 'ln', 'sed', 'perl']);

/** Words back into a command line, re-quoting the ones with spaces. */
const unwords = (ws: string[]): string => ws.map((w) => (/\s/.test(w) ? JSON.stringify(w) : w)).join(' ');

function simpleDenial(command: string, caller: Caller): string | undefined {
  for (const target of redirectTargets(command)) {
    const why = writeDenial(target, caller);
    if (why) return why;
  }
  const [bin = '', ...args] = words(command);
  const name = binName(bin);
  if (name === 'eval') return bashDenial(args.join(' '), caller);
  if (WRAPPERS.has(name)) {
    const at = args.findIndex((a) => CHECKED.has(binName(a)) || FILE_WRITERS.has(binName(a)));
    return at >= 0 ? simpleDenial(unwords(args.slice(at)), caller) : undefined;
  }
  if (SHELLS.has(name)) {
    const at = args.findIndex((a) => /^(-[a-z]*c|-command|\/c)$/i.test(a));
    return at >= 0 ? bashDenial(args[at + 1] ?? '', caller) : undefined;
  }
  if (
    name === 'env' ||
    name === 'printenv' ||
    name === 'compgen' ||
    name === 'declare' ||
    (name === 'set' && !args.length)
  )
    return 'the environment holds credentials; read the env/ files instead';
  if (name === 'export' && (!args.length || args.includes('-p')))
    return 'the environment holds credentials; read the env/ files instead';
  if (name === 'git') return gitDenial(args);
  if (name === 'gh') return ghDenial(args);
  if (name === 'curl' || name === 'wget') {
    const urls = args.filter((a) => /^https?:\/\//.test(a));
    if (urls.length === 0 || urls.some((u) => !LOCAL_HOST.test(u)))
      return `\`${name}\` is allowed only to ShopLite on localhost, no other network access`;
  }
  if (FILE_WRITERS.has(name)) {
    const editor = name === 'sed' || name === 'perl';
    if (editor && !args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))) return undefined;
    const paths = args.filter((a) => !a.startsWith('-'));
    // sed / perl: the first word is the script; cp: only the destination is written.
    const written = editor ? paths.slice(1) : name === 'cp' ? paths.slice(-1) : paths;
    for (const path of written) {
      const why = writeDenial(path, caller);
      if (why) return why;
    }
  }
  return undefined;
}

/** Why a shell command is refused, or undefined when it may run. */
export function bashDenial(line: string, caller: Caller = {}): string | undefined {
  if (SECRETS.test(line)) return 'credentials in the environment are not for agents to read';
  for (const command of commandsOf(line)) {
    const why = simpleDenial(command, caller);
    if (why) return why;
  }
  return undefined;
}

/** Why a tool call is refused, or undefined when it may run. */
export function denial(tool: string, input: unknown, caller: Caller = {}): string | undefined {
  const writer = KNOWLEDGE_WRITERS[tool];
  if (writer && caller.agentType !== writer)
    return `${tool.replace('mcp__knowledge__', '')} is reserved for the ${writer} subagent. Hand the work to it`;
  const fields = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const fileKey = FILE_TOOLS[tool];
  if (fileKey) {
    const path = fields[fileKey];
    return typeof path === 'string' ? writeDenial(path, caller) : undefined;
  }
  if (tool === 'Bash') return typeof fields.command === 'string' ? bashDenial(fields.command, caller) : undefined;
  return undefined;
}
