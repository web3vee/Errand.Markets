/**
 * Database setup.
 *   pnpm db:migrate               → migrate + seed every region that has DATABASE_URL_<REGION> set
 *   pnpm db:local [--reset] [url] → LOCAL ONLY: (reset,) apply the Supabase shim, migrate, seed
 */
import { readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from '../../db/schema';
import { seed } from './seed';

export async function setupDatabase(url: string, opts: { local: boolean; reset: boolean }) {
  const client = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  try {
    if (opts.local) {
      const host = new URL(url).hostname;
      if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error(`Refusing to apply the local Supabase shim to ${host}`);
      if (opts.reset) await client.unsafe('drop schema if exists public cascade; drop schema if exists app cascade; drop schema if exists drizzle cascade; drop schema if exists auth cascade; create schema public;');
      await client.unsafe(readFileSync('db/local/supabase-shim.sql', 'utf8'));
    }
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: 'db/migrations' });
    return await seed(db);
  } finally {
    await client.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === 'local') {
    const url = args.find((a) => a.startsWith('postgres')) ?? process.env.DATABASE_URL_EU_WEST_2;
    if (!url) throw new Error('No database URL');
    console.log(await setupDatabase(url, { local: true, reset: args.includes('--reset') }));
    return;
  }
  const regions = Object.keys(process.env).filter((k) => k.startsWith('DATABASE_URL_'));
  if (regions.length === 0) throw new Error('No DATABASE_URL_<REGION> variables set');
  for (const key of regions) console.log(key, await setupDatabase(process.env[key]!, { local: false, reset: false }));
}

if (process.argv[1]?.endsWith('setup.ts')) main().catch((e) => { console.error(e); process.exit(1); });
