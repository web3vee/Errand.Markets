import { sql } from 'drizzle-orm';
import { bigint, boolean, char, index, integer, jsonb, numeric, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { marketStatus, pricingControl, prohibitedAction } from './enums';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/** One row per country/market. Every market-specific value lives here or in the tables below. */
export const markets = pgTable('markets', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  code: char('code', { length: 2 }).notNull().unique(),
  slug: text('slug').notNull().unique(),
  status: marketStatus('status').notNull().default('draft'),
  nameKey: text('name_key').notNull(),
  launchRegionKey: text('launch_region_key').notNull(),
  currencyCode: char('currency_code', { length: 3 }).notNull(),
  currencyMinorUnit: smallint('currency_minor_unit').notNull(),
  currencyDisplaySymbol: text('currency_display_symbol'),
  timezone: text('timezone').notNull(),
  phoneRegion: char('phone_region', { length: 2 }).notNull(),
  phoneCountryCode: text('phone_country_code').notNull(),
  formatLocale: text('format_locale').notNull(),
  uiLanguages: text('ui_languages').array().notNull(),
  dataRegion: text('data_region').notNull(),
  paymentProvider: text('payment_provider').notNull(),
  payoutProvider: text('payout_provider').notNull(),
  kycProvider: text('kyc_provider').notNull(),
  smsProvider: text('sms_provider').notNull(),
  mapsProvider: text('maps_provider').notNull(),
  geoCountries: text('geo_countries').array().notNull(),
  /** Q8: provider approval alone approves the Runner. Off by default (admin approval required). */
  kycAutoApprove: boolean('kyc_auto_approve').notNull().default(false),
  ...timestamps,
});

/** Worker rules per market (versioned; current row has effective_to = null). */
export const runnerRules = pgTable(
  'runner_rules',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    marketId: uuid('market_id').notNull().references(() => markets.id),
    pricingControl: pricingControl('pricing_control').notNull(),
    maxConcurrentErrands: integer('max_concurrent_errands').notNull(),
    acceptancePenaltyEnabled: boolean('acceptance_penalty_enabled').notNull().default(false),
    acceptanceRateThresholdBps: integer('acceptance_rate_threshold_bps'),
    acceptanceWindowDays: integer('acceptance_window_days'),
    requiredHoursPerWeek: integer('required_hours_per_week'),
    minAgeYears: integer('min_age_years').notNull(),
    requiredKycLevel: text('required_kyc_level').notNull(),
    extra: jsonb('extra').notNull().default({}),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
  },
  (t) => [uniqueIndex('runner_rules_one_current').on(t.marketId).where(sql`effective_to is null`)],
);

/**
 * Service areas. Boundary is a GeoJSON Polygon/MultiPolygon (portable; checked in app code and
 * unit-tested). `boundary_status = 'approximate'` marks placeholder circles until real boundaries are drawn.
 */
export const serviceAreas = pgTable(
  'service_areas',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    marketId: uuid('market_id').notNull().references(() => markets.id),
    slug: text('slug').notNull(),
    nameKey: text('name_key').notNull(),
    island: text('island'),
    active: boolean('active').notNull().default(true),
    sort: integer('sort').notNull().default(0),
    centerLat: numeric('center_lat', { precision: 9, scale: 6 }),
    centerLng: numeric('center_lng', { precision: 9, scale: 6 }),
    boundary: jsonb('boundary'),
    boundaryStatus: text('boundary_status').notNull().default('approximate'),
  },
  (t) => [uniqueIndex('service_areas_market_slug').on(t.marketId, t.slug)],
);

export const errandCategories = pgTable(
  'errand_categories',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    marketId: uuid('market_id').notNull().references(() => markets.id),
    key: text('key').notNull(),
    nameKey: text('name_key').notNull(),
    descriptionKey: text('description_key').notNull(),
    purchaseAllowed: boolean('purchase_allowed').notNull(),
    sort: integer('sort').notNull().default(0),
    active: boolean('active').notNull().default(true),
  },
  (t) => [uniqueIndex('errand_categories_market_key').on(t.marketId, t.key), index('errand_categories_market').on(t.marketId)],
);

/**
 * Fees and marketplace timers per market (versioned; current row has effective_to = null).
 * NULL means "not decided yet" — the app enforces nothing for that value.
 */
export const marketFeeSchedules = pgTable(
  'market_fee_schedules',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    marketId: uuid('market_id').notNull().references(() => markets.id),
    commissionBps: integer('commission_bps').notNull(),
    serviceFeeBps: integer('service_fee_bps'),
    serviceFeeFixedMinor: bigint('service_fee_fixed_minor', { mode: 'bigint' }),
    serviceFeeMinMinor: bigint('service_fee_min_minor', { mode: 'bigint' }),
    serviceFeeMaxMinor: bigint('service_fee_max_minor', { mode: 'bigint' }),
    cancellationFeeMinor: bigint('cancellation_fee_minor', { mode: 'bigint' }),
    minErrandPriceMinor: bigint('min_errand_price_minor', { mode: 'bigint' }),
    maxItemCostMinor: bigint('max_item_cost_minor', { mode: 'bigint' }),
    autoReleaseHours: integer('auto_release_hours').notNull(),
    reminderOffsetsHours: integer('reminder_offsets_hours').array().notNull(),
    unfundedOfferTimeoutMinutes: integer('unfunded_offer_timeout_minutes').notNull(),
    errandDefaultExpiryHours: integer('errand_default_expiry_hours').notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    createdBy: uuid('created_by'),
  },
  (t) => [uniqueIndex('market_fee_schedules_one_current').on(t.marketId).where(sql`effective_to is null`)],
);

/** Per-market prohibited items. Content needs legal input (docs/architecture/08 BOTH-7); seeded empty. */
export const prohibitedItems = pgTable(
  'prohibited_items',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    marketId: uuid('market_id').notNull().references(() => markets.id),
    label: text('label').notNull(),
    keywords: text('keywords').array().notNull(),
    action: prohibitedAction('action').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('prohibited_items_market').on(t.marketId)],
);
