/**
 * The agentic QA workflows the headless runner can start. Each one is a project
 * skill (`.claude/skills/<skill>/SKILL.md`) — the same workflow a QA engineer
 * runs interactively in Claude Code — plus the limits it runs under in CI.
 */

import { z } from 'zod';

export type Workflow = {
  skill: string;
  summary: string;
  maxTurns: number;
  /** Default spend cap in USD; `--budget` overrides. */
  budgetUsd: number;
};

export const WORKFLOWS = {
  'qa-plan': {
    skill: 'qa-plan',
    summary: 'Risk-based test plan for a change or a card',
    maxTurns: 80,
    budgetUsd: 3,
  },
  'refine-ac': {
    skill: 'refine-ac',
    summary: 'Acceptance-criteria refinement for a card',
    maxTurns: 60,
    budgetUsd: 2,
  },
  'api-testgen': {
    skill: 'api-testgen',
    summary: 'Endpoint tests, positive and negative',
    maxTurns: 200,
    budgetUsd: 8,
  },
  'api-journey-testgen': {
    skill: 'api-journey-testgen',
    summary: 'API journey integration tests',
    maxTurns: 200,
    budgetUsd: 8,
  },
  'ui-qa': {
    skill: 'ui-qa',
    summary: 'Explore the UI, report defects, write manual cases, automate them',
    maxTurns: 300,
    budgetUsd: 12,
  },
  'adhoc-test': {
    skill: 'adhoc-test',
    summary: 'Charter-based exploratory session',
    maxTurns: 150,
    budgetUsd: 5,
  },
  regression: {
    skill: 'regression',
    summary: 'Impact-based regression with failure triage',
    maxTurns: 200,
    budgetUsd: 8,
  },
  'release-gate': {
    skill: 'release-gate',
    summary: 'Go/No-Go assessment for sign-off',
    maxTurns: 40,
    budgetUsd: 2,
  },
  'write-testcases': {
    skill: 'write-testcases',
    summary: 'Design manual test cases with test-design techniques',
    maxTurns: 100,
    budgetUsd: 4,
  },
  'run-testcases': {
    skill: 'run-testcases',
    summary: 'Execute manual test cases in the app, record the run',
    maxTurns: 200,
    budgetUsd: 6,
  },
  'automate-tc': {
    skill: 'automate-tc',
    summary: 'Turn manual test cases into Playwright tests',
    maxTurns: 200,
    budgetUsd: 8,
  },
  'verify-bug': {
    skill: 'verify-bug',
    summary: 'Reproduce a bug over the API and in the UI, confirm or reject it',
    maxTurns: 120,
    budgetUsd: 4,
  },
  'bug-triage': {
    skill: 'bug-triage',
    summary: 'Verify, dedupe, prioritise and route open defects',
    maxTurns: 150,
    budgetUsd: 5,
  },
  'retest-bug': {
    skill: 'retest-bug',
    summary: 'Confirm a fix, convert its pinning test, close or reopen',
    maxTurns: 120,
    budgetUsd: 4,
  },
  'flaky-hunt': {
    skill: 'flaky-hunt',
    summary: 'Measure flakiness with repeated runs, fix the cause',
    maxTurns: 150,
    budgetUsd: 6,
  },
  'heal-tests': {
    skill: 'heal-tests',
    summary: 'Classify failures first; heal only documented changes, report bugs',
    maxTurns: 200,
    budgetUsd: 8,
  },
  'smoke-check': {
    skill: 'smoke-check',
    summary: 'Post-deploy smoke of an environment, PASS/FAIL',
    maxTurns: 60,
    budgetUsd: 2,
  },
  'test-report': {
    skill: 'test-report',
    summary: 'Test summary report for stakeholders',
    maxTurns: 40,
    budgetUsd: 2,
  },
  learn: {
    skill: 'learn',
    summary: 'PR feedback and human edits into curated knowledge; --audit',
    maxTurns: 60,
    budgetUsd: 2,
  },
} as const satisfies Record<string, Workflow>;

export type WorkflowName = keyof typeof WORKFLOWS;

/** What every workflow returns as structured output, so CI can act on it. One definition: the type, the JSON schema
 * the SDK enforces, and the check the runner applies to what comes back. */
export const WorkflowResult = z.strictObject({
  status: z.enum(['done', 'blocked', 'needs_human']),
  summary: z.string().describe('Two to five sentences for the job summary.'),
  decision: z.enum(['GO', 'CONDITIONAL GO', 'NO-GO', 'n/a']).optional(),
  artifacts: z.array(
    z.strictObject({
      path: z.string(),
      kind: z.enum([
        'plan',
        'ac',
        'spec',
        'page-object',
        'helper',
        'test-case',
        'test-run',
        'defect',
        'learning',
        'proposal',
        'report',
        'notes',
      ]),
    }),
  ),
  knowledge: z
    .array(
      z.strictObject({
        id: z.string().describe('The document id (LRN-…) or the proposal id.'),
        decision: z.enum(['accepted', 'rejected', 'needs-human']),
        why: z.string().optional(),
      }),
    )
    .optional()
    .describe('Knowledge proposals of the reflection step and what became of them.'),
  intended: z
    .array(
      z.strictObject({
        doc: z.string().describe('BR-…, FEAT-… or CARD-… id'),
        why: z.string().describe('What the document now says, and which tests follow it.'),
      }),
    )
    .optional()
    .describe(
      'Test changes that follow a documented behaviour change (heal-tests): the rule, feature or card that states it. ' +
        'The heal guard accepts an expected-value change only for a document listed here that changed after the test.',
    ),
  findings: z.array(
    z.strictObject({
      severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
      title: z.string(),
      ref: z.string().optional().describe('DEF-/BR-/FEAT- id or file path'),
    }),
  ),
});
export type WorkflowResult = z.infer<typeof WorkflowResult>;

/** The JSON schema the SDK enforces, without the meta-schema key. */
export const RESULT_SCHEMA: Record<string, unknown> = Object.fromEntries(
  Object.entries(z.toJSONSchema(WorkflowResult)).filter(([key]) => key !== '$schema'),
);
