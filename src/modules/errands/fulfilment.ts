/**
 * Stage 5: fulfilment — from "Runner accepted" to "confirmed", plus disputes, cancellation and ratings.
 * Every transition locks the errand row (SELECT … FOR UPDATE) and re-checks its status, so a customer
 * confirming at the same moment as the auto-release job can't both succeed. The Postgres trigger
 * app.errand_transition_allowed rejects anything outside the state machine.
 *
 * Money (escrow, refunds, payouts, item reconciliation) is Stage 6. Until then, the only way to reach
 * `funded` is the SANDBOX payment, which callers must allow only in sandbox provider mode.
 */
import { and, asc, desc, eq, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import { asSystem, asUser, type Db, type JwtClaims, type Tx } from '../../../db/client';
import { conversations, disputes, errands, marketFeeSchedules, media, offers, ratings } from '../../../db/schema';
import { uuidv7 } from '@/lib/ids';
import {
  CANCELLABLE_BY_CUSTOMER, checkComplete, DISPUTABLE_STATUSES, DISPUTE_REASONS, partyOf, ratingWindowOpen, remindersDue, type DisputeReason, type Party,
} from './domain/fulfilment';
import { ErrandError, marketplaceConfig, recordEvent } from './service';

type ErrandRow = typeof errands.$inferSelect;

async function lock(tx: Tx, errandId: string): Promise<ErrandRow> {
  const [e] = await tx.select().from(errands).where(eq(errands.id, errandId)).for('update');
  if (!e) throw new ErrandError('not_found');
  return e;
}
function requireStatus(e: ErrandRow, ...allowed: ErrandRow['status'][]) {
  if (!allowed.includes(e.status)) throw new ErrandError('wrong_status', { status: e.status });
}
const summary = (e: ErrandRow) => ({ errandId: e.id, marketId: e.marketId, customerId: e.customerId, runnerId: e.runnerId, title: e.title });

async function feeScheduleOf(tx: Tx, e: ErrandRow) {
  if (e.feeScheduleId) {
    const [f] = await tx.select().from(marketFeeSchedules).where(eq(marketFeeSchedules.id, e.feeScheduleId));
    if (f) return f;
  }
  return (await marketplaceConfig(tx, e.marketId)).fees;
}

// ── Payment (sandbox stand-in until Stage 6) ─────────────────────────────────
/** SANDBOX ONLY: the customer "pays" → funded. Unlocks exact locations for the Runner (RLS). */
export async function sandboxPay(db: Db, customerId: string, errandId: string, opts: { sandbox: boolean }, now = new Date()) {
  if (!opts.sandbox) throw new ErrandError('payments_unavailable');
  return asSystem(db, 'fulfilment.sandboxPay (owner checked, sandbox only)', async (tx) => {
    const e = await lock(tx, errandId);
    if (e.customerId !== customerId) throw new ErrandError('not_found');
    requireStatus(e, 'offer_accepted');
    await tx.update(errands).set({ status: 'funded', fundedAt: now, version: e.version + 1 }).where(eq(errands.id, e.id));
    await recordEvent(tx, e.id, 'offer_accepted', 'funded', 'payment_confirmed', 'provider', null, { provider: 'sandbox' });
    return summary(e);
  });
}

// ── Runner: start, complete ──────────────────────────────────────────────────
export async function startErrand(db: Db, runnerId: string, errandId: string, now = new Date()) {
  return asSystem(db, 'fulfilment.start (assigned runner checked)', async (tx) => {
    const e = await lock(tx, errandId);
    if (e.runnerId !== runnerId) throw new ErrandError('not_found');
    requireStatus(e, 'funded');
    await tx.update(errands).set({ status: 'in_progress', startedAt: now, version: e.version + 1 }).where(eq(errands.id, e.id));
    await recordEvent(tx, e.id, 'funded', 'in_progress', 'started', 'runner', runnerId);
    return summary(e);
  });
}

/**
 * Runner marks the errand done: attaches their proof (and receipt) photos, records what they spent on
 * items, and starts the auto-release clock. Photos must be the Runner's own, unattached uploads.
 */
export async function completeErrand(db: Db, runnerId: string, errandId: string,
  input: { proofMediaIds: string[]; receiptMediaIds: string[]; itemActualMinor: bigint | null }, now = new Date()) {
  return asSystem(db, 'fulfilment.complete (assigned runner checked)', async (tx) => {
    const e = await lock(tx, errandId);
    if (e.runnerId !== runnerId) throw new ErrandError('not_found');
    requireStatus(e, 'in_progress');
    const attach = async (ids: string[], kind: 'proof' | 'receipt') => ids.length
      ? (await tx.update(media).set({ errandId: e.id })
        .where(and(inArray(media.id, [...new Set(ids)]), eq(media.ownerId, runnerId), eq(media.kind, kind), isNull(media.errandId), eq(media.marketId, e.marketId)))
        .returning({ id: media.id })).length
      : 0;
    const proofCount = await attach(input.proofMediaIds, 'proof');
    const receiptCount = e.requiresPurchase ? await attach(input.receiptMediaIds, 'receipt') : 0;
    const check = checkComplete({ requiresPurchase: e.requiresPurchase, proofCount, receiptCount, itemActualMinor: input.itemActualMinor });
    if (!check.ok) throw new ErrandError(check.reason); // rolls back the attachments too
    const fees = await feeScheduleOf(tx, e);
    const autoReleaseAt = new Date(now.getTime() + fees.autoReleaseHours * 3_600_000);
    const itemActualMinor = e.requiresPurchase ? input.itemActualMinor : null;
    await tx.update(errands).set({ status: 'completed_pending_confirmation', completedAt: now, autoReleaseAt, itemActualMinor, remindersSent: 0, version: e.version + 1 })
      .where(eq(errands.id, e.id));
    await recordEvent(tx, e.id, 'in_progress', 'completed_pending_confirmation', 'completed', 'runner', runnerId, {
      proofs: proofCount, receipts: receiptCount, ...(itemActualMinor !== null ? { itemActualMinor: itemActualMinor.toString(), itemEstimateMinor: e.itemEstimateMinor.toString() } : {}),
    });
    return { ...summary(e), autoReleaseAt };
  });
}

// ── Customer: confirm; system: auto-release + reminders ──────────────────────
export async function confirmErrand(db: Db, customerId: string, errandId: string, now = new Date()) {
  return asSystem(db, 'fulfilment.confirm (owner checked)', async (tx) => {
    const e = await lock(tx, errandId);
    if (e.customerId !== customerId) throw new ErrandError('not_found');
    requireStatus(e, 'completed_pending_confirmation');
    await tx.update(errands).set({ status: 'confirmed', confirmedAt: now, autoReleaseAt: null, version: e.version + 1 }).where(eq(errands.id, e.id));
    await recordEvent(tx, e.id, 'completed_pending_confirmation', 'confirmed', 'confirmed', 'customer', customerId);
    return summary(e);
  });
}

/** Sweeper: confirm errands whose auto-release time has passed (re-checked under the row lock). */
export async function autoReleaseDue(db: Db, now = new Date()) {
  return asSystem(db, 'fulfilment.autoRelease sweeper', async (tx) => {
    const due = await tx.select({ id: errands.id }).from(errands)
      .where(and(eq(errands.status, 'completed_pending_confirmation'), lte(errands.autoReleaseAt, now))).for('update', { skipLocked: true });
    const out = [];
    for (const { id } of due) {
      const e = await lock(tx, id);
      if (e.status !== 'completed_pending_confirmation' || !e.autoReleaseAt || e.autoReleaseAt > now) continue;
      await tx.update(errands).set({ status: 'confirmed', confirmedAt: now, autoReleaseAt: null, version: e.version + 1 }).where(eq(errands.id, e.id));
      await recordEvent(tx, e.id, 'completed_pending_confirmation', 'confirmed', 'auto_released', 'system', null);
      out.push(summary(e));
    }
    return out;
  });
}

/** Sweeper: "please confirm" reminders at the fee schedule's offsets (each offset sent once). */
export async function confirmRemindersDue(db: Db, now = new Date()) {
  return asSystem(db, 'fulfilment.reminders sweeper', async (tx) => {
    const rows = await tx.select({ e: errands, offsets: marketFeeSchedules.reminderOffsetsHours }).from(errands)
      .innerJoin(marketFeeSchedules, eq(marketFeeSchedules.id, errands.feeScheduleId))
      .where(eq(errands.status, 'completed_pending_confirmation')).for('update', { of: errands, skipLocked: true });
    const out = [];
    for (const { e, offsets } of rows) {
      if (!e.completedAt) continue;
      const next = remindersDue({ completedAt: e.completedAt, autoReleaseAt: e.autoReleaseAt, offsetsHours: offsets, sent: e.remindersSent, now });
      if (next === null) continue;
      await tx.update(errands).set({ remindersSent: next }).where(eq(errands.id, e.id));
      await recordEvent(tx, e.id, e.status, e.status, 'confirm_reminder', 'system', null, { reminder: next });
      out.push({ ...summary(e), autoReleaseAt: e.autoReleaseAt });
    }
    return out;
  });
}

// ── Cancel / withdraw before payment (free; paid cancellations need Stage 6) ──
export async function cancelByCustomer(db: Db, customerId: string, errandId: string, reasonCode: string | null, now = new Date()) {
  return asSystem(db, 'fulfilment.cancel (owner checked)', async (tx) => {
    const e = await lock(tx, errandId);
    if (e.customerId !== customerId) throw new ErrandError('not_found');
    if (!CANCELLABLE_BY_CUSTOMER.includes(e.status)) throw new ErrandError(DISPUTABLE_STATUSES.includes(e.status) ? 'cancel_after_payment' : 'wrong_status', { status: e.status });
    await tx.update(errands).set({ status: 'cancelled', cancelledAt: now, cancelledBy: customerId, cancelReasonCode: reasonCode ?? 'customer_cancelled', autoReleaseAt: null, version: e.version + 1 })
      .where(eq(errands.id, e.id));
    await recordEvent(tx, e.id, e.status, 'cancelled', 'cancelled', 'customer', customerId, { reason: reasonCode });
    await tx.update(conversations).set({ status: 'read_only' }).where(eq(conversations.errandId, e.id));
    return { ...summary(e), wasAccepted: e.status === 'offer_accepted' };
  });
}

/** The assigned Runner backs out before payment: the errand goes back to `open` for other Runners. */
export async function withdrawByRunner(db: Db, runnerId: string, errandId: string) {
  return asSystem(db, 'fulfilment.withdraw (assigned runner checked)', async (tx) => {
    const e = await lock(tx, errandId);
    if (e.runnerId !== runnerId) throw new ErrandError('not_found');
    requireStatus(e, 'offer_accepted');
    if (e.acceptedOfferId) await tx.update(offers).set({ status: 'withdrawn' }).where(eq(offers.id, e.acceptedOfferId));
    await tx.update(errands).set({ status: 'open', runnerId: null, acceptedOfferId: null, acceptedAt: null, version: e.version + 1 }).where(eq(errands.id, e.id));
    await recordEvent(tx, e.id, 'offer_accepted', 'open', 'runner_withdrew', 'runner', runnerId);
    // Other Runners' question threads reopen; the withdrawing Runner's thread closes.
    await tx.update(conversations).set({ status: 'open' }).where(and(eq(conversations.errandId, e.id), ne(conversations.runnerId, runnerId)));
    await tx.update(conversations).set({ status: 'read_only' }).where(and(eq(conversations.errandId, e.id), eq(conversations.runnerId, runnerId)));
    return summary(e);
  });
}

// ── Disputes ─────────────────────────────────────────────────────────────────
export async function raiseDispute(db: Db, userId: string, errandId: string, input: { reasonCode: string; details: string | null }) {
  if (!DISPUTE_REASONS.includes(input.reasonCode as DisputeReason)) throw new ErrandError('invalid_reason');
  const details = input.details?.trim().slice(0, 1000) || null;
  return asSystem(db, 'fulfilment.dispute (participant checked)', async (tx) => {
    const e = await lock(tx, errandId);
    const role = partyOf(e, userId);
    if (!role) throw new ErrandError('not_found');
    requireStatus(e, ...DISPUTABLE_STATUSES);
    const id = uuidv7();
    await tx.insert(disputes).values({ id, marketId: e.marketId, errandId: e.id, raisedBy: userId, raisedRole: role, fromStatus: e.status, reasonCode: input.reasonCode, details });
    // Freeze: no auto-release while an admin looks at it. Funds (Stage 6) stay where they are.
    await tx.update(errands).set({ status: 'disputed', autoReleaseAt: null, version: e.version + 1 }).where(eq(errands.id, e.id));
    await recordEvent(tx, e.id, e.status, 'disputed', 'dispute_raised', role, userId, { disputeId: id, reason: input.reasonCode });
    return { ...summary(e), disputeId: id, raisedRole: role };
  });
}

export type DisputeOutcome = 'release_runner' | 'refund_customer';

/** Admin (support permission, market scope) settles a dispute: release to the Runner → confirmed, or refund → refunded. */
export async function resolveDispute(db: Db, input: { adminId: string; adminScope: 'all' | string[]; disputeId: string; outcome: DisputeOutcome; note: string | null }, now = new Date()) {
  if (input.outcome !== 'release_runner' && input.outcome !== 'refund_customer') throw new ErrandError('invalid_outcome');
  return asSystem(db, 'fulfilment.resolveDispute (admin, scope checked)', async (tx) => {
    const [d] = await tx.select().from(disputes).where(eq(disputes.id, input.disputeId)).for('update');
    if (!d) throw new ErrandError('not_found');
    if (input.adminScope !== 'all' && !input.adminScope.includes(d.marketId)) throw new ErrandError('out_of_scope');
    if (d.status !== 'open') throw new ErrandError('already_resolved');
    const e = await lock(tx, d.errandId);
    requireStatus(e, 'disputed');
    const note = input.note?.trim().slice(0, 1000) || null;
    await tx.update(disputes).set({ status: 'resolved', outcome: input.outcome, resolvedBy: input.adminId, resolvedAt: now, resolutionNote: note }).where(eq(disputes.id, d.id));
    const to = input.outcome === 'release_runner' ? 'confirmed' : 'refunded';
    await tx.update(errands).set({ status: to, ...(to === 'confirmed' ? { confirmedAt: now } : {}), version: e.version + 1 }).where(eq(errands.id, e.id));
    await recordEvent(tx, e.id, 'disputed', to, 'dispute_resolved', 'admin', input.adminId, { disputeId: d.id, outcome: input.outcome });
    await tx.execute(sql`insert into admin_audit_log (actor_id, market_id, action, subject_type, subject_id, data)
      values (${input.adminId}, ${e.marketId}, ${'dispute.' + input.outcome}, 'dispute', ${d.id}, ${JSON.stringify({ errandId: e.id, note })}::jsonb)`);
    return { ...summary(e), outcome: input.outcome, raisedBy: d.raisedBy };
  });
}

/** Disputes visible to an admin (RLS: ops/support in their markets), newest first. */
export async function listDisputes(db: Db, claims: JwtClaims, opts: { status: 'open' | 'resolved' | 'all'; marketIds: 'all' | string[] }) {
  return asUser(db, claims, async (tx) => {
    const conds = [];
    if (opts.status !== 'all') conds.push(eq(disputes.status, opts.status));
    if (opts.marketIds !== 'all') {
      if (!opts.marketIds.length) return [];
      conds.push(inArray(disputes.marketId, opts.marketIds));
    }
    return tx.select({ d: disputes, title: errands.title, errandStatus: errands.status, customerId: errands.customerId, runnerId: errands.runnerId })
      .from(disputes).innerJoin(errands, eq(errands.id, disputes.errandId))
      .where(conds.length ? and(...conds) : undefined).orderBy(desc(disputes.createdAt)).limit(200);
  });
}

export async function getDispute(db: Db, claims: JwtClaims, disputeId: string) {
  const [row] = await asUser(db, claims, (tx) => tx.select().from(disputes).where(eq(disputes.id, disputeId)));
  return row ?? null;
}

// ── Ratings ──────────────────────────────────────────────────────────────────
export async function rateErrand(db: Db, raterId: string, errandId: string, input: { stars: number; comment: string | null }, now = new Date()) {
  if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) throw new ErrandError('invalid_stars');
  const comment = input.comment?.trim().slice(0, 500) || null;
  return asSystem(db, 'fulfilment.rate (participant checked)', async (tx) => {
    const e = await lock(tx, errandId);
    const role: Party | null = partyOf(e, raterId);
    if (!role || !e.runnerId) throw new ErrandError('not_found');
    requireStatus(e, 'confirmed', 'paid_out');
    if (!ratingWindowOpen(e.confirmedAt, now)) throw new ErrandError('rating_closed');
    const rateeId = role === 'customer' ? e.runnerId : e.customerId;
    const inserted = await tx.insert(ratings).values({ id: uuidv7(), marketId: e.marketId, errandId: e.id, raterId, rateeId, raterRole: role, stars: input.stars, comment })
      .onConflictDoNothing().returning({ id: ratings.id });
    if (!inserted.length) throw new ErrandError('already_rated');
    return { ...summary(e), rateeId, raterRole: role };
  });
}

