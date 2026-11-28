import { sql } from 'drizzle-orm';
import { bigint, bigserial, boolean, char, index, integer, jsonb, numeric, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorType, disputeOutcome, disputeStatus, errandReviewState, errandStatus, mediaKind, offerKind, offerStatus, partyRole, pinSource, pricingMode, stopKind, timeWindowKind } from './enums';
import { users } from './identity';
import { errandCategories, marketFeeSchedules, markets, serviceAreas } from './markets';

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** A location: map pin + landmark note + contact phone (landmark-based addresses are the norm). */
export const places = pgTable('places', {
  id: uuid('id').primaryKey(),
  marketId: uuid('market_id').notNull().references(() => markets.id),
  ownerId: uuid('owner_id').notNull().references(() => users.id),
  lat: numeric('lat', { precision: 9, scale: 6 }).notNull(),
  lng: numeric('lng', { precision: 9, scale: 6 }).notNull(),
  pinSource: pinSource('pin_source').notNull(),
  serviceAreaId: uuid('service_area_id').notNull().references(() => serviceAreas.id),
  landmark: text('landmark').notNull(),
  addressText: text('address_text'),
  contactName: text('contact_name'),
  contactPhoneE164: text('contact_phone_e164'),
  createdAt,
});

export const errands = pgTable(
  'errands',
  {
    id: uuid('id').primaryKey(),
    marketId: uuid('market_id').notNull().references(() => markets.id),
    customerId: uuid('customer_id').notNull().references(() => users.id),
    runnerId: uuid('runner_id').references(() => users.id),
    categoryId: uuid('category_id').notNull().references(() => errandCategories.id),
    title: text('title').notNull(),
    description: text('description').notNull(),
    status: errandStatus('status').notNull().default('draft'),
    reviewState: errandReviewState('review_state').notNull().default('none'),
    reviewNote: text('review_note'),
    version: integer('version').notNull().default(1),
    pricingMode: pricingMode('pricing_mode').notNull().default('fixed'),
    currency: char('currency', { length: 3 }).notNull(),
    priceMinor: bigint('price_minor', { mode: 'bigint' }).notNull(),
    requiresPurchase: boolean('requires_purchase').notNull().default(false),
    itemEstimateMinor: bigint('item_estimate_minor', { mode: 'bigint' }).notNull().default(sql`0`),
    feeScheduleId: uuid('fee_schedule_id').references(() => marketFeeSchedules.id),
    acceptedOfferId: uuid('accepted_offer_id'),
    originServiceAreaId: uuid('origin_service_area_id').notNull().references(() => serviceAreas.id),
    windowKind: timeWindowKind('window_kind').notNull().default('asap'),
    windowEnd: timestamp('window_end', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    fundedAt: timestamp('funded_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    autoReleaseAt: timestamp('auto_release_at', { withTimezone: true }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: uuid('cancelled_by'),
    cancelReasonCode: text('cancel_reason_code'),
    /** Stage 5: what the Runner actually spent on items (from the receipt); settled against the estimate in Stage 6. */
    itemActualMinor: bigint('item_actual_minor', { mode: 'bigint' }),
    /** Stage 5: how many "please confirm" reminders have gone out (index into the fee schedule's reminder offsets). */
    remindersSent: smallint('reminders_sent').notNull().default(0),
    priority: text('priority').notNull().default('standard'), // Phase 2: priority fulfilment
    businessAccountId: uuid('business_account_id'), // Phase 2: corporate accounts
    createdAt,
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('errands_market_status').on(t.marketId, t.status, t.publishedAt),
    index('errands_customer').on(t.customerId, t.createdAt),
    index('errands_runner').on(t.runnerId, t.status),
    index('errands_expiry').on(t.status, t.expiresAt),
  ],
);

export const errandStops = pgTable(
  'errand_stops',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    errandId: uuid('errand_id').notNull().references(() => errands.id, { onDelete: 'cascade' }),
    seq: smallint('seq').notNull(),
    kind: stopKind('kind').notNull(),
    placeId: uuid('place_id').notNull().references(() => places.id),
    instructions: text('instructions'),
  },
  (t) => [uniqueIndex('errand_stops_seq').on(t.errandId, t.seq)],
);

export const errandItems = pgTable('errand_items', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  errandId: uuid('errand_id').notNull().references(() => errands.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  qty: integer('qty').notNull(),
  estUnitPriceMinor: bigint('est_unit_price_minor', { mode: 'bigint' }).notNull(),
  notes: text('notes'),
});

/** Uploaded images (EXIF/GPS stripped, re-encoded). Bytes live in object storage. */
export const media = pgTable(
  'media',
  {
    id: uuid('id').primaryKey(),
    marketId: uuid('market_id').notNull().references(() => markets.id),
    ownerId: uuid('owner_id').notNull().references(() => users.id),
    kind: mediaKind('kind').notNull(),
    errandId: uuid('errand_id').references(() => errands.id),
    conversationId: uuid('conversation_id'),
    storageKey: text('storage_key').notNull(),
    contentType: text('content_type').notNull(),
    bytes: integer('bytes').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    sha256: char('sha256', { length: 64 }).notNull(),
    createdAt,
  },
  (t) => [index('media_errand').on(t.errandId), index('media_conversation').on(t.conversationId)],
);

/** Acceptances (customer-price mode) and, when enabled per market, counter-offers. */
export const offers = pgTable(
  'offers',
  {
    id: uuid('id').primaryKey(),
    marketId: uuid('market_id').notNull().references(() => markets.id),
    errandId: uuid('errand_id').notNull().references(() => errands.id),
    runnerId: uuid('runner_id').notNull().references(() => users.id),
    kind: offerKind('kind').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    message: text('message'),
    status: offerStatus('status').notNull(),
    createdAt,
  },
  (t) => [
    index('offers_errand').on(t.errandId),
    uniqueIndex('offers_one_accepted_per_errand').on(t.errandId).where(sql`status = 'accepted'`),
  ],
);

/** Append-only audit of every errand state change (written in the same transaction). */
export const errandEvents = pgTable(
  'errand_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    errandId: uuid('errand_id').notNull().references(() => errands.id),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    event: text('event').notNull(),
    actorType: actorType('actor_type').notNull(),
    actorId: uuid('actor_id'),
    data: jsonb('data').notNull().default({}),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('errand_events_errand').on(t.errandId, t.at)],
);

