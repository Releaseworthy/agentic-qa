import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { formatFinding, lintTree } from '../scripts/playwright-lint';

const ROOT = join(import.meta.dir, '..');

describe('playwright rules', () => {
  it('enforces owner rules across Playwright code', () => {
    const findings = lintTree(ROOT, ['framework', 'tests'], {
      skipFiles: [
        'scripts/playwright-lint.ts',
        // Test data: verifies that heal-guard blocks waitForTimeout
        'tests/unit/heal-guard.test.ts',
      ],
      sleepAllowed: [
        // Polling retry interval for app server health check
        'framework/setup/arrange-cli.ts',
      ],
    });
    const message = findings.map(formatFinding).join('\n\n');
    expect(message).toBe('');
  });
});
