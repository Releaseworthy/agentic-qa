/**
 * Headless runner: starts one agentic QA workflow with the Claude Agent SDK —
 * the same skills, subagents, rules and MCP servers Claude Code uses
 * interactively, loaded from the project (`.claude/`, `CLAUDE.md`, `.mcp.json`).
 *
 *   bun run agent <workflow> [args…] [--budget <usd>] [--model <id>] [--max-turns <n>] [--strict]
 *   bun run agent list
 *
 *   bun run agent refine-ac CARD-142
 *   bun run agent api-testgen "PATCH /api/cart/items/:productId"
 *   bun run agent regression --base origin/main
 *   bun run agent release-gate --strict          exit 1 on NO-GO
 *
 * Auth: ANTHROPIC_API_KEY, or CLAUDE_CODE_OAUTH_TOKEN (`claude setup-token`), or
 * a local Claude Code login. Every run writes out/agent-runs/<id>/: the full
 * message transcript (JSONL), result.json (structured output, cost, turns,
 * per-model usage) and summary.md (also appended to the GitHub job summary).
 *
 * Model routing: the orchestrating skill runs on --model (default opus); each
 * subagent runs on the model its definition names (.claude/agents/*.md) —
 * haiku for vault lookups, code search and browser exploration, opus for
 * authoring and review.
 */

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { query, type Options, type SDKMessage, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { RESULT_SCHEMA, WORKFLOWS, type WorkflowName, type WorkflowResult } from '@agents/workflows';
import { DateFormat, formatDate, now } from '@utils/date';

const ROOT = join(import.meta.dir, '..');

/** Pre-approved tools: everything a workflow needs, nothing that leaves the repo (no push, no network fetches). */
const ALLOWED_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'Agent',
  'Task',
  'Skill',
  'TodoWrite',
  'mcp__knowledge',
  'mcp__codesearch',
  'Bash(bun run *)',
  'Bash(bun test *)',
  'Bash(bunx playwright test *)',
  'Bash(bunx playwright-cli *)',
  'Bash(uv run *)',
  'Bash(git diff *)',
  'Bash(git status *)',
  'Bash(git log *)',
  'Bash(TEST_ENV=* bunx playwright test *)',
  'Bash(TEST_ENV=* bun run *)',
  'Bash(git show *)',
  'Bash(gh pr view *)',
  'Bash(gh pr diff *)',
  'Bash(gh api *)',
  // Read-only helpers agents chain onto the commands above (pipes are checked per command).
  'Bash(cd *)',
  'Bash(grep *)',
  'Bash(tail *)',
  'Bash(head *)',
  'Bash(cat *)',
  'Bash(ls *)',
  'Bash(wc *)',
  'Bash(echo *)',
  'Bash(sort *)',
];

// The runner's own flags; every other argument (positional or `--flag`) belongs to the workflow.
const RUNNER_FLAGS = {
  '--budget': 'string',
  '--model': 'string',
  '--max-turns': 'string',
  '--strict': 'boolean',
} as const;
const runnerArgs: string[] = [];
const workflowArgs: string[] = [];
const argv = Bun.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i] ?? '';
  const flag = arg.split('=')[0] as keyof typeof RUNNER_FLAGS;
  if (flag in RUNNER_FLAGS) {
    runnerArgs.push(arg);
    if (RUNNER_FLAGS[flag] === 'string' && !arg.includes('=')) runnerArgs.push(argv[++i] ?? '');
  } else workflowArgs.push(arg);
}
const { values } = parseArgs({
  args: runnerArgs,
  options: {
    budget: { type: 'string' },
    model: { type: 'string', default: 'opus' },
    'max-turns': { type: 'string' },
    strict: { type: 'boolean' },
  },
});

const [name, ...rest] = workflowArgs.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a));
if (!name || name === 'list' || !(name in WORKFLOWS)) {
  console.log('Workflows:');
  for (const [n, w] of Object.entries(WORKFLOWS)) console.log(`  ${n.padEnd(20)} ${w.summary}`);
  process.exit(name && name !== 'list' ? 2 : 0);
}

const workflow = WORKFLOWS[name as WorkflowName];
const runId = `${formatDate(now(), DateFormat.RUN_ID)}-${name}`;
const dir = join(ROOT, 'out', 'agent-runs', runId);
mkdirSync(dir, { recursive: true });
const transcript = join(dir, 'transcript.jsonl');

