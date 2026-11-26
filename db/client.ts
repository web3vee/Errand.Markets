import 'server-only';
import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

/**
 * Regional router. Each market row names a data region; the connection string for
 * a region comes from DATABASE_URL_<REGION> (e.g. DATABASE_URL_EU_WEST_2).
 * Business logic asks for a region's DB via the market — never a hardcoded URL.
 */
export function regionEnvKey(region: string): string {
  return `DATABASE_URL_${region.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

const pools = new Map<string, Db>();

export function dbForRegion(region: string): Db {
  const existing = pools.get(region);
  if (existing) return existing;
  const url = process.env[regionEnvKey(region)];
  if (!url) throw new Error(`No database configured for region ${region} (${regionEnvKey(region)})`);
  // prepare:false keeps us compatible with Supabase's transaction pooler.
  const client = postgres(url, { prepare: false, max: Number(process.env.DB_POOL_MAX ?? 5), idle_timeout: 20 });
  const db = drizzle(client, { schema });
  pools.set(region, db);
  return db;
}

/** Until users carry their region in the session (see docs/architecture/07), identity lives in the default region. */
export function defaultRegion(): string {
  return process.env.DEFAULT_DATA_REGION ?? 'eu-west-2';
}
export const defaultDb = () => dbForRegion(defaultRegion());
export const hasDatabase = () => Boolean(process.env[regionEnvKey(defaultRegion())]);

export type JwtClaims = { sub: string; role: 'authenticated'; phone?: string; [k: string]: unknown };

/**
 * Run `fn` as the signed-in user: role `authenticated` + their JWT claims for this
 * transaction only, so Postgres RLS applies to server code exactly as to clients.
 */
export async function asUser<T>(db: Db, claims: JwtClaims, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true), set_config('role', 'authenticated', true)`);
    return fn(tx);
  });
}

/**
 * Run `fn` with the service connection (RLS bypassed). Only for webhooks, jobs and use cases
 * that have already passed an explicit policy check. `reason` is logged for audit.
 */
export async function asSystem<T>(db: Db, reason: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (process.env.LOG_SYSTEM_DB === '1') console.info(JSON.stringify({ level: 'info', msg: 'db.asSystem', reason }));
  return db.transaction(fn);
}
