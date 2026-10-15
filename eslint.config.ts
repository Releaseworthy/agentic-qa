import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import playwright from 'eslint-plugin-playwright';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    'playwright-report/',
    'test-results/',
    'blob-report/',
    'out/',
    '.rag/',
    '.venv/',
    '.playwright-cli/',
    'app/web/',
  ]),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Playwright fixture maps must be `type`s (an interface has no index signature).
      '@typescript-eslint/consistent-type-definitions': 'off',
      'no-empty-pattern': ['error', { allowObjectPatternsAsParameters: true }],
    },
  },
  // Specs, page objects and fixtures: missing awaits, hard waits, force clicks, page.pause().
  {
    files: ['tests/**/*.spec.ts', 'framework/**/*.ts'],
    extends: [playwright.configs['flat/recommended']],
    rules: {
      'playwright/expect-expect': ['warn', { assertFunctionNames: ['expectRefused'] }],
      // Flags page-object methods (`checkoutPage.fill`) as if they were `page.fill`.
      'playwright/prefer-locator': 'off',
    },
  },
  // Unit tests lean on bun:test's asymmetric matchers (`expect.objectContaining`), typed `any`.
  {
    files: ['tests/unit/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  prettier,
);
