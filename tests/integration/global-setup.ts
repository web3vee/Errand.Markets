import { setupDatabase } from '../../scripts/db/setup';

/** Fresh schema for every run: Supabase shim → migrations → seed (local Postgres only). */
export default async function () {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://errand:errand@localhost:5432/errand_test';
  await setupDatabase(url, { local: true, reset: true });
}
