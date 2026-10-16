/**
 * What an agent may do, checked before every tool call — the same rules for headless runs (agents/run.ts, an SDK
 * PreToolUse hook) and interactive Claude Code (.claude/settings.json, agents/tool-policy-hook.ts).
 *
 *   Knowledge writes by role   commit_knowledge: only the knowledge-curator subagent (a proposer never judges
 *                              itself) · upsert_document: only qa-writer
 *   Shell                      no pushes, commits or remotes; gh read-only (and PR feedback only through
 *                              `bun run qa:pr-feedback`, which drops comments from outside the repo's members);
 *                              curl/wget only to localhost; no reading the credentials in the environment
 *
 * The shell rules narrow what an agent does by accident or under prompt injection. They are not a sandbox — an
 * agent that writes and runs a script can do more — so CI also gives the agent job a read-only token.
 */

const KNOWLEDGE_WRITERS: Record<string, string> = {
  mcp__knowledge__commit_knowledge: 'knowledge-curator',
  mcp__knowledge__upsert_document: 'qa-writer',
};

const SECRETS = /\b(ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN|GH_TOKEN|GITHUB_TOKEN|STRING_HEX_SHOPLITE)\b/;
const LOCAL_HOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/;

/** One shell command line → its simple commands (`a && b | c; d` → a, b, c, d), without leading `VAR=x`. */
export function commandsOf(line: string): string[] {
  return line
    .split(/&&|\|\||[;|\n]/)
    .map((c) => c.trim().replace(/^(\w+=\S*\s+)+/, ''))
    .filter(Boolean);
}

/** Splits a simple command into words; quotes group, they don't nest. */
function words(command: string): string[] {
  return [...command.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
}

function ghDenial(args: string[]): string | undefined {
  const [sub, action] = args;
  if (sub === 'pr' && (action === 'view' || action === 'diff')) {
    const json = args[args.indexOf('--json') + 1] ?? '';
    if (args.includes('--comments') || args.includes('-c') || /\b(comments|reviews)\b/.test(json))
      return 'PR comments and reviews come from `bun run qa:pr-feedback <n>` (members only)';
    return undefined;
  }
  if (sub === 'api') {
    const method = args.find((_, i) => args[i - 1] === '-X' || args[i - 1] === '--method') ?? 'GET';
    if (method.toUpperCase() !== 'GET' || args.some((a) => /^(-f|-F|--field|--raw-field|--input)$/.test(a)))
      return '`gh api` is read-only here (GET, no fields)';
    if (args.some((a) => /\/(comments|reviews)\b/.test(a)))
      return 'PR comments and reviews come from `bun run qa:pr-feedback <n>` (members only)';
    return undefined;
  }
  return `\`gh ${sub ?? ''} ${action ?? ''}\` is not allowed — only gh pr view/diff and read-only gh api`;
}

/** Why a shell command is refused, or undefined when it may run. */
export function bashDenial(line: string): string | undefined {
  if (SECRETS.test(line)) return 'credentials in the environment are not for agents to read';
  for (const command of commandsOf(line)) {
    const [bin = '', ...args] = words(command);
    const name = bin.split(/[\\/]/).pop() ?? bin;
    if (name === 'env' || name === 'printenv') return 'the environment holds credentials; read the env/ files instead';
    if (name === 'git' && ['push', 'commit', 'remote', 'config', 'credential'].includes(args[0] ?? ''))
      return `\`git ${args[0] ?? ''}\` is not allowed — CI commits and opens the PR`;
    if (name === 'gh') {
      const why = ghDenial(args);
      if (why) return why;
    }
    if (name === 'curl' || name === 'wget') {
      const urls = args.filter((a) => /^https?:\/\//.test(a));
      if (urls.length === 0 || urls.some((u) => !LOCAL_HOST.test(u)))
        return `\`${name}\` only to ShopLite on localhost — no other network access`;
    }
  }
  return undefined;
}

/** Why a tool call is refused, or undefined when it may run. `agentType` is the subagent making it (none = main). */
export function denial(tool: string, input: unknown, agentType?: string): string | undefined {
  const writer = KNOWLEDGE_WRITERS[tool];
  if (writer && agentType !== writer)
    return `${tool.replace('mcp__knowledge__', '')} is reserved for the ${writer} subagent — hand the work to it`;
  if (tool === 'Bash') {
    const command = (input as { command?: unknown } | null)?.command;
    return typeof command === 'string' ? bashDenial(command) : undefined;
  }
  return undefined;
}
