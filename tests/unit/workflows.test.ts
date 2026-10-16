import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { YAML } from 'bun';
import { RESULT_SCHEMA, WORKFLOWS, WorkflowResult } from '@agents/workflows';
import { ROOT } from '@qa/vault';

type Dispatch = { on: { workflow_dispatch: { inputs: { workflow: { options: string[] } } } } };

describe('workflow registry', () => {
  it('has one workflow per skill, and CI offers exactly those', () => {
    const skills = readdirSync(join(ROOT, '.claude', 'skills')).sort();
    const registry: string[] = Object.values(WORKFLOWS)
      .map((w) => w.skill)
      .sort();
    const ci = YAML.parse(readFileSync(join(ROOT, '.github', 'workflows', 'agentic-qa.yml'), 'utf8')) as Dispatch;
    expect(registry, 'every skill is runnable headless').toEqual(skills);
    expect([...ci.on.workflow_dispatch.inputs.workflow.options].sort(), 'the dispatch list').toEqual(
      Object.keys(WORKFLOWS).sort(),
    );
  });

  it('the result schema the SDK enforces is the one the runner parses', () => {
    expect(RESULT_SCHEMA.$schema, 'no meta-schema key for the SDK').toBeUndefined();
    expect(RESULT_SCHEMA.required).toEqual(['status', 'summary', 'artifacts', 'findings']);
    const ok = WorkflowResult.safeParse({ status: 'done', summary: 's', artifacts: [], findings: [] });
    expect(ok.success, 'a minimal result parses').toBe(true);
  });
});
