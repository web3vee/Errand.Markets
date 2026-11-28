/**
 * Grant admin access to an existing user (they must have signed in once).
 *   pnpm admin:grant --phone +2348031234567 --market NG --perms ops,support
 *   pnpm admin:grant --phone +17844301234 --market ALL --perms super
 * Writes an admin_audit_log entry. Run with the target region's DATABASE_URL_* set.
 */
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema';

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const PERMS = ['ops', 'support', 'finance', 'config', 'super'];

async function main() {
  const phone = arg('phone'); const marketCode = arg('market')?.toUpperCase(); const perms = (arg('perms') ?? 'ops').split(',');
  if (!phone || !marketCode) throw new Error('Usage: --phone +E164 --market <CODE>|ALL [--perms ops,support]');
  if (perms.some((p) => !PERMS.includes(p))) throw new Error(`perms must be from ${PERMS.join(', ')}`);
  const url = process.env.DATABASE_URL_EU_WEST_2 ?? process.env.MIGRATE_DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL_<REGION>');
  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });
  try {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.phoneE164, phone));
    if (!user) throw new Error(`No user with phone ${phone}. They must sign in once first.`);
    let marketId: string | null = null;
    if (marketCode !== 'ALL') {
      const [m] = await db.select().from(schema.markets).where(eq(schema.markets.code, marketCode));
      if (!m) throw new Error(`Unknown market ${marketCode}`);
      marketId = m.id;
    }
    await db.transaction(async (tx) => {
      await tx.insert(schema.userRoles).values({ userId: user.id, role: 'admin' })
        .onConflictDoUpdate({ target: [schema.userRoles.userId, schema.userRoles.role], set: { status: 'active' } });
      const existing = await tx.select().from(schema.adminGrants).where(and(eq(schema.adminGrants.userId, user.id)));
      for (const g of existing.filter((g) => g.marketId === marketId && !g.revokedAt)) {
        await tx.update(schema.adminGrants).set({ revokedAt: new Date() }).where(eq(schema.adminGrants.id, g.id));
      }
      await tx.insert(schema.adminGrants).values({ userId: user.id, marketId, permissions: perms });
      await tx.insert(schema.adminAuditLog).values({ actorId: user.id, marketId, action: 'admin.grant', subjectType: 'user', subjectId: user.id, data: { perms, via: 'cli' } });
    });
    console.log(`Granted ${perms.join(',')} on ${marketCode} to ${phone}`);
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
