import { and, eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { asUser } from '../../db/client';
import { conversations, errands, marketFeeSchedules, media, notifications, places, prohibitedItems, runnerProfiles, serviceAreas } from '../../db/schema';
import { becomeRunner, updateRunnerProfile } from '@/modules/identity/service';
import { TRANSITIONS, ERRAND_STATUSES } from '@/modules/errands/domain/state-machine';
import {
  acceptErrand, browseOpenErrands, createErrand, editPrice, ErrandError, expireDueErrands, getErrandForParticipant, openErrandForRunner, reviewHeldErrand, type CreateErrandInput,
} from '@/modules/errands/service';
import { resolveMediaForViewer, sanitizeImage, storeImage } from '@/modules/media/service';
import { blockUser, getThread, listConversations, MessagingError, sendMessage, startQuestionThread } from '@/modules/messaging/service';
import { listNotifications, markAllRead, notify, unreadCount } from '@/modules/notifications/service';
import { LocalObjectStore } from '@/providers/storage/local';
import { db, expectDbError, makeAdmin, makeUser, market } from './helpers';

async function areaOf(code: 'NG' | 'VC', slug: string) {
  const m = await market(code);
  const [a] = await db().select().from(serviceAreas).where(and(eq(serviceAreas.marketId, m.id), eq(serviceAreas.slug, slug)));
  return a!;
}
async function verifiedRunner(code: 'NG' | 'VC', areaSlug: string, name = 'Runner') {
  const u = await makeUser(code, name);
  await becomeRunner(db(), u.id);
  await updateRunnerProfile(db(), u.claims, { bio: null, vehicle: 'none', emergencyContactName: null, emergencyContactPhone: null, serviceAreaIds: [(await areaOf(code, areaSlug)).id] });
  await db().update(runnerProfiles).set({ kycStatus: 'approved', kycApprovedAt: new Date() }).where(eq(runnerProfiles.userId, u.id));
  return u;
}
async function post(code: 'NG' | 'VC', customerId: string, over: Partial<CreateErrandInput> = {}) {
  const m = await market(code);
  const area = await areaOf(code, code === 'NG' ? 'wuse-2' : 'kingstown');
  return createErrand(db(), {
    customerId, marketId: m.id, categoryKey: 'delivery', title: 'Deliver a parcel', description: 'Small box', priceMinor: 250000n,
    requiresPurchase: false, items: [], windowKind: 'asap', windowEnd: null, mediaIds: [], publish: true,
    stops: [{ kind: 'dropoff', serviceAreaId: area.id, lat: null, lng: null, pinSource: 'area_center', landmark: 'Blue gate opposite the bank', contactName: 'Ada', contactPhoneE164: null, instructions: null }],
    ...over,
  });
}

describe('state machine parity', () => {
  it('the Postgres transition list equals the TypeScript one', async () => {
    const rows = (await db().execute(sql`select f::text, t::text from unnest(enum_range(null::errand_status)) f, unnest(enum_range(null::errand_status)) t where app.errand_transition_allowed(f, t)`)) as unknown as { f: string; t: string }[];
    const fromDb = rows.map((r) => `${r.f}>${r.t}`).sort();
    expect(fromDb).toEqual(TRANSITIONS.map(([f, t]) => `${f}>${t}`).sort());
    const enumVals = (await db().execute(sql`select unnest(enum_range(null::errand_status))::text as v`)) as unknown as { v: string }[];
    expect(enumVals.map((v) => v.v)).toEqual([...ERRAND_STATUSES]);
  });
  it('rejects illegal transitions in the database itself', async () => {
    const c = await makeUser('NG');
    const { errandId } = await post('NG', c.id);
    await expectDbError(db().update(errands).set({ status: 'in_progress' }).where(eq(errands.id, errandId)), /illegal errand transition/);
  });
});

describe.each(['NG', 'VC'] as const)('marketplace — %s', (code) => {
  const area = code === 'NG' ? 'wuse-2' : 'kingstown';
  it('post → browse (safe fields only) → first Runner wins → details stay hidden until paid', async () => {
    const customer = await makeUser(code, 'Customer');
    const r1 = await verifiedRunner(code, area, 'R One');
    const r2 = await verifiedRunner(code, area, 'R Two');
    const { errandId, status } = await post(code, customer.id);
    expect(status).toBe('open');

    const cards = await browseOpenErrands(db(), r1.id, { marketId: customer.marketId, allAreas: false });
    const card = cards.find((c) => c.id === errandId)!;
    expect(card).toBeTruthy();
    expect(JSON.stringify(card, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).not.toMatch(/Blue gate|landmark|customer/i);
    expect(Object.keys(card).sort()).toEqual(['areaNameKeys', 'categoryKey', 'categoryNameKey', 'currency', 'expiresAt', 'id', 'itemEstimateMinor', 'priceMinor', 'publishedAt', 'requiresPurchase', 'title', 'windowEnd', 'windowKind']);

    const detail = await openErrandForRunner(db(), r1.id, customer.marketId, errandId);
    expect(detail?.description).toBe('Small box');
    expect(JSON.stringify(detail, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).not.toMatch(/Blue gate/);

    // RLS: a Runner can't read an open errand or its places directly.
    expect(await asUser(db(), r1.claims, (tx) => tx.select().from(errands).where(eq(errands.id, errandId)))).toEqual([]);
    expect(await asUser(db(), r1.claims, (tx) => tx.select().from(places))).toEqual([]);

    // Both accept at the same moment — exactly one wins.
    const results = await Promise.allSettled([acceptErrand(db(), r1.id, errandId, 250000n), acceptErrand(db(), r2.id, errandId, 250000n)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect((loser.reason as ErrandError).code).toBe('not_open');
    const winner = results[0]!.status === 'fulfilled' ? r1 : r2;

    // Assigned Runner sees the errand row but not the exact location before payment.
    const view = await getErrandForParticipant(db(), winner.claims, errandId);
    expect(view?.errand.status).toBe('offer_accepted');
    expect(view?.places).toEqual([]);
    // Customer sees everything.
    expect((await getErrandForParticipant(db(), customer.claims, errandId))?.places[0]?.landmark).toBe('Blue gate opposite the bank');
    // And once paid (Stage 6 will set this), the Runner sees the pin + landmark.
    await db().update(errands).set({ status: 'funded' }).where(eq(errands.id, errandId));
    expect((await getErrandForParticipant(db(), winner.claims, errandId))?.places[0]?.landmark).toBe('Blue gate opposite the bank');
  });
});

describe('launch fee decisions (2026-11-26)', () => {
  it.each(['NG', 'VC'] as const)('%s: 5%% service fee, no commission, no minimum price; errands freeze the schedule they were posted under', async (code) => {
    const m = await market(code);
    const [f] = await db().select().from(marketFeeSchedules).where(and(eq(marketFeeSchedules.marketId, m.id), sql`effective_to is null`));
    expect(f).toMatchObject({ serviceFeeBps: 500, commissionBps: 0, minErrandPriceMinor: null });
    const c = await makeUser(code);
    const { errandId } = await post(code, c.id);
    const [e] = await db().select().from(errands).where(eq(errands.id, errandId));
    expect(e!.feeScheduleId).toBe(f!.id);
  });
});

describe('posting rules', () => {
  it('rejects a pin outside the chosen area and an empty drop-off', async () => {
    const c = await makeUser('NG');
    const a = await areaOf('NG', 'wuse-2');
    await expect(post('NG', c.id, { stops: [{ kind: 'dropoff', serviceAreaId: a.id, lat: 13.15, lng: -61.22, pinSource: 'device', landmark: 'x x x', contactName: null, contactPhoneE164: null, instructions: null }] }))
      .rejects.toMatchObject({ code: 'pin_outside_area' });
    await expect(post('NG', c.id, { stops: [] })).rejects.toMatchObject({ code: 'dropoff_required' });
  });
  it("can't use another market's service area (app check + DB trigger)", async () => {
    const c = await makeUser('NG');
    const vcArea = await areaOf('VC', 'kingstown');
    await expect(post('NG', c.id, { stops: [{ kind: 'dropoff', serviceAreaId: vcArea.id, lat: null, lng: null, pinSource: 'area_center', landmark: 'xxx', contactName: null, contactPhoneE164: null, instructions: null }] }))
      .rejects.toMatchObject({ code: 'invalid_area' });
  });
  it('enforces minimum price and item cap only when configured (NULL = not decided)', async () => {
    const c = await makeUser('VC');
    const m = await market('VC');
    expect((await post('VC', c.id, { priceMinor: 1n })).status).toBe('open'); // no minimum set
    await db().update(marketFeeSchedules).set({ minErrandPriceMinor: 2000n, maxItemCostMinor: 10000n }).where(eq(marketFeeSchedules.marketId, m.id));
    try {
      await expect(post('VC', c.id, { priceMinor: 1999n })).rejects.toMatchObject({ code: 'price_below_minimum' });
      await expect(post('VC', c.id, { categoryKey: 'shopping', requiresPurchase: true, items: [{ name: 'Rice', qty: 3, estUnitPriceMinor: 4000n }] }))
        .rejects.toMatchObject({ code: 'items_over_cap' });
      const ok = await post('VC', c.id, { categoryKey: 'shopping', requiresPurchase: true, items: [{ name: 'Rice', qty: 2, estUnitPriceMinor: 4000n }] });
      const [e] = await db().select().from(errands).where(eq(errands.id, ok.errandId));
      expect(e!.itemEstimateMinor).toBe(8000n);
    } finally {
      await db().update(marketFeeSchedules).set({ minErrandPriceMinor: null, maxItemCostMinor: null }).where(eq(marketFeeSchedules.marketId, m.id));
    }
  });
  it('prohibited items: block refuses, review holds for an admin who can publish', async () => {
    const m = await market('NG');
    const [block] = await db().insert(prohibitedItems).values({ marketId: m.id, label: 'Test weapons', keywords: ['testgun'], action: 'block' }).returning();
    const [review] = await db().insert(prohibitedItems).values({ marketId: m.id, label: 'Test meds', keywords: ['testmed'], action: 'review' }).returning();
    try {
      const c = await makeUser('NG');
      await expect(post('NG', c.id, { title: 'Buy a testgun' })).rejects.toMatchObject({ code: 'prohibited' });
      const held = await post('NG', c.id, { title: 'Collect testmed from pharmacy' });
      expect(held).toMatchObject({ status: 'draft', heldForReview: true });
      const runner = await verifiedRunner('NG', 'wuse-2');
      expect((await browseOpenErrands(db(), runner.id, { marketId: m.id, allAreas: true })).some((x) => x.id === held.errandId)).toBe(false);
      const admin = await makeAdmin('NG');
      await reviewHeldErrand(db(), { adminId: admin.id, adminScope: [m.id], errandId: held.errandId, decision: 'clear', note: 'ok' });
      const [e] = await db().select().from(errands).where(eq(errands.id, held.errandId));
      expect(e!.status).toBe('open');
    } finally {
      await db().update(prohibitedItems).set({ active: false }).where(sql`${prohibitedItems.id} in (${block!.id}, ${review!.id})`);
    }
  });
});

describe('accept guards', () => {
  it('refuses a stale price, unverified Runners, own errands and over the concurrency limit', async () => {
    const c = await makeUser('NG');
    const r = await verifiedRunner('NG', 'wuse-2');
    const { errandId } = await post('NG', c.id);
    await editPrice(db(), c.id, errandId, 300000n, 2);
    await expect(acceptErrand(db(), r.id, errandId, 250000n)).rejects.toMatchObject({ code: 'price_changed' });

    const unverified = await makeUser('NG'); await becomeRunner(db(), unverified.id);
    await expect(acceptErrand(db(), unverified.id, errandId, 300000n)).rejects.toMatchObject({ code: 'not_verified' });

    await becomeRunner(db(), c.id);
    await db().update(runnerProfiles).set({ kycStatus: 'approved' }).where(eq(runnerProfiles.userId, c.id));
    await expect(acceptErrand(db(), c.id, errandId, 300000n)).rejects.toMatchObject({ code: 'own_errand' });

    const busy = await verifiedRunner('NG', 'wuse-2');
    for (let i = 0; i < 3; i++) { const e = await post('NG', c.id); await acceptErrand(db(), busy.id, e.errandId, 250000n); }
    const fourth = await post('NG', c.id);
    await expect(acceptErrand(db(), busy.id, fourth.errandId, 250000n)).rejects.toMatchObject({ code: 'too_many_active' });
  });
  it("a Runner from another market can't take an errand (service + DB trigger)", async () => {
    const c = await makeUser('NG');
    const vcRunner = await verifiedRunner('VC', 'kingstown');
    const { errandId } = await post('NG', c.id);
    await expect(acceptErrand(db(), vcRunner.id, errandId, 250000n)).rejects.toMatchObject({ code: 'wrong_market' });
    await expectDbError(db().update(errands).set({ runnerId: vcRunner.id }).where(eq(errands.id, errandId)), /Runner must be in the errand's market/);
  });
  it('price edits use optimistic locking', async () => {
    const c = await makeUser('VC');
    const { errandId } = await post('VC', c.id);
    await editPrice(db(), c.id, errandId, 3000n, 2);
    await expect(editPrice(db(), c.id, errandId, 4000n, 2)).rejects.toMatchObject({ code: 'stale' });
  });
});

describe('messaging & trust', () => {
  it('question threads, privacy, read-only after another Runner is chosen, and blocking', async () => {
    const c = await makeUser('VC', 'Cust');
    const asker = await verifiedRunner('VC', 'kingstown', 'Asker');
    const taker = await verifiedRunner('VC', 'kingstown', 'Taker');
    const stranger = await makeUser('VC', 'Stranger');
    const { errandId } = await post('VC', c.id);
    const conv = await startQuestionThread(db(), asker.id, errandId);
    expect(await startQuestionThread(db(), asker.id, errandId)).toBe(conv); // idempotent
    await sendMessage(db(), asker.id, conv, 'Is the box heavy?');
    const reply = await sendMessage(db(), c.id, conv, 'No, 2 kg');
    expect(reply.recipientId).toBe(asker.id);
    expect((await getThread(db(), asker.claims, conv))?.messages.map((m) => m.body)).toEqual(['Is the box heavy?', 'No, 2 kg']);
    expect(await getThread(db(), stranger.claims, conv)).toBeNull(); // RLS
    await expect(sendMessage(db(), stranger.id, conv, 'hi')).rejects.toMatchObject({ code: 'not_found' });

    await acceptErrand(db(), taker.id, errandId, 250000n);
    const [c1] = await db().select().from(conversations).where(eq(conversations.id, conv));
    expect(c1!.status).toBe('read_only');
    await expect(sendMessage(db(), asker.id, conv, 'still there?')).rejects.toMatchObject({ code: 'read_only' });
    expect((await listConversations(db(), taker.claims)).some((x) => x.errandId === errandId)).toBe(true); // thread created on accept

    const takerConv = (await listConversations(db(), c.claims)).find((x) => x.runnerId === taker.id)!.id;
    await blockUser(db(), c.id, taker.id);
    await expect(sendMessage(db(), taker.id, takerConv, 'hello')).rejects.toBeInstanceOf(MessagingError);
  });
});

describe('notifications', () => {
  it('coalesces repeated alerts, scopes reads to the owner, and marks read', async () => {
    const u = await makeUser('NG'); const other = await makeUser('NG');
    const m = await market('NG');
    await notify(db(), { userIds: [u.id], marketId: m.id, type: 'new_message', payload: { sender: 'A', preview: 'x' }, coalesceKey: 'conversation:1' });
    await notify(db(), { userIds: [u.id], marketId: m.id, type: 'new_message', payload: { sender: 'A', preview: 'y' }, coalesceKey: 'conversation:1' });
    expect(await unreadCount(db(), u.claims)).toBe(1);
    expect(await listNotifications(db(), other.claims)).toEqual([]);
    await asUser(db(), other.claims, (tx) => tx.update(notifications).set({ readAt: new Date() }).where(eq(notifications.userId, u.id)));
    expect(await unreadCount(db(), u.claims)).toBe(1); // other user's update touched nothing
    await markAllRead(db(), u.claims);
    expect(await unreadCount(db(), u.claims)).toBe(0);
  });
});

describe('expiry', () => {
  it('expires open errands past their deadline and closes their threads', async () => {
    const c = await makeUser('NG');
    const r = await verifiedRunner('NG', 'wuse-2');
    const { errandId } = await post('NG', c.id);
    const conv = await startQuestionThread(db(), r.id, errandId);
    const later = new Date(Date.now() + 49 * 3600_000);
    const expired = await expireDueErrands(db(), later);
    expect(expired.map((e) => e.id)).toContain(errandId);
    const [cv] = await db().select().from(conversations).where(eq(conversations.id, conv));
    expect(cv!.status).toBe('read_only');
  });
});

describe('photos', () => {
  const dir = `/tmp/claude-0/em-test-uploads-${process.pid}`;
  const store = new LocalObjectStore(dir);
  afterAll(async () => { await import('node:fs/promises').then((fs) => fs.rm(dir, { recursive: true, force: true })); });

  it('strips EXIF/GPS, resizes and re-encodes; rejects non-images', async () => {
    const jpeg = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#7a7' } })
      .withExif({ IFD0: { Make: 'TestCam' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '9/1 4/1 0/1' } }).jpeg().toBuffer();
    expect((await sharp(jpeg).metadata()).exif).toBeTruthy();
    const out = await sanitizeImage(new Uint8Array(jpeg));
    const meta = await sharp(Buffer.from(out.bytes)).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(Math.max(out.width, out.height)).toBe(1600);
    await expect(sanitizeImage(new TextEncoder().encode('<svg onload=alert(1)>'))).rejects.toMatchObject({ code: 'unsupported' });
  });
  it('open-errand photos are visible to verified Runners of that market only, and only while open', async () => {
    const c = await makeUser('NG'); const m = await market('NG');
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).png().toBuffer();
    const img = await storeImage(db(), store, { ownerId: c.id, marketId: m.id, marketCode: 'NG', kind: 'errand_reference', bytes: new Uint8Array(png) });
    const { errandId } = await post('NG', c.id, { mediaIds: [img.id] });
    const runner = await verifiedRunner('NG', 'wuse-2');
    const vcRunner = await verifiedRunner('VC', 'kingstown');
    const plain = await makeUser('NG');
    expect(await resolveMediaForViewer(db(), runner.claims, img.id)).toBeTruthy();
    expect(await resolveMediaForViewer(db(), vcRunner.claims, img.id)).toBeNull();
    expect(await resolveMediaForViewer(db(), plain.claims, img.id)).toBeNull();
    const [row] = await db().select().from(media).where(eq(media.id, img.id));
    expect(row!.errandId).toBe(errandId);
    const other = await verifiedRunner('NG', 'wuse-2');
    await acceptErrand(db(), other.id, errandId, 250000n);
    expect(await resolveMediaForViewer(db(), runner.claims, img.id)).toBeNull(); // no longer open
    expect(await resolveMediaForViewer(db(), other.claims, img.id)).toBeTruthy(); // assigned Runner (RLS)
    await expect(store.put('../escape.txt', new Uint8Array([1]), 'text/plain')).rejects.toThrow(/escapes/);
  });
});
