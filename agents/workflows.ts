/**
 * The agentic QA workflows the headless runner can start. Each one is a project
 * skill (`.claude/skills/<skill>/SKILL.md`) — the same workflow a QA engineer
 * runs interactively in Claude Code — plus the limits it runs under in CI.
 */

export type Workflow = {
  skill: string;
  summary: string;
  /** Whether the workflow writes code or vault documents (CI opens a PR with them). */
  writes: boolean;
  maxTurns: number;
  /** Default spend cap in USD; `--budget` overrides. */
  budgetUsd: number;
};

export const WORKFLOWS = {
  'qa-plan': {
    skill: 'qa-plan',
    summary: 'Risk-based test plan for a change or a card',
    writes: false,
    maxTurns: 80,
    budgetUsd: 3,
  },
  'refine-ac': {
    skill: 'refine-ac',
    summary: 'Acceptance-criteria refinement for a card',
    writes: false,
    maxTurns: 60,
    budgetUsd: 2,
  },
  'api-testgen': {
    skill: 'api-testgen',
    summary: 'Endpoint tests, positive and negative',
    writes: true,
    maxTurns: 200,
    budgetUsd: 8,
  },
  'api-journey-testgen': {
    skill: 'api-journey-testgen',
    summary: 'API journey integration tests',
    writes: true,
    maxTurns: 200,
    budgetUsd: 8,
  },
  'ui-qa': {
    skill: 'ui-qa',
    summary: 'Explore the UI, report defects, write manual cases, automate them',
    writes: true,
    maxTurns: 300,
    budgetUsd: 12,
  },
  'adhoc-test': {
    skill: 'adhoc-test',
    summary: 'Charter-based exploratory session',
    writes: true,
    maxTurns: 150,
    budgetUsd: 5,
  },
  regression: {
    skill: 'regression',
    summary: 'Impact-based regression with failure triage',
    writes: true,
    maxTurns: 200,
    budgetUsd: 8,
  },
  'release-gate': {
    skill: 'release-gate',
    summary: 'Go/No-Go assessment for sign-off',
    writes: false,
    maxTurns: 40,
    budgetUsd: 2,
  },
  learn: { skill: 'learn', summary: 'Review feedback into vault learnings', writes: true, maxTurns: 40, budgetUsd: 1 },
} as const satisfies Record<string, Workflow>;

export type WorkflowName = keyof typeof WORKFLOWS;

/** What every workflow returns as structured output, so CI can act on it. */
export const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'summary', 'artifacts', 'findings'],
  properties: {
    status: { type: 'string', enum: ['done', 'blocked', 'needs_human'] },
    summary: { type: 'string', description: 'Two to five sentences for the job summary.' },
    decision: { type: 'string', enum: ['GO', 'CONDITIONAL GO', 'NO-GO', 'n/a'] },
    artifacts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'kind'],
        properties: {
          path: { type: 'string' },
          kind: {
            type: 'string',
            enum: ['plan', 'ac', 'spec', 'page-object', 'helper', 'test-case', 'defect', 'learning', 'report', 'notes'],
          },
        },
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'title'],
        properties: {
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
          title: { type: 'string' },
          ref: { type: 'string', description: 'DEF-/BR-/FEAT- id or file path' },
        },
      },
    },
  },
} as const;

export type WorkflowResult = {
  status: 'done' | 'blocked' | 'needs_human';
  summary: string;
  decision?: 'GO' | 'CONDITIONAL GO' | 'NO-GO' | 'n/a';
  artifacts: { path: string; kind: string }[];
  findings: { severity: string; title: string; ref?: string }[];
};
