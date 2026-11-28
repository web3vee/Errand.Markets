import { and, eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { asUser } from '../../db/client';
import { disputes, errandEvents, errands, media, offers, places, ratings, runnerProfiles, serviceAreas } from '../../db/schema';
import { becomeRunner, updateRunnerProfile } from '@/modules/identity/service';
import { acceptErrand, createErrand, type CreateErrandInput } from '@/modules/errands/service';
import {
  autoReleaseDue, cancelByCustomer, completeErrand, confirmErrand, confirmRemindersDue, fulfilmentMedia, hasRated, raiseDispute, ratingsForErrand,
  ratingSummary, rateErrand, resolveDispute, sandboxPay, startErrand, withdrawByRunner,
} from '@/modules/errands/fulfilment';
import { storeImage } from '@/modules/media/service';
import { LocalObjectStore } from '@/providers/storage/local';
import { db, expectDbError, makeAdmin, makeUser, market } from './helpers';

const H = 3_600_000;
const dir = `/tmp/claude-0/em-test-fulfil-${process.pid}`;
const store = new LocalObjectStore(dir);
afterAll(async () => { await import('node:fs/promises').then((fs) => fs.rm(dir, { recursive: true, force: true })); });

type Code = 'NG' | 'VC';
const areaSlug = (code: Code) => (code === 'NG' ? 'wuse-2' : 'kingstown');
async function areaOf(code: Code) {
  const m = await market(code);
  const [a] = await db().select().from(serviceAreas).where(and(eq(serviceAreas.marketId, m.id), eq(serviceAreas.slug, areaSlug(code))));
  return a!;
}
async function verifiedRunner(code: Code, name = 'Runner') {
  const u = await makeUser(code, name);
  await becomeRunner(db(), u.id);
  await updateRunnerProfile(db(), u.claims, { bio: null, vehicle: 'none', emergencyContactName: null, emergencyContactPhone: null, serviceAreaIds: [(await areaOf(code)).id] });
  await db().update(runnerProfiles).set({ kycStatus: 'approved', kycApprovedAt: new Date() }).where(eq(runnerProfiles.userId, u.id));
  return u;
}
async function photo(ownerId: string, code: Code, kind: 'proof' | 'receipt') {
  const png = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#4a7' } }).png().toBuffer();
  return (await storeImage(db(), store, { ownerId, marketId: (await market(code)).id, marketCode: code, kind, bytes: new Uint8Array(png) })).id;
}
async function post(code: Code, customerId: string, over: Partial<CreateErrandInput> = {}) {
  const m = await market(code);
  const area = await areaOf(code);
  return createErrand(db(), {
    customerId, marketId: m.id, categoryKey: 'delivery', title: 'Deliver a parcel', description: 'Small box', priceMinor: 250000n,
    requiresPurchase: false, items: [], windowKind: 'asap', windowEnd: null, mediaIds: [], publish: true,
    stops: [{ kind: 'dropoff', serviceAreaId: area.id, lat: null, lng: null, pinSource: 'area_center', landmark: 'Blue gate opposite the bank', contactName: 'Ada', contactPhoneE164: null, instructions: null }],
    ...over,
  });
}
const status = async (id: string) => (await db().select({ s: errands.status }).from(errands).where(eq(errands.id, id)))[0]!.s;

/** Customer + Runner with an errand at the given stage. */
async function errandAt(code: Code, stage: 'accepted' | 'funded' | 'in_progress' | 'completed' | 'confirmed', over: Partial<CreateErrandInput> = {}) {
  const customer = await makeUser(code, 'Cora');
  const runner = await verifiedRunner(code, 'Rita');
  const { errandId } = await post(code, customer.id, over);
  await acceptErrand(db(), runner.id, errandId, over.priceMinor ?? 250000n);
  if (stage !== 'accepted') await sandboxPay(db(), customer.id, errandId, { sandbox: true });
  if (stage === 'in_progress' || stage === 'completed' || stage === 'confirmed') await startErrand(db(), runner.id, errandId);
  if (stage === 'completed' || stage === 'confirmed') await completeErrand(db(), runner.id, errandId, { proofMediaIds: [await photo(runner.id, code, 'proof')], receiptMediaIds: [], itemActualMinor: null });
  if (stage === 'confirmed') await confirmErrand(db(), customer.id, errandId);
  return { customer, runner, errandId };
}

describe.each(['NG', 'VC'] as const)('fulfilment — %s', (code) => {
  it('pay (sandbox) → start → complete with proof + receipt → confirm; locations unlock only after payment', async () => {
    const customer = await makeUser(code, 'Cora');
    const runner = await verifiedRunner(code, 'Rita');
    const stranger = await makeUser(code, 'Sam');
    const { errandId } = await post(code, customer.id, { categoryKey: 'shopping', requiresPurchase: true, items: [{ name: 'Rice', qty: 2, estUnitPriceMinor: 4000n }] });
    await acceptErrand(db(), runner.id, errandId, 250000n);
    expect(await asUser(db(), runner.claims, (tx) => tx.select().from(places))).toEqual([]);

    // Payment: sandbox only, customer only.
    await expect(sandboxPay(db(), customer.id, errandId, { sandbox: false })).rejects.toMatchObject({ code: 'payments_unavailable' });
    await expect(sandboxPay(db(), runner.id, errandId, { sandbox: true })).rejects.toMatchObject({ code: 'not_found' });
    await sandboxPay(db(), customer.id, errandId, { sandbox: true });
    expect(await status(errandId)).toBe('funded');
    expect((await asUser(db(), runner.claims, (tx) => tx.select().from(places))).map((p) => p.landmark)).toContain('Blue gate opposite the bank');

    // Start: assigned Runner only.
    await expect(startErrand(db(), stranger.id, errandId)).rejects.toMatchObject({ code: 'not_found' });
    await startErrand(db(), runner.id, errandId);
    expect(await status(errandId)).toBe('in_progress');

    // Complete: proof + receipt + amount; someone else's photo doesn't count; a failed attempt attaches nothing.
    const proof = await photo(runner.id, code, 'proof');
    const receipt = await photo(runner.id, code, 'receipt');
    const strangersPhoto = await photo(stranger.id, code, 'proof');
    await expect(completeErrand(db(), runner.id, errandId, { proofMediaIds: [strangersPhoto], receiptMediaIds: [receipt], itemActualMinor: 9000n })).rejects.toMatchObject({ code: 'proof_required' });
    await expect(completeErrand(db(), runner.id, errandId, { proofMediaIds: [proof], receiptMediaIds: [], itemActualMinor: 9000n })).rejects.toMatchObject({ code: 'receipt_required' });
    await expect(completeErrand(db(), runner.id, errandId, { proofMediaIds: [proof], receiptMediaIds: [receipt], itemActualMinor: null })).rejects.toMatchObject({ code: 'amount_required' });
    expect((await db().select().from(media).where(eq(media.id, proof)))[0]!.errandId).toBeNull();
    const before = Date.now();
    const done = await completeErrand(db(), runner.id, errandId, { proofMediaIds: [proof], receiptMediaIds: [receipt], itemActualMinor: 9000n });
    const [e] = await db().select().from(errands).where(eq(errands.id, errandId));
    expect(e!.status).toBe('completed_pending_confirmation');
    expect(e!.itemActualMinor).toBe(9000n);
    expect(done.autoReleaseAt.getTime() - before).toBeGreaterThanOrEqual(24 * H - 5000); // fee schedule: 24h
    expect(done.autoReleaseAt.getTime() - before).toBeLessThan(24 * H + 5000);

    // Proof photos: customer and Runner see them (RLS); a stranger doesn't.
    expect((await fulfilmentMedia(db(), customer.claims, errandId)).map((p) => p.kind).sort()).toEqual(['proof', 'receipt']);
    expect(await fulfilmentMedia(db(), stranger.claims, errandId)).toEqual([]);

    await expect(confirmErrand(db(), runner.id, errandId)).rejects.toMatchObject({ code: 'not_found' });
    await confirmErrand(db(), customer.id, errandId);
    const [c] = await db().select().from(errands).where(eq(errands.id, errandId));
    expect(c!.status).toBe('confirmed');
    expect(c!.confirmedAt).toBeTruthy();
    expect(c!.autoReleaseAt).toBeNull();
    const evs = (await db().select({ ev: errandEvents.event }).from(errandEvents).where(eq(errandEvents.errandId, errandId))).map((x) => x.ev);
    expect(evs).toEqual(['created', 'published', 'runner_accepted', 'payment_confirmed', 'started', 'completed', 'confirmed']);
  });
});

describe('steps happen only in order', () => {
  it('refuses out-of-order steps', async () => {
    const { customer, runner, errandId } = await errandAt('NG', 'accepted');
    await expect(startErrand(db(), runner.id, errandId)).rejects.toMatchObject({ code: 'wrong_status' });
    await expect(confirmErrand(db(), customer.id, errandId)).rejects.toMatchObject({ code: 'wrong_status' });
    await expect(completeErrand(db(), runner.id, errandId, { proofMediaIds: [], receiptMediaIds: [], itemActualMinor: null })).rejects.toMatchObject({ code: 'wrong_status' });
    await expect(raiseDispute(db(), customer.id, errandId, { reasonCode: 'not_done', details: null })).rejects.toMatchObject({ code: 'wrong_status' });
  });
});

describe('auto-release and reminders', () => {
  it('reminds at 2h and 20h, then confirms at 24h; a late confirm loses', async () => {
    const { customer, errandId } = await errandAt('NG', 'completed');
    const [e] = await db().select().from(errands).where(eq(errands.id, errandId));
    const t = e!.completedAt!.getTime();
    const mine = (rows: { errandId: string }[]) => rows.filter((r) => r.errandId === errandId).length;
    expect(mine(await confirmRemindersDue(db(), new Date(t + 1 * H)))).toBe(0);
    expect(mine(await confirmRemindersDue(db(), new Date(t + 2 * H)))).toBe(1);
    expect(mine(await confirmRemindersDue(db(), new Date(t + 3 * H)))).toBe(0);
    expect(mine(await confirmRemindersDue(db(), new Date(t + 20 * H)))).toBe(1);
    expect((await db().select().from(errands).where(eq(errands.id, errandId)))[0]!.remindersSent).toBe(2);
    expect(mine(await autoReleaseDue(db(), new Date(t + 23 * H)))).toBe(0);
    expect(mine(await autoReleaseDue(db(), new Date(t + 24 * H + 1000)))).toBe(1);
    expect(await status(errandId)).toBe('confirmed');
    await expect(confirmErrand(db(), customer.id, errandId)).rejects.toMatchObject({ code: 'wrong_status' });
  });
  it('customer confirm racing the auto-release: exactly one confirms', async () => {
    const { customer, errandId } = await errandAt('VC', 'completed');
    const [e] = await db().select().from(errands).where(eq(errands.id, errandId));
    const later = new Date(e!.autoReleaseAt!.getTime() + 1000);
    await Promise.allSettled([confirmErrand(db(), customer.id, errandId), autoReleaseDue(db(), later)]);
    const evs = await db().select().from(errandEvents).where(and(eq(errandEvents.errandId, errandId), eq(errandEvents.toStatus, 'confirmed')));
    expect(evs).toHaveLength(1);
    expect(await status(errandId)).toBe('confirmed');
  });
});

describe('disputes', () => {
  it('freezes the errand; only participants raise; an admin in scope resolves once', async () => {
    const { customer, runner, errandId } = await errandAt('NG', 'completed');
    const stranger = await makeUser('NG');
    await expect(raiseDispute(db(), stranger.id, errandId, { reasonCode: 'not_done', details: null })).rejects.toMatchObject({ code: 'not_found' });
    await expect(raiseDispute(db(), customer.id, errandId, { reasonCode: 'made_up', details: null })).rejects.toMatchObject({ code: 'invalid_reason' });
    const d = await raiseDispute(db(), customer.id, errandId, { reasonCode: 'wrong_items', details: 'Brought the wrong brand' });
    expect(d.raisedRole).toBe('customer');
    const [e] = await db().select().from(errands).where(eq(errands.id, errandId));
    expect(e!.status).toBe('disputed');
    expect(e!.autoReleaseAt).toBeNull();
    expect((await autoReleaseDue(db(), new Date(Date.now() + 48 * H))).some((r) => r.errandId === errandId)).toBe(false);
    await expect(raiseDispute(db(), runner.id, errandId, { reasonCode: 'other', details: null })).rejects.toMatchObject({ code: 'wrong_status' });

    // RLS: participants see the dispute; strangers don't.
    expect(await asUser(db(), runner.claims, (tx) => tx.select().from(disputes).where(eq(disputes.id, d.disputeId)))).toHaveLength(1);
    expect(await asUser(db(), stranger.claims, (tx) => tx.select().from(disputes).where(eq(disputes.id, d.disputeId)))).toHaveLength(0);

    const vcAdmin = await makeAdmin('VC');
    const ngAdmin = await makeAdmin('NG');
    await expect(resolveDispute(db(), { adminId: vcAdmin.id, adminScope: [(await market('VC')).id], disputeId: d.disputeId, outcome: 'refund_customer', note: null }))
      .rejects.toMatchObject({ code: 'out_of_scope' });
    const r = await resolveDispute(db(), { adminId: ngAdmin.id, adminScope: [(await market('NG')).id], disputeId: d.disputeId, outcome: 'refund_customer', note: 'Receipt shows wrong item' });
    expect(r.outcome).toBe('refund_customer');
    expect(await status(errandId)).toBe('refunded');
    await expect(resolveDispute(db(), { adminId: ngAdmin.id, adminScope: 'all', disputeId: d.disputeId, outcome: 'release_runner', note: null }))
      .rejects.toMatchObject({ code: 'already_resolved' });

    // The record can't be rewritten or deleted, even directly.
    await expectDbError(db().update(disputes).set({ reasonCode: 'other' }).where(eq(disputes.id, d.disputeId)), /only the resolution|resolved dispute is final/);
    await expectDbError(db().delete(disputes).where(eq(disputes.id, d.disputeId)), /kept for the record/);
  });
  it('release to the Runner confirms the errand and opens ratings', async () => {
    const { runner, customer, errandId } = await errandAt('VC', 'in_progress');
    const d = await raiseDispute(db(), runner.id, errandId, { reasonCode: 'unreachable', details: null });
    const admin = await makeAdmin('ALL');
    await resolveDispute(db(), { adminId: admin.id, adminScope: 'all', disputeId: d.disputeId, outcome: 'release_runner', note: null });
    const [e] = await db().select().from(errands).where(eq(errands.id, errandId));
    expect(e!.status).toBe('confirmed');
    expect(e!.confirmedAt).toBeTruthy();
    await rateErrand(db(), customer.id, errandId, { stars: 3, comment: null });
  });
  it('the database refuses a dispute from someone outside the errand', async () => {
    const { errandId } = await errandAt('NG', 'funded');
    const stranger = await makeUser('NG');
    const [e] = await db().select().from(errands).where(eq(errands.id, errandId));
    await expectDbError(db().insert(disputes).values({ id: crypto.randomUUID(), marketId: e!.marketId, errandId, raisedBy: stranger.id, raisedRole: 'customer', fromStatus: 'funded', reasonCode: 'other' }),
      /only the customer or the assigned Runner/);
  });
});

describe('ratings', () => {
  it('two-way and blind until both have rated', async () => {
    const { customer, runner, errandId } = await errandAt('NG', 'confirmed');
    const stranger = await makeUser('NG');
    await expect(rateErrand(db(), stranger.id, errandId, { stars: 5, comment: null })).rejects.toMatchObject({ code: 'not_found' });
    await expect(rateErrand(db(), customer.id, errandId, { stars: 6, comment: null })).rejects.toMatchObject({ code: 'invalid_stars' });
    await rateErrand(db(), customer.id, errandId, { stars: 4, comment: 'Quick and friendly' });
    await expect(rateErrand(db(), customer.id, errandId, { stars: 5, comment: null })).rejects.toMatchObject({ code: 'already_rated' });

    // Blind: the Runner can't see it yet, and it doesn't count towards their public score.
    expect(await ratingsForErrand(db(), runner.claims, errandId)).toEqual([]);
    expect(await hasRated(db(), errandId, customer.id)).toBe(true);
    expect((await ratingSummary(db(), [runner.id])).get(runner.id)).toBeUndefined();

    await rateErrand(db(), runner.id, errandId, { stars: 5, comment: null });
    expect((await ratingsForErrand(db(), runner.claims, errandId)).map((r) => r.stars).sort()).toEqual([4, 5]);
    expect((await ratingsForErrand(db(), customer.claims, errandId)).map((r) => r.stars).sort()).toEqual([4, 5]);
    expect(await ratingsForErrand(db(), stranger.claims, errandId)).toEqual([]);
    expect((await ratingSummary(db(), [runner.id])).get(runner.id)).toEqual({ avg: 4, count: 1 });

    // Ratings are permanent.
    await expectDbError(db().update(ratings).set({ stars: 1 }).where(eq(ratings.errandId, errandId)), /append-only/);
  });
  it('revealed when the 7-day window closes; no ratings after it, or before confirmation', async () => {
    const { customer, runner, errandId } = await errandAt('VC', 'confirmed');
    await rateErrand(db(), customer.id, errandId, { stars: 2, comment: null });
    await db().update(errands).set({ confirmedAt: new Date(Date.now() - 8 * 24 * H) }).where(eq(errands.id, errandId));
    expect((await ratingsForErrand(db(), runner.claims, errandId)).map((r) => r.stars)).toEqual([2]);
    await expect(rateErrand(db(), runner.id, errandId, { stars: 5, comment: null })).rejects.toMatchObject({ code: 'rating_closed' });

    const early = await errandAt('VC', 'completed');
    await expect(rateErrand(db(), early.customer.id, early.errandId, { stars: 5, comment: null })).rejects.toMatchObject({ code: 'wrong_status' });
    const [e] = await db().select().from(errands).where(eq(errands.id, early.errandId));
    await expectDbError(db().insert(ratings).values({ id: crypto.randomUUID(), marketId: e!.marketId, errandId: early.errandId, raterId: early.customer.id, rateeId: early.runner.id, raterRole: 'customer', stars: 5 }),
      /only after the errand is confirmed/);
  });
});

describe('cancel and withdraw before payment', () => {
  it('the customer can cancel for free until paid, not after', async () => {
    const c = await makeUser('NG');
    const { errandId } = await post('NG', c.id);
    const r = await cancelByCustomer(db(), c.id, errandId, null);
    expect(r.wasAccepted).toBe(false);
    expect(await status(errandId)).toBe('cancelled');
    const paid = await errandAt('NG', 'funded');
    await expect(cancelByCustomer(db(), paid.customer.id, paid.errandId, null)).rejects.toMatchObject({ code: 'cancel_after_payment' });
    await expect(cancelByCustomer(db(), paid.runner.id, paid.errandId, null)).rejects.toMatchObject({ code: 'not_found' });
  });
  it('a Runner who backs out puts the errand back on the market for others', async () => {
    const { customer, runner, errandId } = await errandAt('VC', 'accepted');
    await withdrawByRunner(db(), runner.id, errandId);
    const [e] = await db().select().from(errands).where(eq(errands.id, errandId));
    expect(e!.status).toBe('open');
    expect(e!.runnerId).toBeNull();
    expect((await db().select().from(offers).where(eq(offers.errandId, errandId)))[0]!.status).toBe('withdrawn');
    // The withdrawing Runner can't see it any more; another Runner can take it.
    expect(await asUser(db(), runner.claims, (tx) => tx.select().from(errands).where(eq(errands.id, errandId)))).toEqual([]);
    const other = await verifiedRunner('VC', 'Other');
    await acceptErrand(db(), other.id, errandId, 250000n);
    expect(await status(errandId)).toBe('offer_accepted');
    await expect(withdrawByRunner(db(), runner.id, errandId)).rejects.toMatchObject({ code: 'not_found' });
    expect(customer.id).toBeTruthy();
  });
});

describe('state machine parity still holds', () => {
  it('no new transitions were added', async () => {
    const rows = (await db().execute(sql`select count(*)::int as n from unnest(enum_range(null::errand_status)) f, unnest(enum_range(null::errand_status)) t where app.errand_transition_allowed(f, t)`)) as unknown as [{ n: number }];
    expect(rows[0].n).toBe(20);
  });
});
