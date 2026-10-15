import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
    video: 'off'
  },
  webServer: {
    // The dev build is used because it exposes the debug handle the budget and
    // state tests read; production builds do not ship it.
    command: 'npm run dev -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60_000
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone-landscape', use: { ...devices['Desktop Chrome'], viewport: { width: 740, height: 360 }, hasTouch: true, isMobile: true } },
    { name: 'phone-portrait', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } }
  ]
});
