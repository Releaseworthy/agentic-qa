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
  'write-testcases': {
    skill: 'write-testcases',
    summary: 'Design manual test cases with test-design techniques',
    writes: true,
    maxTurns: 100,
    budgetUsd: 4,
  },
  'run-testcases': {
    skill: 'run-testcases',
    summary: 'Execute manual test cases in the app, record the run',
    writes: true,
    maxTurns: 200,
    budgetUsd: 6,
  },
  'automate-tc': {
    skill: 'automate-tc',
    summary: 'Turn manual test cases into Playwright tests',
    writes: true,
    maxTurns: 200,
    budgetUsd: 8,
  },
  'verify-bug': {
    skill: 'verify-bug',
    summary: 'Reproduce a bug over the API and in the UI, confirm or reject it',
    writes: true,
    maxTurns: 120,
    budgetUsd: 4,
  },
  'bug-triage': {
    skill: 'bug-triage',
    summary: 'Verify, dedupe, prioritise and route open defects',
    writes: true,
    maxTurns: 150,
    budgetUsd: 5,
  },
  'retest-bug': {
    skill: 'retest-bug',
    summary: 'Confirm a fix, convert its pinning test, close or reopen',
    writes: true,
    maxTurns: 120,
    budgetUsd: 4,
  },
  'flaky-hunt': {
    skill: 'flaky-hunt',
    summary: 'Measure flakiness with repeated runs, fix the cause',
    writes: true,
    maxTurns: 150,
    budgetUsd: 6,
  },
  'heal-tests': {
    skill: 'heal-tests',
    summary: 'Classify failures first; heal only documented changes, report bugs',
    writes: true,
    maxTurns: 200,
    budgetUsd: 8,
  },
  'smoke-check': {
    skill: 'smoke-check',
    summary: 'Post-deploy smoke of an environment, PASS/FAIL',
    writes: false,
    maxTurns: 60,
    budgetUsd: 2,
  },
  'test-report': {
    skill: 'test-report',
    summary: 'Test summary report for stakeholders',
    writes: false,
    maxTurns: 40,
    budgetUsd: 2,
  },
  learn: {
    skill: 'learn',
    summary: 'PR feedback and human edits into curated knowledge; --audit',
    writes: true,
    maxTurns: 60,
    budgetUsd: 2,
  },
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
            enum: [
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
            ],
          },
        },
      },
    },
    knowledge: {
      type: 'array',
      description: 'Knowledge proposals of the reflection step and what became of them.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'decision'],
        properties: {
          id: { type: 'string', description: 'The document id (LRN-…) or the proposal id.' },
          decision: { type: 'string', enum: ['accepted', 'rejected', 'needs-human'] },
          why: { type: 'string' },
        },
      },
    },
    intended: {
      type: 'array',
      description:
        'Test changes that follow a documented behaviour change (heal-tests): the rule, feature or card that states it. ' +
        'The heal guard accepts an expected-value change only for a document listed here that changed after the test.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['doc', 'why'],
        properties: {
          doc: { type: 'string', description: 'BR-…, FEAT-… or CARD-… id' },
          why: { type: 'string', description: 'What the document now says, and which tests follow it.' },
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
  knowledge?: { id: string; decision: 'accepted' | 'rejected' | 'needs-human'; why?: string }[];
  intended?: { doc: string; why: string }[];
};
