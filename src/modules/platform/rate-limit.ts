import { sql } from 'drizzle-orm';
import type { DbOrTx } from '../../../db/client';

export const windowStart = (now: Date, windowSeconds: number) =>
  new Date(Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000);

/**
 * Fixed-window counter in Postgres (no extra infrastructure). Atomically increments and
 * reports whether this hit is within `limit`.
 */
export async function hitRateLimit(db: DbOrTx, key: string, limit: number, windowSeconds: number, now = new Date()) {
  const start = windowStart(now, windowSeconds);
  const rows = (await db.execute(sql`
    insert into rate_limits (key, window_start, count) values (${key}, ${start.toISOString()}, 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count`)) as unknown as { count: number }[];
  const count = rows[0]!.count;
  const retryAfter = Math.ceil((start.getTime() + windowSeconds * 1000 - now.getTime()) / 1000);
  return { allowed: count <= limit, count, retryAfterSeconds: retryAfter };
}
