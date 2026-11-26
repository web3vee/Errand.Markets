import postgres from 'postgres';

/**
 * Every e2e sign-in comes from the same IP, which would trip the per-IP OTP limit
 * (20/hour) across repeated runs. Clear the counters in the LOCAL dev database first.
 */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? 'postgres://errand:errand@localhost:5432/errand_dev';
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error('E2E setup only clears rate limits on a local database');
  const sql = postgres(url, { max: 1 });
  try {
    await sql`delete from rate_limits`;
  } finally {
    await sql.end();
  }
}
