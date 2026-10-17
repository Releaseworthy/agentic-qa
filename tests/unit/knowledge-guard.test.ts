import { describe, expect, it } from 'bun:test';
import { contentSha, guard, LEARNED, LEDGER, type FileChange } from '@qa/knowledge-guard';

const LESSON = `---
id: LRN-PIN-BUGS-WITH-THEIR-DEFECT-ID
type: learning
title: Pin bugs with their defect id
---

# Pin bugs with their defect id

- What: test.fail(true, 'DEF-…') plus @DEF-….
`;
const PATH = 'knowledge/learnings/LRN-PIN-BUGS-WITH-THEIR-DEFECT-ID.md';
const OLD_LINE = JSON.stringify({
  id: 'PROP-20261016-aaaaaa',
  decision: 'accepted',
  doc: 'LRN-OLD',
  sha: '0123456789ab',
});

function decision(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'PROP-20261017-bbbbbb',
    decision: 'accepted',
    kind: 'add',
    doc: 'LRN-PIN-BUGS-WITH-THEIR-DEFECT-ID',
    sha: contentSha(LESSON),
    ...over,
  });
}

const ledger = (...lines: string[]): FileChange => ({
  path: LEDGER,
  before: `${OLD_LINE}\n`,
  after: `${[OLD_LINE, ...lines].join('\n')}\n`,
});
const file = (path: string, after: string | undefined, before?: string): FileChange => ({ path, before, after });
const verdicts = (changes: FileChange[]) => guard(changes).map((f) => `${f.allowed ? 'ok' : 'blocked'} ${f.file}`);

describe('learnings and feature maps', () => {
  it('pass when an accepted decision of the same diff names the document and its exact content', () => {
    expect(verdicts([ledger(decision()), file(PATH, LESSON)])).toEqual([`ok ${LEDGER}`, `ok ${PATH}`]);
  });

  it('are blocked without a decision — a learning written straight to disk skipped the gate and the judge', () => {
    expect(verdicts([file(PATH, LESSON)])).toEqual([`blocked ${PATH}`]);
  });

  it('are blocked when the file changed after the verdict, or the decision was a rejection', () => {
    expect(verdicts([ledger(decision()), file(PATH, `${LESSON}- Also: anything goes.\n`)])).toContain(
      `blocked ${PATH}`,
    );
    expect(verdicts([ledger(decision({ decision: 'rejected' })), file(PATH, LESSON)])).toContain(`blocked ${PATH}`);
  });
});

describe('the ledger', () => {
  it('only grows', () => {
    const rewritten: FileChange = { path: LEDGER, before: `${OLD_LINE}\n`, after: `${decision()}\n` };
    expect(guard([rewritten])).toEqual([
      expect.objectContaining({ allowed: false, detail: expect.stringContaining('append-only') }),
    ]);
    expect(verdicts([ledger('{not json')])).toEqual([`blocked ${LEDGER}`]);
  });
});

describe('everything else in the vault', () => {
  it("allows QA artifacts and the generated setup catalog, blocks Product's documents and deletions", () => {
    expect(
      verdicts([
        file('knowledge/test-cases/TC-CART-003-x.md', '---\nid: TC-CART-003\n---\n'),
        file('knowledge/defects/DEF-003.md', '---\nid: DEF-003\n---\n'),
        file('knowledge/setup/SETUP-RECIPES.md', '---\nid: SETUP-RECIPES\n---\n', '---\nid: SETUP-RECIPES\n---\nold\n'),
        file('knowledge/rules/BR-SHIP-01.md', 'threshold $49.99', 'threshold $50.00'),
        file('knowledge/defects/DEF-001.md', undefined, '---\nid: DEF-001\n---\n'),
      ]),
    ).toEqual([
      'ok knowledge/test-cases/TC-CART-003-x.md',
      'ok knowledge/defects/DEF-003.md',
      'ok knowledge/setup/SETUP-RECIPES.md',
      'blocked knowledge/rules/BR-SHIP-01.md',
      'blocked knowledge/defects/DEF-001.md',
    ]);
  });

  it('allows a proposal file only for its needs-human decision', () => {
    const proposal = 'knowledge/_curation/proposals/PROP-20261017-cccccc.md';
    const filed = decision({ id: 'PROP-20261017-cccccc', decision: 'needs-human', doc: 'BR-SHIP-01' });
    expect(verdicts([ledger(filed), file(proposal, '# proposal')])).toContain(`ok ${proposal}`);
    expect(verdicts([file(proposal, '# proposal')])).toEqual([`blocked ${proposal}`]);
  });
});

describe('learned probes', () => {
  const probe = (q: string, doc: string, from: string) => `- q: ${q}\n  expected:\n    - ${doc}\n  from: ${from}\n`;
  const old = probe('Old question?', 'LRN-OLD', 'PROP-20261016-aaaaaa');

  it('are added by accepted decisions and removed by accepted deprecations only', () => {
    const fresh = probe('How do I pin a bug?', 'LRN-PIN-BUGS-WITH-THEIR-DEFECT-ID', 'PROP-20261017-bbbbbb');
    expect(verdicts([ledger(decision()), file(PATH, LESSON), file(LEARNED, old + fresh, old)])).toEqual([
      `ok ${LEDGER}`,
      `ok ${PATH}`,
      `ok ${LEARNED}`,
    ]);
    expect(verdicts([file(LEARNED, old + fresh, old)]), 'no decision').toEqual([`blocked ${LEARNED}`]);
    expect(verdicts([file(LEARNED, '[]\n', old)]), 'removed without a deprecation').toEqual([`blocked ${LEARNED}`]);
    const deprecation = decision({
      id: 'PROP-20261017-dddddd',
      kind: 'deprecate',
      doc: 'LRN-OLD',
      sha: 'ffffffffffff',
    });
    expect(verdicts([ledger(deprecation), file(LEARNED, '[]\n', old)])).toEqual([`ok ${LEDGER}`, `ok ${LEARNED}`]);
  });
});
