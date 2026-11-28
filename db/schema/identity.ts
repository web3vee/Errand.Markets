import { sql } from 'drizzle-orm';
import { char, check, index, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { appRole, availability, kycVerificationStatus, roleStatus, runnerKycStatus, userStatus, vehicleType } from './enums';
import { markets, serviceAreas } from './markets';

/** id = auth.users.id (FK added in SQL migration, since auth is a Supabase-managed schema). */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    marketId: uuid('market_id').notNull().references(() => markets.id),
    /**
     * Verified mobile number (set only after an OTP check). NULL for accounts that signed in with
     * Google and haven't added one yet: they can browse, but posting errands and becoming a
     * Runner require it (enforced by DB triggers, migration 0008).
     */
    phoneE164: text('phone_e164').unique(),
    displayName: text('display_name'),
    email: text('email'),
    locale: text('locale').notNull().default('en'),
    status: userStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('users_market').on(t.marketId), check('users_phone_or_email', sql`${t.phoneE164} is not null or ${t.email} is not null`)],
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id').notNull().references(() => users.id),
    role: appRole('role').notNull(),
    status: roleStatus('status').notNull().default('active'),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    grantedBy: uuid('granted_by'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

/** market_id NULL = all markets. */
export const adminGrants = pgTable(
  'admin_grants',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull().references(() => users.id),
    marketId: uuid('market_id').references(() => markets.id),
    permissions: text('permissions').array().notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    grantedBy: uuid('granted_by'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('admin_grants_user').on(t.userId)],
);

export const customerProfiles = pgTable('customer_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const runnerProfiles = pgTable(
  'runner_profiles',
  {
    userId: uuid('user_id').primaryKey().references(() => users.id),
    marketId: uuid('market_id').notNull().references(() => markets.id),
    kycStatus: runnerKycStatus('kyc_status').notNull().default('not_started'),
    kycApprovedAt: timestamp('kyc_approved_at', { withTimezone: true }),
    availability: availability('availability').notNull().default('offline'),
    vehicle: vehicleType('vehicle').notNull().default('none'),
    bio: text('bio'),
    emergencyContactName: text('emergency_contact_name'),
    emergencyContactPhone: text('emergency_contact_phone'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('runner_profiles_market_status').on(t.marketId, t.kycStatus)],
);

export const runnerServiceAreas = pgTable(
  'runner_service_areas',
  {
    userId: uuid('user_id').notNull().references(() => runnerProfiles.userId, { onDelete: 'cascade' }),
    serviceAreaId: uuid('service_area_id').notNull().references(() => serviceAreas.id),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serviceAreaId] })],
);

export const kycVerifications = pgTable(
  'kyc_verifications',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id),
    marketId: uuid('market_id').notNull().references(() => markets.id),
    provider: text('provider').notNull(),
    providerRef: text('provider_ref'),
    level: text('level').notNull(),
    status: kycVerificationStatus('status').notNull().default('created'),
    /** Normalised result: checks, document type, name, age band, flags. Never raw ID numbers or images. */
    resultSummary: jsonb('result_summary'),
    idNumberHash: char('id_number_hash', { length: 64 }),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewReasonCode: text('review_reason_code'),
    reviewNote: text('review_note'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('kyc_verifications_user').on(t.userId),
    index('kyc_verifications_market_status').on(t.marketId, t.status),
    uniqueIndex('kyc_verifications_provider_ref').on(t.provider, t.providerRef),
    index('kyc_verifications_id_hash').on(t.idNumberHash),
  ],
);
