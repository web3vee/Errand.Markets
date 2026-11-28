import { setupDatabase } from '../../scripts/db/setup';
import { ALL_TEST_MARKETS } from '../fixtures/markets';

/** Fresh schema for every run: Supabase shim → migrations → seed (real markets + test fixtures; local Postgres only). */
export default async function () {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://errand:errand@localhost:5432/errand_test';
  await setupDatabase(url, { local: true, reset: true, markets: ALL_TEST_MARKETS });
}
