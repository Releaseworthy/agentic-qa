import { defineConfig, devices, type ReporterDescription } from '@playwright/test';
import { config, Timeout } from './framework/config';

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
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 4 : undefined,
  reporter,
  use: {
    baseURL: config.baseUrl,
    actionTimeout: Timeout.ACTION,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // The system under test starts with the run (fresh in-memory data) unless one is already up.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'bun run app/server.ts',
        url: `${config.baseUrl}/health`,
        reuseExistingServer: !CI,
        timeout: Timeout.SERVER_START,
        env: { SHOPLITE_DEFECTS: process.env.SHOPLITE_DEFECTS ?? '' },
      },
  projects: [
    { name: 'api', testDir: './tests/api' },
    { name: 'chromium', testDir: './tests/ui', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testDir: './tests/ui', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testDir: './tests/ui', use: { ...devices['Desktop Safari'] } },
  ],
});
