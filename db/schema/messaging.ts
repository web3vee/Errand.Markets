import { index, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { conversationStatus, deliveryChannel, deliveryStatus, reportStatus } from './enums';
import { users } from './identity';
import { errands } from './marketplace';
import { markets } from './markets';

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** One thread per (errand, runner): supports questions before acceptance (Q10). */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey(),
    marketId: uuid('market_id').notNull().references(() => markets.id),
    errandId: uuid('errand_id').notNull().references(() => errands.id),
    customerId: uuid('customer_id').notNull().references(() => users.id),
    runnerId: uuid('runner_id').notNull().references(() => users.id),
    status: conversationStatus('status').notNull().default('open'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt,
  },
  (t) => [uniqueIndex('conversations_errand_runner').on(t.errandId, t.runnerId), index('conversations_customer').on(t.customerId), index('conversations_runner').on(t.runnerId)],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey(),
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id),
    senderId: uuid('sender_id').notNull().references(() => users.id),
    body: text('body').notNull(),
    mediaId: uuid('media_id'),
    createdAt,
  },
  (t) => [index('messages_conversation').on(t.conversationId, t.id)],
);

export const conversationReads = pgTable(
  'conversation_reads',
  {
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id),
    marketId: uuid('market_id').notNull().references(() => markets.id),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull().default({}),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt,
  },
  (t) => [index('notifications_user').on(t.userId, t.createdAt)],
);

export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').primaryKey(),
    notificationId: uuid('notification_id').notNull().references(() => notifications.id),
    channel: deliveryChannel('channel').notNull(),
    status: deliveryStatus('status').notNull().default('queued'),
    providerRef: text('provider_ref'),
    error: text('error'),
    createdAt,
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [index('notification_deliveries_notification').on(t.notificationId)],
);

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt,
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
});

export const blocks = pgTable(
  'blocks',
  {
    blockerId: uuid('blocker_id').notNull().references(() => users.id),
    blockedId: uuid('blocked_id').notNull().references(() => users.id),
    createdAt,
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] }), index('blocks_blocked').on(t.blockedId)],
);

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey(),
    marketId: uuid('market_id').notNull().references(() => markets.id),
    reporterId: uuid('reporter_id').notNull().references(() => users.id),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    reasonCode: text('reason_code').notNull(),
    details: text('details'),
    status: reportStatus('status').notNull().default('open'),
    assignedTo: uuid('assigned_to'),
    createdAt,
  },
  (t) => [index('reports_market_status').on(t.marketId, t.status)],
);
