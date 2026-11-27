import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema/index.ts',
  out: './db/migrations',
  dbCredentials: { url: process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL_EU_WEST_2 ?? '' },
  strict: true,
});
