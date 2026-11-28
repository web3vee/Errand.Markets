import { and, eq, inArray, isNull } from 'drizzle-orm';
import { asSystem, asUser, type Db, type JwtClaims } from '../../../db/client';
import { adminGrants, customerProfiles, runnerProfiles, runnerServiceAreas, serviceAreas, userRoles, users } from '../../../db/schema';
import type { AdminGrant, RoleRow } from './domain/policy';

export type Account = {
  /** phoneE164 is null until a Google-only account verifies a phone (required to post or run errands). */
  id: string; marketId: string; phoneE164: string | null; email: string | null; displayName: string | null; locale: string; status: string;
  roles: RoleRow[]; adminGrants: AdminGrant[];
  runner: null | {
    kycStatus: string; kycApprovedAt: Date | null; vehicle: string; bio: string | null; availability: string;
    emergencyContactName: string | null; emergencyContactPhone: string | null; serviceAreaIds: string[];
  };
};

export class IdentityError extends Error {
  constructor(readonly code: 'phone_required' | 'phone_taken' | 'phone_already_set' | 'no_contact') { super(code); }
}

/**
 * First sign-in creates the user, with the customer role. Phone sign-in: the market their number
 * belongs to. Google sign-in: the market they signed in from, with no phone yet (email + Google
 * name instead). Idempotent (safe on retries / double submits).
 */
export async function ensureUser(db: Db, input: {
  authUserId: string; phoneE164: string | null; email?: string | null; displayName?: string | null; marketId: string; locale: string;
}) {
  if (!input.phoneE164 && !input.email) throw new IdentityError('no_contact');
  return asSystem(db, 'identity.ensureUser after verified sign-in', async (tx) => {
    const [existing] = await tx.select({ id: users.id, marketId: users.marketId, displayName: users.displayName, status: users.status })
      .from(users).where(eq(users.id, input.authUserId));
    if (existing) return { ...existing, created: false };
    const displayName = input.displayName?.trim().slice(0, 60) || null;
    await tx.insert(users).values({
      id: input.authUserId, marketId: input.marketId, phoneE164: input.phoneE164, email: input.email ?? null, displayName, locale: input.locale,
    }).onConflictDoNothing();
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
      id: u.id, marketId: u.marketId, phoneE164: u.phoneE164, email: u.email, displayName: u.displayName, locale: u.locale, status: u.status,
      roles, adminGrants: grants,
      runner: rp ? {
        kycStatus: rp.kycStatus, kycApprovedAt: rp.kycApprovedAt, vehicle: rp.vehicle, bio: rp.bio, availability: rp.availability,
        emergencyContactName: rp.emergencyContactName, emergencyContactPhone: rp.emergencyContactPhone, serviceAreaIds: areas.map((a) => a.id),
      } : null,
    };
  });
}

/** Whether another account already has this verified number (checked before sending a code). */
export async function phoneBelongsToOther(db: Db, userId: string, phoneE164: string): Promise<boolean> {
  const [owner] = await asSystem(db, 'identity.phoneBelongsToOther', (tx) => tx.select({ id: users.id }).from(users).where(eq(users.phoneE164, phoneE164)));
  return !!owner && owner.id !== userId;
}

/**
 * Record a phone number the user just verified by OTP (Google accounts adding one). Never replaces
 * an existing number; a number on another account is refused. Caller must have verified the code.
 */
export async function linkVerifiedPhone(db: Db, userId: string, phoneE164: string) {
  return asSystem(db, 'identity.linkVerifiedPhone after verified OTP', async (tx) => {
    const [owner] = await tx.select({ id: users.id }).from(users).where(eq(users.phoneE164, phoneE164));
    if (owner && owner.id !== userId) throw new IdentityError('phone_taken');
    const [me] = await tx.select({ phone: users.phoneE164 }).from(users).where(eq(users.id, userId));
    if (me?.phone === phoneE164) return;
    if (me?.phone) throw new IdentityError('phone_already_set');
    await tx.update(users).set({ phoneE164, updatedAt: new Date() }).where(and(eq(users.id, userId), isNull(users.phoneE164)));
  });
}

/** Self-service profile edit — runs as the user; column grants + RLS limit what can change. */
export async function updateDisplayName(db: Db, claims: JwtClaims, displayName: string) {
  await asUser(db, claims, (tx) => tx.update(users).set({ displayName }).where(eq(users.id, claims.sub)));
}

/** Adds the runner role and an empty Runner profile in the user's own market. Idempotent. */
export async function becomeRunner(db: Db, userId: string) {
  return asSystem(db, 'identity.becomeRunner (self-service, caller verified session)', async (tx) => {
    const [u] = await tx.select({ marketId: users.marketId, status: users.status, phone: users.phoneE164 }).from(users).where(eq(users.id, userId));
    if (!u || u.status !== 'active') throw new Error('account_not_active');
    if (!u.phone) throw new IdentityError('phone_required');
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
