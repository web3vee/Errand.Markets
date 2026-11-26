import { pgEnum } from 'drizzle-orm/pg-core';

export const marketStatus = pgEnum('market_status', ['draft', 'active', 'paused']);
export const userStatus = pgEnum('user_status', ['active', 'suspended', 'banned', 'deleted']);
/** `driver` and `business_member` are reserved for Phase 2 (no code paths grant them yet). */
export const appRole = pgEnum('app_role', ['customer', 'runner', 'admin', 'driver', 'business_member']);
export const roleStatus = pgEnum('role_status', ['active', 'revoked']);
export const pricingControl = pgEnum('pricing_control', ['customer_fixed', 'runner_offers', 'both', 'platform_set']);
export const runnerKycStatus = pgEnum('runner_kyc_status', [
  'not_started', // no verification yet
  'pending', // with the provider
  'in_review', // provider finished; waiting for admin
  'resubmission_required',
  'approved',
  'rejected',
]);
export const kycVerificationStatus = pgEnum('kyc_verification_status', [
  'created',
  'submitted',
  'provider_approved',
  'provider_rejected',
  'needs_resubmission',
  'admin_approved',
  'admin_rejected',
  'cancelled',
]);
export const vehicleType = pgEnum('vehicle_type', ['none', 'bicycle', 'motorbike', 'car']);
export const availability = pgEnum('availability', ['offline', 'online']);
export const webhookStatus = pgEnum('webhook_status', ['received', 'processed', 'ignored', 'failed']);
