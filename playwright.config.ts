import { defineConfig, devices, type ReporterDescription } from '@playwright/test';
import { env } from '@config/env';
import { Timeout } from '@config/timeouts';

const CI = Boolean(process.env.CI);

const reporter: ReporterDescription[] = [
  [CI ? 'dot' : 'list'],
  ['html', { open: 'never' }],
  // Read by the QA engines: traceability, the release gate, defect detection.
  ['json', { outputFile: process.env.PW_JSON_OUTPUT ?? 'out/results.json' }],
];
if (CI) reporter.push(['junit', { outputFile: 'test-results/junit.xml' }]);
if (process.env.GITHUB_ACTIONS) reporter.push(['github'], ['blob']);

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  globalSetup: './framework/global-setup.ts',
  timeout: Timeout.TEST,
  expect: { timeout: Timeout.EXPECT },
  // A read-only environment (live) runs only the tests that change nothing.
  grep: env.readOnly ? /@readonly/ : undefined,
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 4 : undefined,
  reporter,
  use: {
    baseURL: env.baseUrl,
    actionTimeout: Timeout.ACTION,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // START_APP: ShopLite starts with the run as TEST_ENV (fresh in-memory data) unless one is already up.
  webServer: env.startApp
    ? {
        command: 'bun run framework/setup/app-server.ts',
        url: `${env.baseUrl}/health`,
        reuseExistingServer: !CI,
        timeout: Timeout.SERVER_START,
        env: { TEST_ENV: env.name, SHOPLITE_DEFECTS: process.env.SHOPLITE_DEFECTS ?? '' },
      }
    : undefined,
  projects: [
    { name: 'api', testDir: './tests/api' },
    { name: 'chromium', testDir: './tests/ui', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testDir: './tests/ui', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testDir: './tests/ui', use: { ...devices['Desktop Safari'] } },
  ],
});