/** Stage 5: a problem raised by the customer or Runner. Freezes the errand until an admin resolves it. */
export const disputes = pgTable(
  'disputes',
  {
    id: uuid('id').primaryKey(),
    marketId: uuid('market_id').notNull().references(() => markets.id),
    errandId: uuid('errand_id').notNull().references(() => errands.id),
    raisedBy: uuid('raised_by').notNull().references(() => users.id),
    raisedRole: partyRole('raised_role').notNull(),
    fromStatus: errandStatus('from_status').notNull(),
    reasonCode: text('reason_code').notNull(),
    details: text('details'),
    status: disputeStatus('status').notNull().default('open'),
    outcome: disputeOutcome('outcome'),
    resolvedBy: uuid('resolved_by').references(() => users.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolutionNote: text('resolution_note'),
    createdAt,
  },
  (t) => [
    index('disputes_market_status').on(t.marketId, t.status, t.createdAt),
    uniqueIndex('disputes_one_open_per_errand').on(t.errandId).where(sql`status = 'open'`),
  ],
);

/**
 * Stage 5: two-way ratings after an errand is confirmed. Blind: each side sees the other's rating
 * only once both have rated or the rating window has closed (app.rating_revealed).
 */
export const ratings = pgTable(
  'ratings',
  {
    id: uuid('id').primaryKey(),
    marketId: uuid('market_id').notNull().references(() => markets.id),
    errandId: uuid('errand_id').notNull().references(() => errands.id),
    raterId: uuid('rater_id').notNull().references(() => users.id),
    rateeId: uuid('ratee_id').notNull().references(() => users.id),
    raterRole: partyRole('rater_role').notNull(),
    stars: smallint('stars').notNull(),
    comment: text('comment'),
    createdAt,
  },
  (t) => [uniqueIndex('ratings_one_per_rater').on(t.errandId, t.raterId), index('ratings_ratee').on(t.rateeId)],
);
