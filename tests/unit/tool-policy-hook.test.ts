import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { denial } from '@agents/tool-policy';

const ROOT = join(import.meta.dir, '..', '..');
const HOOK = join(ROOT, 'agents', 'tool-policy-hook.ts');

type Decision = { hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string } };

/** Runs the hook the way Claude Code does: the call as JSON on stdin, the decision on stdout. */
function hook(stdin: string): { exitCode: number; stdout: string } {
  const run = Bun.spawnSync({
    cmd: [process.execPath, HOOK],
    cwd: ROOT,
    stdin: Buffer.from(stdin),
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, AGENTIC_QA_RUN: '' },
  });
  return { exitCode: run.exitCode, stdout: run.stdout.toString().trim() };
}

/** The deny reason the hook printed; throws when it printed anything else. */
function refusal(stdout: string): string {
  const { hookSpecificOutput: out } = JSON.parse(stdout) as Decision;
  expect(out.permissionDecision).toBe('deny');
  return out.permissionDecisionReason;
}

describe('tool-policy hook, run as Claude Code runs it', () => {
  it('refuses a call it cannot read', () => {
    for (const bad of ['{not json', '', 'null', '[]', '"Bash"', '{"tool_input":{"command":"ls"}}']) {
      const { exitCode, stdout } = hook(bad);
      expect(exitCode, bad).toBe(0);
      expect(refusal(stdout), bad).toContain('could not read');
    }
  });

  it('refuses a call the policy throws on, instead of crashing and letting it through', () => {
    const input = { tool_name: 'Write', tool_input: { file_path: 'tests/new.spec.ts' }, cwd: 123 };
    expect(() => denial(input.tool_name, input.tool_input, { cwd: input.cwd as unknown as string })).toThrow();
    const { exitCode, stdout } = hook(JSON.stringify(input));
    expect(exitCode).toBe(0);
    expect(refusal(stdout)).toContain('failed on this call');
  });

  it('prints nothing for an allowed call, and the policy reason for a refused one', () => {
    const allowed = hook(
      JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'bun run qa:impact' }, cwd: ROOT }),
    );
    expect(allowed).toEqual({ exitCode: 0, stdout: '' });
    const pushed = hook(
      JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push origin main' }, cwd: ROOT }),
    );
    expect(refusal(pushed.stdout)).toContain('git push');
  });

  it('is wired to block the call when it fails or times out', () => {
    const settings = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8')) as {
      hooks: { PreToolUse: { matcher: string; hooks: { command: string; onFailure?: string }[] }[] };
    };
    const entry = settings.hooks.PreToolUse.find((e) => e.hooks.some((h) => h.command.includes('tool-policy-hook.ts')));
    const policy = entry?.hooks.find((h) => h.command.includes('tool-policy-hook.ts'));
    expect(policy?.onFailure).toBe('block');
    // The braced placeholder is rewritten for PowerShell too; a bare $CLAUDE_PROJECT_DIR is $null there.
    expect(policy?.command).toContain('${CLAUDE_PROJECT_DIR}');
    for (const tool of ['Bash', 'Write', 'Edit', 'mcp__knowledge__commit_knowledge'])
      expect(entry?.matcher.split('|'), tool).toContain(tool);
  });
});
