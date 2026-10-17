/**
 * Validates the vault's frontmatter, i.e. the fields the QA engines rank and gate on. A typo here doesn't fail loudly
 * anywhere else: `severity: High` would silently stop a critical defect from blocking the release.
 *
 *   bun run qa:vault        exit 1 with one line per problem
 *
 * Per type: the folder it lives in, its id pattern, enums (severity, status, priority, layer, criticality) and
 * references (a rule's feature, a defect's rule, a test case's covers) that must exist.
 */

import { z } from 'zod';
import { DEFECT_STATUSES, Vault, type Doc } from '@qa/vault';

const SEVERITY = z.enum(['critical', 'high', 'medium', 'low']);
const ids = z.array(z.string()).default([]);
const optionalDay = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.date()]).optional();

/** Folder, id pattern and frontmatter schema per document type; types not listed only need an id and a title. */
const TYPES: Record<string, { folder: string; id: RegExp; meta: z.ZodType }> = {
  feature: {
    folder: 'features',
    id: /^FEAT-[A-Z]+$/,
    meta: z.looseObject({ criticality: z.number().int().min(1).max(5), code: ids, rules: ids, depends_on: ids }),
  },
  rule: {
    folder: 'rules',
    id: /^BR-[A-Z]+-\d{2}$/,
    meta: z.looseObject({ feature: z.string(), severity: SEVERITY }),
  },
  card: { folder: 'cards', id: /^CARD-\d+$/, meta: z.looseObject({ status: z.string(), feature: z.string() }) },
  defect: {
    folder: 'defects',
    id: /^DEF-\d{3,}$/,
    meta: z.looseObject({
      status: z.enum(DEFECT_STATUSES),
      severity: SEVERITY,
      feature: z.string(),
      rule: z.string().optional(),
      priority: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
      layer: z.enum(['api', 'ui', 'both']).optional(),
      resolution: z.enum(['not-a-bug', 'duplicate', 'cannot-reproduce', 'wont-fix']).optional(),
      duplicate_of: z.string().optional(),
      reported: optionalDay,
      verified: optionalDay,
    }),
  },
  'test-case': {
    folder: 'test-cases',
    id: /^TC-[A-Z]+-\d{3}$/,
    meta: z.looseObject({
      feature: z.string(),
      covers: ids,
      priority: z.enum(['critical', 'high', 'medium', 'low']),
      status: z.enum(['draft', 'ready', 'outdated', 'deprecated']),
      automated_by: z.string(),
    }),
  },
  learning: {
    folder: 'learnings',
    id: /^LRN-[A-Z0-9-]+$/,
    meta: z.looseObject({
      status: z.enum(['active', 'deprecated']),
      confidence: z.enum(['provisional', 'established']),
      applies_to: z.array(z.string()).min(1),
    }),
  },
  overview: { folder: 'product', id: /^[A-Z][A-Z0-9-]*$/, meta: z.looseObject({}) },
  setup: { folder: 'setup', id: /^SETUP-[A-Z-]+$/, meta: z.looseObject({}) },
};

/** Every problem in the vault, one line each. */
export function validate(vault: Vault): string[] {
  const problems: string[] = [];
  const has = (id: string, type: string) => vault.docs.some((d) => d.id === id && d.type === type);
  const seen = new Map<string, string>();
  for (const doc of vault.docs) {
    const at = `${doc.path} (${doc.id})`;
    const clash = seen.get(doc.id);
    if (clash) problems.push(`${at}: id also used by ${clash}`);
    seen.set(doc.id, doc.path);
    if (typeof doc.meta.title !== 'string' || !doc.meta.title.trim()) problems.push(`${at}: no title`);
    const spec = TYPES[doc.type];
    if (!spec) continue;
    if (!doc.path.startsWith(`knowledge/${spec.folder}/`))
      problems.push(`${at}: a ${doc.type} lives in knowledge/${spec.folder}/`);
    if (!spec.id.test(doc.id)) problems.push(`${at}: a ${doc.type} id matches ${String(spec.id)}`);
    const parsed = spec.meta.safeParse(doc.meta);
    if (!parsed.success)
      for (const issue of parsed.error.issues) problems.push(`${at}: ${issue.path.join('.') || '-'} ${issue.message}`);
    problems.push(...references(doc, at, has));
  }
  return problems;
}

function references(doc: Doc, at: string, has: (id: string, type: string) => boolean): string[] {
  const out: string[] = [];
  const need = (value: unknown, type: string, field: string) => {
    for (const id of Array.isArray(value) ? value : value === undefined ? [] : [value])
      if (typeof id !== 'string' || !has(id, type)) out.push(`${at}: ${field} ${String(id)} is not a ${type}`);
  };
  const m = doc.meta;
  if (['rule', 'card', 'defect', 'test-case'].includes(doc.type)) need(m.feature, 'feature', 'feature');
  if (doc.type === 'feature') need(m.rules, 'rule', 'rules');
  if (doc.type === 'defect') {
    need(m.rule, 'rule', 'rule');
    if (m.resolution === 'duplicate') need(m.duplicate_of, 'defect', 'duplicate_of');
    if (m.status === 'rejected' && m.resolution === undefined)
      out.push(`${at}: a rejected defect names its resolution`);
  }
  if (doc.type === 'test-case') need(m.covers, 'rule', 'covers');
  return out;
}

if (import.meta.main) {
  const vault = new Vault();
  const problems = validate(vault);
  for (const p of problems) console.error(`✗ ${p}`);
  if (problems.length) process.exit(1);
  console.log(`✓ ${vault.docs.length} vault documents valid`);
}
