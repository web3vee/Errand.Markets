import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { asUser } from '../../db/client';
import { adminAuditLog, markets, providerWebhookEvents, runnerProfiles, runnerServiceAreas, users } from '../../db/schema';
import { becomeRunner } from '@/modules/identity/service';
import { areas, db, expectDbError, makeAdmin, makeUser } from './helpers';

/** Row-level security + column grants, exercised exactly as the app runs user requests. */
describe('RLS: users and profiles', () => {
  it('a user sees only their own user row', async () => {
    const a = await makeUser('NG', 'Ada');
    await makeUser('NG', 'Bola');
    const rows = await asUser(db(), a.claims, (tx) => tx.select({ id: users.id }).from(users));
    expect(rows).toEqual([{ id: a.id }]);
  });

  it("can't change someone else's name (0 rows) or their own KYC status (no column grant)", async () => {
    const a = await makeUser('NG'); const b = await makeUser('NG', 'Original');
    await asUser(db(), a.claims, (tx) => tx.update(users).set({ displayName: 'Hacked' }).where(eq(users.id, b.id)));
    const [row] = await db().select({ n: users.displayName }).from(users).where(eq(users.id, b.id));
    expect(row!.n).toBe('Original');
    await becomeRunner(db(), a.id);
    await expectDbError(asUser(db(), a.claims, (tx) => tx.update(runnerProfiles).set({ kycStatus: 'approved' }).where(eq(runnerProfiles.userId, a.id))), /permission denied/);
  });

  it('clients have no access at all to webhook events', async () => {
    const a = await makeUser('VC');
    await expectDbError(asUser(db(), a.claims, (tx) => tx.select().from(providerWebhookEvents)), /permission denied/);
  });

  it('anonymous visitors can read active markets but not users', async () => {
    await db().transaction(async (tx) => {
      await tx.execute(sql`select set_config('role', 'anon', true)`);
      expect((await tx.select({ code: markets.code }).from(markets)).map((m) => m.code).sort()).toEqual(['NG', 'VC']);
      await expectDbError(tx.select().from(users), /permission denied/);
    }).catch((e) => { if (!/permission denied/.test(String(e))) throw e; });
  });
});

describe('RLS: market-scoped admins', () => {
  it('an NG admin sees NG Runners only; an all-markets admin sees both', async () => {
    const ng = await makeUser('NG', 'NG Runner'); await becomeRunner(db(), ng.id);
    const vc = await makeUser('VC', 'VC Runner'); await becomeRunner(db(), vc.id);
    const ngAdmin = await makeAdmin('NG');
    const global = await makeAdmin('ALL');
    const seen = async (c: typeof ngAdmin) => (await asUser(db(), c.claims, (tx) => tx.select({ id: runnerProfiles.userId }).from(runnerProfiles))).map((r) => r.id);
    const ngSees = await seen(ngAdmin);
    expect(ngSees).toContain(ng.id);
    expect(ngSees).not.toContain(vc.id);
    expect(await seen(global)).toEqual(expect.arrayContaining([ng.id, vc.id]));
  });

  it('an admin without the ops permission sees nothing extra', async () => {
    const r = await makeUser('NG'); await becomeRunner(db(), r.id);
    const finance = await makeAdmin('NG', ['finance']);
    const rows = await asUser(db(), finance.claims, (tx) => tx.select().from(runnerProfiles).where(eq(runnerProfiles.userId, r.id)));
    expect(rows).toEqual([]);
  });
});

describe('integrity triggers', () => {
  it("a Runner can't pick a service area from another market", async () => {
    const ng = await makeUser('NG'); await becomeRunner(db(), ng.id);
    const vcArea = (await areas('VC'))[0]!;
    await expectDbError(asUser(db(), ng.claims, (tx) => tx.insert(runnerServiceAreas).values({ userId: ng.id, serviceAreaId: vcArea.id })), /different market/);
  });
  it('the admin audit log is append-only, even for the service role', async () => {
    const a = await makeAdmin('NG');
    const [row] = await db().insert(adminAuditLog).values({ actorId: a.id, action: 'test', subjectType: 'x', subjectId: 'y' }).returning();
    await expectDbError(db().update(adminAuditLog).set({ action: 'changed' }).where(eq(adminAuditLog.id, row!.id)), /append-only/);
    await expectDbError(db().delete(adminAuditLog).where(eq(adminAuditLog.id, row!.id)), /append-only/);
  });
});

describe('privilege allow-list', () => {
  it('anon/authenticated hold exactly the expected table privileges (catches new tables left open)', async () => {
    const rows = (await db().execute(sql`
      select grantee, table_name, string_agg(privilege_type, ',' order by privilege_type) as privs
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated')
      group by grantee, table_name order by grantee, table_name`)) as unknown as { grantee: string; table_name: string; privs: string }[];
    expect(rows.map((r) => `${r.grantee}:${r.table_name}:${r.privs}`)).toEqual([
      'anon:errand_categories:SELECT', 'anon:market_fee_schedules:SELECT', 'anon:markets:SELECT', 'anon:prohibited_items:SELECT',
      'anon:runner_rules:SELECT', 'anon:service_areas:SELECT',
      'authenticated:admin_audit_log:SELECT', 'authenticated:admin_grants:SELECT', 'authenticated:blocks:SELECT', 'authenticated:conversation_reads:SELECT',
      'authenticated:conversations:SELECT', 'authenticated:customer_profiles:SELECT', 'authenticated:errand_categories:SELECT', 'authenticated:errand_events:SELECT',
      'authenticated:errand_items:SELECT', 'authenticated:errand_stops:SELECT', 'authenticated:errands:SELECT', 'authenticated:kyc_verifications:SELECT',
      'authenticated:market_fee_schedules:SELECT', 'authenticated:markets:SELECT', 'authenticated:media:SELECT', 'authenticated:messages:SELECT',
      'authenticated:notifications:SELECT', 'authenticated:offers:SELECT', 'authenticated:places:SELECT', 'authenticated:prohibited_items:SELECT',
      'authenticated:push_subscriptions:DELETE,SELECT', 'authenticated:reports:SELECT', 'authenticated:runner_profiles:SELECT', 'authenticated:runner_rules:SELECT',
      'authenticated:runner_service_areas:DELETE,INSERT,SELECT', 'authenticated:service_areas:SELECT', 'authenticated:user_roles:SELECT', 'authenticated:users:SELECT',
    ]);
  });
});
