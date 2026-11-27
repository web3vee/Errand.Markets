import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://errand:errand@localhost:5432/errand_test';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['tests/integration/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    env: { DATABASE_URL_EU_WEST_2: TEST_DB, TEST_DATABASE_URL: TEST_DB, ID_HASH_PEPPER: 'test-pepper', SANDBOX_WEBHOOK_SECRET: 'test-sandbox-secret' },
  },
});
