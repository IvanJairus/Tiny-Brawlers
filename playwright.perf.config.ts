import { defineConfig, devices } from '@playwright/test';

/**
 * Kept separate on purpose: the throttled frame-budget test needs the machine to
 * itself. Run it with `npm run test:perf`.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: 'perf.spec.ts',
  timeout: 120_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    trace: 'off',
    video: 'off',
    baseURL: 'http://localhost:4173'
  },
  webServer: {
    command: 'npm run dev -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60_000
  },
  projects: [
    {
      name: 'perf-throttled',
      use: { ...devices['Desktop Chrome'], viewport: { width: 740, height: 360 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
    }
  ]
});
