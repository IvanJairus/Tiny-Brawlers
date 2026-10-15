import { defineConfig, devices } from '@playwright/test';

const DEV_PORT = 4173;
const PROD_PORT = 4174;
const DEV_SPECS = ['layout.spec.ts', 'netplay.spec.ts', 'relay.spec.ts'];
// The throttled measurement is timed against a budget, so it runs from its own
// config with a single worker: sharing a pool with the rest of the suite makes
// contention, not the game, decide the result. See playwright.perf.config.ts.
const PERF_SPECS = ['perf.spec.ts'];

export default defineConfig({
  testDir: 'e2e',
  testIgnore: PERF_SPECS,
  timeout: 30_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    trace: 'off',
    video: 'off'
  },
  webServer: [
    {
      // Dev server for the specs that read the debug handle; production builds do
      // not ship it, so those tests cannot run against the deployed artifact.
      command: `npm run dev -- --port ${DEV_PORT} --strictPort`,
      url: `http://localhost:${DEV_PORT}`,
      reuseExistingServer: true,
      timeout: 60_000
    },
    {
      command: 'node scripts/signaling-server.mjs --port 8090',
      url: 'http://localhost:8090',
      reuseExistingServer: true,
      timeout: 30_000
    },
    {
      command: `npm run build && npm run preview -- --port ${PROD_PORT} --strictPort`,
      url: `http://localhost:${PROD_PORT}`,
      reuseExistingServer: true,
      timeout: 180_000
    }
  ],
  projects: [
    {
      name: 'desktop',
      testMatch: DEV_SPECS,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: `http://localhost:${DEV_PORT}` }
    },
    {
      name: 'phone-landscape',
      testMatch: DEV_SPECS,
      use: { ...devices['Desktop Chrome'], viewport: { width: 740, height: 360 }, hasTouch: true, isMobile: true, baseURL: `http://localhost:${DEV_PORT}` }
    },
    {
      name: 'phone-portrait',
      testMatch: DEV_SPECS,
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, baseURL: `http://localhost:${DEV_PORT}` }
    },
    {
      name: 'production',
      testMatch: 'production.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, baseURL: `http://localhost:${PROD_PORT}` }
    },
    {
      name: 'visual',
      testMatch: 'visual.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: `http://localhost:${DEV_PORT}` }
    }
  ]
});