const options: Options = {
  cwd: ROOT,
  // CLAUDE.md, .claude/skills, .claude/agents and .claude/settings.json from the repo — not the machine's user settings.
  settingSources: ['project'],
  model: values.model,
  fallbackModel: 'sonnet',
  maxTurns: Number(values['max-turns'] ?? workflow.maxTurns),
  maxBudgetUsd: Number(values.budget ?? workflow.budgetUsd),
  // Headless: anything not pre-approved is denied instead of waiting for a human.
  permissionMode: 'dontAsk',
  allowedTools: ALLOWED_TOOLS,
  disallowedTools: ['WebFetch', 'WebSearch', 'Bash(git push *)', 'Bash(git commit *)'],
  mcpServers: {
    knowledge: { type: 'stdio', command: 'uv', args: ['run', '--quiet', 'python', '-m', 'rag.server'] },
    codesearch: { type: 'stdio', command: process.execPath, args: ['run', 'codesearch/mcp.ts'] },
  },
  // Only the servers above — not connectors the machine's Claude login happens to have.
  strictMcpConfig: true,
  outputFormat: { type: 'json_schema', schema: RESULT_SCHEMA },
  stderr: (data) => {
    appendFileSync(join(dir, 'stderr.log'), data);
  },
};

const prompt = [
  `/${workflow.skill} ${rest.join(' ')}`.trim(),
  '',
  'You are running headless in CI: no human can answer questions mid-run. Make reasonable, stated assumptions; ',
  'when a decision genuinely needs a human, finish what you can and return status "needs_human" with the question in the summary.',
].join('\n');

let announced = false;
function log(message: SDKMessage): void {
  appendFileSync(transcript, `${JSON.stringify(message)}\n`);
  if (message.type === 'system' && message.subtype === 'init') {
    if (announced) return;
    announced = true;
    const mcp = message.mcp_servers.map((s) => `${s.name}:${s.status}`).join(', ');
    console.log(`▶ ${name} · model ${message.model} · mcp ${mcp} · run ${runId}`);
    return;
  }
  if (message.type !== 'assistant') return;
  const who = message.parent_tool_use_id ? '  ↳ subagent' : '•';
  for (const block of message.message.content) {
    if (block.type === 'text' && block.text.trim())
      console.log(`${who} ${block.text.trim().split('\n')[0]?.slice(0, 160) ?? ''}`);
    if (block.type === 'tool_use') {
      const input = block.input as Record<string, unknown>;
      const key = ['command', 'subagent_type', 'description', 'file_path', 'query', 'skill'].find(
        (k) => typeof input[k] === 'string',
      );
      const detail = key ? (input[key] as string) : '';
      console.log(`${who} [${block.name}] ${detail.split('\n')[0]?.slice(0, 140) ?? ''}`);
    }
  }
}

const startedAt = performance.now();
let result: SDKResultMessage | undefined;
for await (const message of query({ prompt, options })) {
  log(message);
  if (message.type === 'result') result = message;
}

if (!result) {
  console.error('The run ended without a result message — see stderr.log');
  process.exit(1);
}

const structured = result.subtype === 'success' ? (result.structured_output as WorkflowResult | undefined) : undefined;
const record = {
  runId,
  workflow: name,
  args: rest,
  outcome: result.subtype,
  isError: result.is_error,
  turns: result.num_turns,
  durationMs: Math.round(performance.now() - startedAt),
  costUsd: result.total_cost_usd,
  modelUsage: result.modelUsage,
  permissionDenials: result.permission_denials,
  result: structured,
  text: result.subtype === 'success' ? result.result : result.errors,
};
writeFileSync(join(dir, 'result.json'), JSON.stringify(record, null, 2));

const models = Object.entries(result.modelUsage)
  .map(
    ([model, u]) =>
      `${model}: ${u.inputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens} in / ${u.outputTokens} out`,
  )
  .join(' · ');
const summary = [
  `### Agentic QA · \`${name} ${rest.join(' ')}\``,
  '',
  `**${structured?.status ?? result.subtype}**${structured?.decision && structured.decision !== 'n/a' ? ` · decision **${structured.decision}**` : ''} · ` +
    `${result.num_turns} turns · $${result.total_cost_usd.toFixed(2)} · ${((performance.now() - startedAt) / 60_000).toFixed(1)} min`,
  '',
  structured?.summary ?? (result.subtype === 'success' ? result.result.slice(0, 2000) : result.errors.join('\n')),
  '',
  structured?.findings.length
    ? structured.findings.map((f) => `- **${f.severity}** ${f.title}${f.ref ? ` (${f.ref})` : ''}`).join('\n')
    : '',
  structured?.artifacts.length ? `\nArtifacts: ${structured.artifacts.map((a) => `\`${a.path}\``).join(', ')}` : '',
  structured?.knowledge?.length
    ? `\nKnowledge: ${structured.knowledge.map((k) => `${k.id} ${k.decision}${k.why ? ` (${k.why})` : ''}`).join(' · ')}`
    : '',
  // One line per document, read back by the heal guard in CI (Intended-change: <id>).
  ...(structured?.intended ?? []).map((i) => `\nIntended-change: ${i.doc} — ${i.why}`),
  '',
  `<sub>Models: ${models}</sub>`,
].join('\n');
writeFileSync(join(dir, 'summary.md'), summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
console.log(`\n${summary}\n\nRun saved to out/agent-runs/${runId}/`);

if (result.subtype !== 'success' || structured?.status === 'blocked') process.exit(1);
if (values.strict && structured?.decision === 'NO-GO') process.exit(1);
