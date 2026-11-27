import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { asSystem, asUser, type Db, type JwtClaims } from '../../../db/client';
import { notificationDeliveries, notifications, pushSubscriptions } from '../../../db/schema';
import { uuidv7 } from '@/lib/ids';

/**
 * Notification types and default channels. In-app is always recorded; push goes to every
 * subscribed device; SMS only for events where missing it costs someone money or a job.
 */
export const NOTIFICATION_TYPES = {
  errand_nearby: { push: true, sms: false },
  errand_accepted: { push: true, sms: true },
  errand_taken: { push: false, sms: false },
  errand_expired: { push: true, sms: false },
  errand_review_cleared: { push: true, sms: false },
  errand_review_rejected: { push: true, sms: true },
  new_message: { push: true, sms: false },
  kyc_approved: { push: true, sms: true },
  kyc_rejected: { push: true, sms: true },
  kyc_resubmission: { push: true, sms: true },
} as const;
export type NotificationType = keyof typeof NOTIFICATION_TYPES;

/**
 * Record notifications and queue deliveries; returns delivery ids for the job runner.
 * `coalesceKey`: skip users who already have an UNREAD notification with the same key
 * (e.g. one "new messages" alert per conversation, not one per message).
 */
export async function notify(db: Db, input: { userIds: string[]; marketId: string; type: NotificationType; payload: Record<string, unknown>; coalesceKey?: string }) {
  const ids = [...new Set(input.userIds)];
  if (!ids.length) return [];
  return asSystem(db, `notifications.notify ${input.type}`, async (tx) => {
    let targets = ids;
    if (input.coalesceKey) {
      const existing = await tx.select({ userId: notifications.userId }).from(notifications)
        .where(and(inArray(notifications.userId, ids), eq(notifications.type, input.type), isNull(notifications.readAt), sql`${notifications.payload}->>'coalesceKey' = ${input.coalesceKey}`));
      const skip = new Set(existing.map((e) => e.userId));
      targets = ids.filter((id) => !skip.has(id));
    }
    if (!targets.length) return [];
    const ch = NOTIFICATION_TYPES[input.type];
    const rows = targets.map((userId) => ({ id: uuidv7(), userId, marketId: input.marketId, type: input.type, payload: { ...input.payload, coalesceKey: input.coalesceKey ?? null } }));
    await tx.insert(notifications).values(rows);
    const deliveries = rows.flatMap((n) => [
      ...(ch.push ? [{ id: uuidv7(), notificationId: n.id, channel: 'push' as const }] : []),
      ...(ch.sms ? [{ id: uuidv7(), notificationId: n.id, channel: 'sms' as const }] : []),
    ]);
    if (deliveries.length) await tx.insert(notificationDeliveries).values(deliveries);
    return deliveries.map((d) => d.id);
  });
}

export async function listNotifications(db: Db, claims: JwtClaims, limit = 50) {
  return asUser(db, claims, (tx) => tx.select().from(notifications).where(eq(notifications.userId, claims.sub)).orderBy(desc(notifications.createdAt)).limit(limit));
}
export async function unreadCount(db: Db, claims: JwtClaims) {
  const [r] = await asUser(db, claims, (tx) => tx.select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, claims.sub), isNull(notifications.readAt))));
  return r?.n ?? 0;
}
/** Runs as the user: RLS + column grant allow only read_at on their own rows. */
export async function markAllRead(db: Db, claims: JwtClaims) {
  await asUser(db, claims, (tx) => tx.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, claims.sub), isNull(notifications.readAt))));
}
export async function markReadByKey(db: Db, claims: JwtClaims, coalesceKey: string) {
  await asUser(db, claims, (tx) => tx.update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.userId, claims.sub), isNull(notifications.readAt), sql`${notifications.payload}->>'coalesceKey' = ${coalesceKey}`)));
}

export async function savePushSubscription(db: Db, userId: string, sub: { endpoint: string; p256dh: string; auth: string; userAgent: string | null }) {
  await asSystem(db, 'push.subscribe (self-service)', (tx) => tx.insert(pushSubscriptions).values({ id: uuidv7(), userId, ...sub })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh: sub.p256dh, auth: sub.auth, userAgent: sub.userAgent } }));
}
export async function deletePushSubscription(db: Db, claims: JwtClaims, endpoint: string) {
  await asUser(db, claims, (tx) => tx.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, claims.sub), eq(pushSubscriptions.endpoint, endpoint))));
}
