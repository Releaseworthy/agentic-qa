/**
 * Claude Code PreToolUse hook (.claude/settings.json): applies agents/tool-policy.ts to interactive sessions.
 * Reads the hook input on stdin; prints a deny decision, or nothing to let the call through.
 */

import { denial } from '@agents/tool-policy';

type HookInput = { tool_name?: string; tool_input?: unknown; agent_type?: string };

const input = JSON.parse(await Bun.stdin.text()) as HookInput;
const why = denial(input.tool_name ?? '', input.tool_input, input.agent_type);
if (why)
  console.log(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: why },
    }),
  );
