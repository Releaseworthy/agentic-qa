/**
 * Claude Code PreToolUse hook (.claude/settings.json): applies agents/tool-policy.ts to every session: interactive,
 * and headless through agents/run.ts, which loads the same project settings and marks its runs with AGENTIC_QA_RUN.
 * Reads the hook input on stdin; prints a deny decision, or nothing to let the call through.
 *
 * Fails closed: a call it can't read is refused, and so is a call the policy throws on. A crash, a non-zero exit or a
 * timeout is refused by Claude Code itself, through `"onFailure": "block"` on the hook (Claude Code v2.1.295+).
 */

type HookInput = { tool_name: string; tool_input?: unknown; agent_type?: string; cwd?: string };

function deny(reason: string): void {
  console.log(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
    }),
  );
}

/** The hook input, or undefined when it is not a JSON object naming a tool. */
function parse(text: string): HookInput | undefined {
  try {
    const input: unknown = JSON.parse(text);
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
    const tool: unknown = (input as Record<string, unknown>).tool_name;
    return typeof tool === 'string' && tool !== '' ? (input as HookInput) : undefined;
  } catch {
    return undefined;
  }
}

try {
  const input = parse(await Bun.stdin.text());
  if (input === undefined) deny('the tool policy could not read this call, so it is refused');
  else {
    // Loaded here, so a policy that fails to load is a refusal too.
    const { denial } = await import('@agents/tool-policy');
    const why = denial(input.tool_name, input.tool_input, {
      agentType: input.agent_type,
      cwd: input.cwd,
      headless: Boolean(process.env.AGENTIC_QA_RUN),
    });
    if (why) deny(why);
  }
} catch (error) {
  deny(
    `the tool policy failed on this call (${error instanceof Error ? error.message : String(error)}), so it is refused`,
  );
}
