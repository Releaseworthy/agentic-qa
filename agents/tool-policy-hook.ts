/**
 * Claude Code PreToolUse hook (.claude/settings.json): applies agents/tool-policy.ts to every session — interactive,
 * and headless through agents/run.ts, which loads the same project settings and marks its runs with AGENTIC_QA_RUN.
 * Reads the hook input on stdin; prints a deny decision, or nothing to let the call through.
 */

import { denial } from '@agents/tool-policy';

type HookInput = { tool_name?: string; tool_input?: unknown; agent_type?: string; cwd?: string };

function deny(reason: string): void {
  console.log(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
    }),
  );
}

let input: HookInput | undefined;
try {
  input = JSON.parse(await Bun.stdin.text()) as HookInput;
} catch {
  input = undefined;
}
// Fails closed: a call the policy can't read is refused, not waved through.
if (input === undefined) deny('the tool policy could not read this call, so it is refused');
else {
  const why = denial(input.tool_name ?? '', input.tool_input, {
    agentType: input.agent_type,
    cwd: input.cwd,
    headless: Boolean(process.env.AGENTIC_QA_RUN),
  });
  if (why) deny(why);
}
