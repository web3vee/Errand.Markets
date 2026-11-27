import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { asSystem, asUser, type Db, type JwtClaims } from '../../../db/client';
import { blocks, conversationReads, conversations, errands, media, messages, reports, runnerProfiles, users } from '../../../db/schema';
import { uuidv7 } from '@/lib/ids';
import { isBlockedEitherWay } from '../errands/service';

export class MessagingError extends Error {
  constructor(public readonly code: 'not_found' | 'not_allowed' | 'read_only' | 'blocked' | 'empty' | 'too_long' | 'not_verified') { super(code); }
}
export const MESSAGE_MAX = 2000;

/** A verified Runner asks about an OPEN errand (Q10). Idempotent: returns the existing thread. */
export async function startQuestionThread(db: Db, runnerId: string, errandId: string) {
  return asSystem(db, 'messaging.startQuestionThread (runner verified here)', async (tx) => {
    const [e] = await tx.select().from(errands).where(eq(errands.id, errandId));
    const [rp] = await tx.select({ kyc: runnerProfiles.kycStatus, marketId: runnerProfiles.marketId }).from(runnerProfiles).where(eq(runnerProfiles.userId, runnerId));
    if (!e) throw new MessagingError('not_found');
    const [existing] = await tx.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.errandId, errandId), eq(conversations.runnerId, runnerId)));
    if (existing) return existing.id;
    if (e.status !== 'open' || e.customerId === runnerId) throw new MessagingError('not_allowed');
    if (rp?.kyc !== 'approved' || rp.marketId !== e.marketId) throw new MessagingError('not_verified');
    if (await isBlockedEitherWay(tx, runnerId, e.customerId)) throw new MessagingError('blocked');
    const id = uuidv7();
    await tx.insert(conversations).values({ id, marketId: e.marketId, errandId, customerId: e.customerId, runnerId }).onConflictDoNothing();
    const [c] = await tx.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.errandId, errandId), eq(conversations.runnerId, runnerId)));
    return c!.id;
  });
}

/** Send a message. Returns the recipient so the caller can notify them. */
export async function sendMessage(db: Db, senderId: string, conversationId: string, body: string, mediaId: string | null = null) {
  const text = body.trim();
  if (!text && !mediaId) throw new MessagingError('empty');
  if (text.length > MESSAGE_MAX) throw new MessagingError('too_long');
  return asSystem(db, 'messaging.send (participant checked here)', async (tx) => {
    const [c] = await tx.select().from(conversations).where(eq(conversations.id, conversationId));
    if (!c || (c.customerId !== senderId && c.runnerId !== senderId)) throw new MessagingError('not_found');
    if (c.status !== 'open') throw new MessagingError('read_only');
    const recipientId = c.customerId === senderId ? c.runnerId : c.customerId;
    if (await isBlockedEitherWay(tx, senderId, recipientId)) throw new MessagingError('blocked');
    if (mediaId) {
      const att = await tx.update(media).set({ conversationId }).where(and(eq(media.id, mediaId), eq(media.ownerId, senderId), eq(media.kind, 'message_photo'), isNull(media.conversationId))).returning({ id: media.id });
      if (!att.length) throw new MessagingError('not_allowed');
    }
    const id = uuidv7();
    const now = new Date();
    await tx.insert(messages).values({ id, conversationId, senderId, body: text, mediaId, createdAt: now });
    await tx.update(conversations).set({ lastMessageAt: now }).where(eq(conversations.id, conversationId));
    await tx.insert(conversationReads).values({ conversationId, userId: senderId, lastReadAt: now })
      .onConflictDoUpdate({ target: [conversationReads.conversationId, conversationReads.userId], set: { lastReadAt: now } });
    return { messageId: id, recipientId, marketId: c.marketId, errandId: c.errandId };
  });
}

