import { and, eq, inArray, isNull } from 'drizzle-orm';
import { asSystem, asUser, type Db, type JwtClaims } from '../../../db/client';
import { adminGrants, customerProfiles, runnerProfiles, runnerServiceAreas, serviceAreas, userRoles, users } from '../../../db/schema';
import type { AdminGrant, RoleRow } from './domain/policy';

export type Account = {
  id: string; marketId: string; phoneE164: string; displayName: string | null; locale: string; status: string;
  roles: RoleRow[]; adminGrants: AdminGrant[];
  runner: null | {
    kycStatus: string; kycApprovedAt: Date | null; vehicle: string; bio: string | null; availability: string;
    emergencyContactName: string | null; emergencyContactPhone: string | null; serviceAreaIds: string[];
  };
};

/**
 * First sign-in creates the user in the market their phone number belongs to, with the
 * customer role. Idempotent (safe on retries / double submits).
 */
export async function ensureUser(db: Db, input: { authUserId: string; phoneE164: string; marketId: string; locale: string }) {
  return asSystem(db, 'identity.ensureUser after verified OTP', async (tx) => {
    const [existing] = await tx.select({ id: users.id, marketId: users.marketId, displayName: users.displayName, status: users.status })
      .from(users).where(eq(users.id, input.authUserId));
    if (existing) return { ...existing, created: false };
    await tx.insert(users).values({ id: input.authUserId, marketId: input.marketId, phoneE164: input.phoneE164, locale: input.locale }).onConflictDoNothing();
    await tx.insert(userRoles).values({ userId: input.authUserId, role: 'customer' }).onConflictDoNothing();
    await tx.insert(customerProfiles).values({ userId: input.authUserId }).onConflictDoNothing();
    const [u] = await tx.select({ id: users.id, marketId: users.marketId, displayName: users.displayName, status: users.status })
      .from(users).where(eq(users.id, input.authUserId));
    return { ...u!, created: true };
  });
}

/** Everything the app needs about the signed-in user — read through RLS as that user. */
export async function getAccount(db: Db, claims: JwtClaims): Promise<Account | null> {
  return asUser(db, claims, async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, claims.sub));
    if (!u) return null;
    const roles = await tx.select({ role: userRoles.role, status: userRoles.status }).from(userRoles).where(eq(userRoles.userId, u.id));
    const grants = await tx.select({ marketId: adminGrants.marketId, permissions: adminGrants.permissions, revokedAt: adminGrants.revokedAt })
      .from(adminGrants).where(and(eq(adminGrants.userId, u.id), isNull(adminGrants.revokedAt)));
    const [rp] = await tx.select().from(runnerProfiles).where(eq(runnerProfiles.userId, u.id));
    const areas = rp ? await tx.select({ id: runnerServiceAreas.serviceAreaId }).from(runnerServiceAreas).where(eq(runnerServiceAreas.userId, u.id)) : [];
    return {
      id: u.id, marketId: u.marketId, phoneE164: u.phoneE164, displayName: u.displayName, locale: u.locale, status: u.status,
      roles, adminGrants: grants,
      runner: rp ? {
        kycStatus: rp.kycStatus, kycApprovedAt: rp.kycApprovedAt, vehicle: rp.vehicle, bio: rp.bio, availability: rp.availability,
        emergencyContactName: rp.emergencyContactName, emergencyContactPhone: rp.emergencyContactPhone, serviceAreaIds: areas.map((a) => a.id),
      } : null,
    };
  });
}

/** Self-service profile edit — runs as the user; column grants + RLS limit what can change. */
export async function updateDisplayName(db: Db, claims: JwtClaims, displayName: string) {
  await asUser(db, claims, (tx) => tx.update(users).set({ displayName }).where(eq(users.id, claims.sub)));
}

/** Adds the runner role and an empty Runner profile in the user's own market. Idempotent. */
export async function becomeRunner(db: Db, userId: string) {
  return asSystem(db, 'identity.becomeRunner (self-service, caller verified session)', async (tx) => {
    const [u] = await tx.select({ marketId: users.marketId, status: users.status }).from(users).where(eq(users.id, userId));
    if (!u || u.status !== 'active') throw new Error('account_not_active');
    await tx.insert(userRoles).values({ userId, role: 'runner' }).onConflictDoNothing();
    await tx.insert(runnerProfiles).values({ userId, marketId: u.marketId }).onConflictDoNothing();
  });
}

export type RunnerProfileInput = {
  bio: string | null; vehicle: 'none' | 'bicycle' | 'motorbike' | 'car';
  emergencyContactName: string | null; emergencyContactPhone: string | null; serviceAreaIds: string[];
};

/** Runs as the user. Service areas must be active areas of the Runner's market (also enforced by DB trigger). */
export async function updateRunnerProfile(db: Db, claims: JwtClaims, input: RunnerProfileInput) {
  return asUser(db, claims, async (tx) => {
    const [rp] = await tx.select({ marketId: runnerProfiles.marketId }).from(runnerProfiles).where(eq(runnerProfiles.userId, claims.sub));
    if (!rp) throw new Error('not_a_runner');
    const valid = input.serviceAreaIds.length
      ? await tx.select({ id: serviceAreas.id }).from(serviceAreas)
          .where(and(eq(serviceAreas.marketId, rp.marketId), eq(serviceAreas.active, true), inArray(serviceAreas.id, input.serviceAreaIds)))
      : [];
    if (valid.length !== input.serviceAreaIds.length) throw new Error('invalid_service_area');
    await tx.update(runnerProfiles).set({
      bio: input.bio, vehicle: input.vehicle, emergencyContactName: input.emergencyContactName, emergencyContactPhone: input.emergencyContactPhone,
    }).where(eq(runnerProfiles.userId, claims.sub));
    await tx.delete(runnerServiceAreas).where(eq(runnerServiceAreas.userId, claims.sub));
    if (valid.length) await tx.insert(runnerServiceAreas).values(valid.map((v) => ({ userId: claims.sub, serviceAreaId: v.id })));
  });
}

export async function listServiceAreas(db: Db, marketId: string) {
  return db.select({ id: serviceAreas.id, slug: serviceAreas.slug, name: serviceAreas.name })
    .from(serviceAreas).where(and(eq(serviceAreas.marketId, marketId), eq(serviceAreas.active, true))).orderBy(serviceAreas.sort);
}
