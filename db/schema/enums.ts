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

// ── Stage 4: marketplace ─────────────────────────────────────────────────────
export const errandStatus = pgEnum('errand_status', [
  'draft', 'open', 'offer_accepted', 'funded', 'in_progress', 'completed_pending_confirmation', 'confirmed', 'paid_out',
  'cancelled', 'disputed', 'refunded', 'expired',
]);
export const errandReviewState = pgEnum('errand_review_state', ['none', 'pending_review', 'cleared', 'rejected']);
export const pricingMode = pgEnum('pricing_mode', ['fixed', 'offers']);
export const timeWindowKind = pgEnum('time_window_kind', ['asap', 'by_time']);
export const stopKind = pgEnum('stop_kind', ['pickup', 'purchase', 'collect', 'dropoff']);
export const pinSource = pgEnum('pin_source', ['area_center', 'device', 'map']);
export const offerKind = pgEnum('offer_kind', ['accept_price', 'counter_offer']);
export const offerStatus = pgEnum('offer_status', ['pending', 'accepted', 'withdrawn', 'declined', 'expired', 'superseded']);
export const actorType = pgEnum('actor_type', ['customer', 'runner', 'admin', 'system', 'provider']);
export const mediaKind = pgEnum('media_kind', ['errand_reference', 'message_photo', 'proof', 'receipt', 'avatar']);
export const prohibitedAction = pgEnum('prohibited_action', ['block', 'review']);
export const conversationStatus = pgEnum('conversation_status', ['open', 'read_only']);
export const deliveryChannel = pgEnum('delivery_channel', ['push', 'sms']);
export const deliveryStatus = pgEnum('delivery_status', ['queued', 'sent', 'failed', 'skipped']);
export const reportStatus = pgEnum('report_status', ['open', 'actioned', 'dismissed']);

// ── Stage 5: fulfilment ──────────────────────────────────────────────────────
export const disputeStatus = pgEnum('dispute_status', ['open', 'resolved']);
export const disputeOutcome = pgEnum('dispute_outcome', ['release_runner', 'refund_customer']);
export const partyRole = pgEnum('party_role', ['customer', 'runner']);
