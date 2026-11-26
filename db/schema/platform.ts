import { sql } from 'drizzle-orm';
import { bigserial, boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { webhookStatus } from './enums';
import { markets } from './markets';

/** Every inbound provider webhook, deduplicated by (provider, event_id). */
export const providerWebhookEvents = pgTable(
  'provider_webhook_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    provider: text('provider').notNull(),
    marketId: uuid('market_id').references(() => markets.id),
    eventId: text('event_id').notNull(),
    eventType: text('event_type').notNull(),
    signatureValid: boolean('signature_valid').notNull(),
    payload: jsonb('payload').notNull(),
    status: webhookStatus('status').notNull().default('received'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('provider_webhook_events_dedupe').on(t.provider, t.eventId)],
);

/** Fixed-window counters for rate limiting (OTP sends, verifies, etc.). */
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

/** SANDBOX ONLY: messages the sandbox SMS adapter "sent". Never written in live mode. */
export const sandboxOutbox = pgTable(
  'sandbox_outbox',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    channel: text('channel').notNull(),
    toAddress: text('to_address').notNull(),
    body: text('body').notNull(),
    marketCode: text('market_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sandbox_outbox_to').on(t.toAddress, t.createdAt)],
);

/** Append-only log of admin actions. */
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorId: uuid('actor_id').notNull(),
    marketId: uuid('market_id').references(() => markets.id),
    action: text('action').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    data: jsonb('data').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('admin_audit_market_time').on(t.marketId, t.createdAt)],
);