/** Ratings on one errand as this viewer may see them (RLS hides the other side's until revealed). */
export async function ratingsForErrand(db: Db, claims: JwtClaims, errandId: string) {
  return asUser(db, claims, (tx) => tx.select().from(ratings).where(eq(ratings.errandId, errandId)).orderBy(asc(ratings.createdAt)));
}

/** Public reputation: average of REVEALED ratings received (blind ones don't count until revealed). */
export async function ratingSummary(db: Db, userIds: string[]) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map<string, { avg: number; count: number }>();
  const rows = await asSystem(db, 'fulfilment.ratingSummary (revealed only)', (tx) => tx.select({
    userId: ratings.rateeId, avg: sql<string>`avg(${ratings.stars})`, count: sql<number>`count(*)::int`,
  }).from(ratings).where(and(inArray(ratings.rateeId, ids), sql`app.rating_revealed(${ratings.id})`)).groupBy(ratings.rateeId));
  return new Map(rows.map((r) => [r.userId, { avg: Math.round(Number(r.avg) * 10) / 10, count: r.count }]));
}

/** Proof and receipt photos on an errand (RLS: participants and admins). */
export async function fulfilmentMedia(db: Db, claims: JwtClaims, errandId: string) {
  return asUser(db, claims, (tx) => tx.select({ id: media.id, kind: media.kind, width: media.width, height: media.height }).from(media)
    .where(and(eq(media.errandId, errandId), inArray(media.kind, ['proof', 'receipt']))).orderBy(asc(media.createdAt)));
}

/** The latest dispute on an errand (RLS: participants and admins). */
export async function latestDispute(db: Db, claims: JwtClaims, errandId: string) {
  const [d] = await asUser(db, claims, (tx) => tx.select().from(disputes).where(eq(disputes.errandId, errandId)).orderBy(desc(disputes.createdAt)).limit(1));
  return d ?? null;
}

/** Whether someone has rated this errand — existence only, never the content (used for "rate them to see it"). */
export async function hasRated(db: Db, errandId: string, raterId: string) {
  const rows = await asSystem(db, 'fulfilment.hasRated (existence only)', (tx) => tx.select({ id: ratings.id }).from(ratings)
    .where(and(eq(ratings.errandId, errandId), eq(ratings.raterId, raterId))).limit(1));
  return rows.length > 0;
}
