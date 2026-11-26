import { defineConfig, devices } from '@playwright/test';

/**
 * E2E against a running app (local auth + sandbox providers).
 *   pnpm build && pnpm start -p 3100   (with .env.local)
 *   E2E_BASE_URL=http://localhost:3100 pnpm test:e2e
 */
export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100', trace: 'off' },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
});