/** Inbox for the signed-in user (RLS). */
export async function listConversations(db: Db, claims: JwtClaims) {
  return asUser(db, claims, async (tx) => {
    const rows = await tx.select({
      id: conversations.id, errandId: conversations.errandId, errandTitle: errands.title, customerId: conversations.customerId, runnerId: conversations.runnerId,
      status: conversations.status, lastMessageAt: conversations.lastMessageAt,
    }).from(conversations).innerJoin(errands, eq(errands.id, conversations.errandId))
      .where(or(eq(conversations.customerId, claims.sub), eq(conversations.runnerId, claims.sub)))
      .orderBy(sql`${conversations.lastMessageAt} desc nulls last`).limit(100);
    if (!rows.length) return [];
    const reads = await tx.select().from(conversationReads).where(and(eq(conversationReads.userId, claims.sub), inArray(conversationReads.conversationId, rows.map((r) => r.id))));
    return rows.map((r) => {
      const readAt = reads.find((x) => x.conversationId === r.id)?.lastReadAt;
      return { ...r, unread: !!r.lastMessageAt && (!readAt || readAt < r.lastMessageAt) };
    });
  });
}

/** Thread + messages (newest page, or those after a cursor for polling). Marks as read. */
export async function getThread(db: Db, claims: JwtClaims, conversationId: string, opts: { afterId?: string | null; beforeId?: string | null; limit?: number } = {}) {
  const thread = await asUser(db, claims, async (tx) => {
    const [c] = await tx.select().from(conversations).where(eq(conversations.id, conversationId));
    if (!c) return null;
    const conds = [eq(messages.conversationId, conversationId)];
    if (opts.afterId) conds.push(gt(messages.id, opts.afterId));
    if (opts.beforeId) conds.push(lt(messages.id, opts.beforeId));
    const limit = Math.min(opts.limit ?? 50, 100);
    const rows = opts.afterId
      ? await tx.select().from(messages).where(and(...conds)).orderBy(asc(messages.id)).limit(limit)
      : (await tx.select().from(messages).where(and(...conds)).orderBy(desc(messages.id)).limit(limit)).reverse();
    return { conversation: c, messages: rows };
  });
  if (!thread) return null;
  const c = thread.conversation;
  if (c.customerId === claims.sub || c.runnerId === claims.sub) {
    await asSystem(db, 'messaging.markRead (participant)', (tx) => tx.insert(conversationReads).values({ conversationId, userId: claims.sub, lastReadAt: new Date() })
      .onConflictDoUpdate({ target: [conversationReads.conversationId, conversationReads.userId], set: { lastReadAt: new Date() } }));
  }
  return thread;
}

export async function participantNames(db: Db, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await asSystem(db, 'messaging.names (display names only)', (tx) => tx.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, ids)));
  return new Map(rows.map((r) => [r.id, r.name ?? '—']));
}

// ── Trust & safety ───────────────────────────────────────────────────────────
export async function blockUser(db: Db, blockerId: string, blockedId: string) {
  if (blockerId === blockedId) throw new MessagingError('not_allowed');
  await asSystem(db, 'trust.block (self-service)', (tx) => tx.insert(blocks).values({ blockerId, blockedId }).onConflictDoNothing());
}
export async function unblockUser(db: Db, blockerId: string, blockedId: string) {
  await asSystem(db, 'trust.unblock (self-service)', (tx) => tx.delete(blocks).where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId))));
}
export const REPORT_REASONS = ['harassment', 'scam', 'prohibited_item', 'unsafe', 'no_show', 'other'] as const;
export async function reportUser(db: Db, input: { reporterId: string; marketId: string; subjectType: 'user' | 'errand' | 'message'; subjectId: string; reasonCode: (typeof REPORT_REASONS)[number]; details: string | null }) {
  await asSystem(db, 'trust.report (self-service)', (tx) => tx.insert(reports).values({ id: uuidv7(), ...input }));
}
export async function hasBlocked(db: Db, blockerId: string, blockedId: string) {
  const r = await asSystem(db, 'trust.hasBlocked', (tx) => tx.select().from(blocks).where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId))));
  return r.length > 0;
}

/** Threads on one errand visible to the caller (RLS), with unread flags. */
export async function listErrandConversations(db: Db, claims: JwtClaims, errandId: string) {
  return (await listConversations(db, claims)).filter((c) => c.errandId === errandId);
}
