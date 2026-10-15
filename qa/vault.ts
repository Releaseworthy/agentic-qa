/** The knowledge vault's frontmatter, read from TypeScript (the QA engines need structure, not search). */

import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Glob, YAML } from 'bun';

export const ROOT = join(import.meta.dir, '..');

export type Doc = { id: string; type: string; title: string; path: string; meta: Record<string, unknown> };

export type Feature = Doc & { criticality: number; code: string[]; rules: string[]; dependsOn: string[] };
export type Rule = Doc & { feature: string; severity: Severity };
export type Defect = Doc & { status: 'open' | 'closed'; severity: Severity; feature: string };

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

const scalar = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(scalar).filter(Boolean) : scalar(v) ? [scalar(v)] : [];

export function loadDocs(dir = join(ROOT, 'knowledge')): Doc[] {
  const docs: Doc[] = [];
  for (const rel of new Glob('**/*.md').scanSync({ cwd: dir })) {
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
        status: d.meta.status === 'closed' ? 'closed' : 'open',
        severity: (d.meta.severity ?? 'medium') as Severity,
        feature: scalar(d.meta.feature),
      }));
  }

  feature(id: string): Feature | undefined {
    return this.features.find((f) => f.id === id);
  }

  rule(id: string): Rule | undefined {
    return this.rules.find((r) => r.id === id);
  }

  openDefects(featureId?: string): Defect[] {
    return this.defects.filter((d) => d.status === 'open' && (!featureId || d.feature === featureId));
  }
}
