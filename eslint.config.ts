import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import playwright from 'eslint-plugin-playwright';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

const USE_ALIAS = { regex: '^\\.{1,2}/', message: 'Import through a tsconfig path alias (@api, @pages/*, @app/*, …).' };
const USE_DATE_UTILS = 'Dates and time go through @utils/date.';
// A later `no-restricted-syntax` replaces an earlier one, so the spec block repeats these.
const RESTRICTED_DATES = [
  { selector: "NewExpression[callee.name='Date']", message: USE_DATE_UTILS },
  { selector: "MemberExpression[object.name='Date'][property.name='now']", message: USE_DATE_UTILS },
];

export default defineConfig(
  globalIgnores([
    'playwright-report/',
    'test-results/',
    'blob-report/',
    'out/',
    '.rag/',
    '.venv/',
    '.playwright-cli/',
    '.auth/',
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
      'no-restricted-imports': ['error', { patterns: [USE_ALIAS] }],
    },
  },
  // One place for date formats and the clock: outside the app, only framework/utils/date.ts uses date-fns or `Date`.
  {
    ignores: ['app/**', 'framework/utils/date.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'date-fns', message: USE_DATE_UTILS }],
          patterns: [USE_ALIAS, { group: ['date-fns/*'], message: USE_DATE_UTILS }],
        },
      ],
      'no-restricted-syntax': ['error', ...RESTRICTED_DATES],
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
  // Readable reports: every assertion says what it checks, and sits in a named test.step.
  {
    files: ['tests/**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...RESTRICTED_DATES,
        {
          selector: "CallExpression[callee.name='expect'][arguments.length<2]",
          message: 'Give every expect a message that says what it checks: expect(value, "…").',
        },
        {
          selector:
            "CallExpression[callee.name=/^expect(Refused)?$/]:not(CallExpression[callee.object.name='test'][callee.property.name='step'] CallExpression[callee.name=/^expect(Refused)?$/])",
          message: "Assert inside a named test.step('…') so the report reads as business steps.",
        },
      ],
    },
  },
  prettier,
);
