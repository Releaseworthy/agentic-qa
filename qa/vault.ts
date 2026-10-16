/** The knowledge vault's frontmatter, read from TypeScript (the QA engines need structure, not search). */

import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Glob, YAML } from 'bun';

export const ROOT = join(import.meta.dir, '..');

export type Doc = { id: string; type: string; title: string; path: string; meta: Record<string, unknown> };

export type Feature = Doc & { criticality: number; code: string[]; rules: string[]; dependsOn: string[] };
export type Rule = Doc & { feature: string; severity: Severity };
export type Defect = Doc & {
  status: DefectStatus;
  severity: Severity;
  feature: string;
  rule: string;
  priority: string;
  /** ISO day the defect was reported; empty when unknown. */
  reported: string;
};
export type TestCase = Doc & { feature: string; covers: string[]; priority: string; automatedBy: string };

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

/**
 * new → confirmed → fixed → closed, or reopened when the retest fails; rejected (with a `resolution`:
 * not-a-bug, duplicate, cannot-reproduce, wont-fix) at any point. `open` is a legacy alias of confirmed.
 */
export const DEFECT_STATUSES = ['new', 'confirmed', 'open', 'fixed', 'reopened', 'closed', 'rejected'] as const;
export type DefectStatus = (typeof DEFECT_STATUSES)[number];
/** Still a risk to the release: anything not closed or rejected — a fix nobody retested is not done. */
export const isOpen = (d: Defect): boolean => d.status !== 'closed' && d.status !== 'rejected';

const scalar = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(scalar).filter(Boolean) : scalar(v) ? [scalar(v)] : [];
const status = (v: unknown): DefectStatus =>
  (DEFECT_STATUSES as readonly string[]).includes(scalar(v)) ? (scalar(v) as DefectStatus) : 'new';

export function loadDocs(dir = join(ROOT, 'knowledge')): Doc[] {
  const docs: Doc[] = [];
  for (const rel of new Glob('**/*.md').scanSync({ cwd: dir })) {
    // `_curation/` holds the ledger and proposals waiting for a human — not knowledge.
    if (rel.split(/[\\/]/).some((part) => part.startsWith('_'))) continue;
    const path = join(dir, rel);
    const text = readFileSync(path, 'utf8');
    const m = /^---\n([\s\S]*?)\n---/.exec(text.replaceAll('\r\n', '\n'));
    const meta = (m?.[1] ? YAML.parse(m[1]) : {}) as Record<string, unknown>;
    const id = typeof meta.id === 'string' ? meta.id : rel.replace(/\.md$/, '').toUpperCase();
    docs.push({
      id,
      type: typeof meta.type === 'string' ? meta.type : 'note',
      title: typeof meta.title === 'string' ? meta.title : id,
      path: relative(ROOT, path).replaceAll('\\', '/'),
      meta,
    });
  }
  return docs.sort((a, b) => a.id.localeCompare(b.id));
}

export class Vault {
  readonly features: Feature[];
  readonly rules: Rule[];
  readonly defects: Defect[];
  readonly testCases: TestCase[];

  constructor(readonly docs: Doc[] = loadDocs()) {
    this.features = docs
      .filter((d) => d.type === 'feature')
      .map((d) => ({
        ...d,
        criticality: Number(d.meta.criticality ?? 3),
        code: list(d.meta.code),
        rules: list(d.meta.rules),
        dependsOn: list(d.meta.depends_on),
      }));
    this.rules = docs
      .filter((d) => d.type === 'rule')
      .map((d) => ({ ...d, feature: scalar(d.meta.feature), severity: (d.meta.severity ?? 'medium') as Severity }));
    this.defects = docs
      .filter((d) => d.type === 'defect')
      .map((d) => ({
        ...d,
        status: status(d.meta.status),
        severity: (d.meta.severity ?? 'medium') as Severity,
        feature: scalar(d.meta.feature),
        rule: scalar(d.meta.rule),
        priority: scalar(d.meta.priority),
        reported: scalar(d.meta.reported),
      }));
    this.testCases = docs
      .filter((d) => d.type === 'test-case')
      .map((d) => ({
        ...d,
        feature: scalar(d.meta.feature),
        covers: list(d.meta.covers),
        priority: scalar(d.meta.priority),
        automatedBy: scalar(d.meta.automated_by),
      }));
  }

  feature(id: string): Feature | undefined {
    return this.features.find((f) => f.id === id);
  }

  rule(id: string): Rule | undefined {
    return this.rules.find((r) => r.id === id);
  }

  openDefects(featureId?: string): Defect[] {
    return this.defects.filter((d) => isOpen(d) && (!featureId || d.feature === featureId));
  }
}
