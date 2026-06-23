import { defineConfig, devices } from '@playwright/test'

const isCI = !!process.env.CI
const serveBuilt = !!process.env.CI_SERVE_DIST

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: serveBuilt ? 'http://localhost:4173' : 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: serveBuilt
      ? 'npx vite preview --port 4173 --host'
      : 'npm run dev',
    url: serveBuilt ? 'http://localhost:4173' : 'http://localhost:5173',
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
})
