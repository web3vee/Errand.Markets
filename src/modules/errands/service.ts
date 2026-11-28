import { and, asc, desc, eq, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { asSystem, asUser, type Db, type JwtClaims, type Tx } from '../../../db/client';
import {
  blocks, conversations, errandCategories, errandEvents, errandItems, errands, errandStops, marketFeeSchedules, media, offers, places,
  prohibitedItems, runnerProfiles, runnerRules, runnerServiceAreas, serviceAreas, userRoles, users,
} from '../../../db/schema';
import { uuidv7 } from '@/lib/ids';
import type { LocalizedText } from '@/lib/localized-text';
import { attachErrandMedia } from '../media/service';
import { areaContaining, isValidLatLng, pointInGeometry, type AreaGeometry } from './domain/geo';
import { screenText } from './domain/screening';
import { ACTIVE_RUNNER_STATUSES, checkAccept, type ErrandStatus } from './domain/state-machine';

export class ErrandError extends Error {
  constructor(public readonly code: string, public readonly detail?: Record<string, unknown>) { super(code); }
}

// ── Config ───────────────────────────────────────────────────────────────────
export async function marketplaceConfig(db: DbLike, marketId: string) {
  const [fees] = await db.select().from(marketFeeSchedules).where(and(eq(marketFeeSchedules.marketId, marketId), isNull(marketFeeSchedules.effectiveTo)));
  const [rules] = await db.select().from(runnerRules).where(and(eq(runnerRules.marketId, marketId), isNull(runnerRules.effectiveTo)));
  if (!fees || !rules) throw new Error(`market ${marketId} has no current fee schedule / runner rules`);
  return { fees, rules };
}
type DbLike = Db | Tx;

// ── Create / publish ─────────────────────────────────────────────────────────
export type StopInput = {
  kind: 'pickup' | 'purchase' | 'collect' | 'dropoff';
  serviceAreaId: string; lat: number | null; lng: number | null; pinSource: 'area_center' | 'device' | 'map';
  landmark: string; contactName: string | null; contactPhoneE164: string | null; instructions: string | null;
};
export type CreateErrandInput = {
  customerId: string; marketId: string; categoryKey: string; title: string; description: string; priceMinor: bigint;
  requiresPurchase: boolean; items: { name: string; qty: number; estUnitPriceMinor: bigint }[];
  stops: StopInput[]; windowKind: 'asap' | 'by_time'; windowEnd: Date | null; mediaIds: string[]; publish: boolean;
};
export type PublishOutcome = { errandId: string; status: 'draft' | 'open'; heldForReview: boolean };

export async function createErrand(db: Db, input: CreateErrandInput, now = new Date()): Promise<PublishOutcome> {
  return asSystem(db, 'errands.create (customer session verified by caller)', async (tx) => {
    const [u] = await tx.select({ marketId: users.marketId, status: users.status }).from(users).where(eq(users.id, input.customerId));
    if (!u || u.status !== 'active' || u.marketId !== input.marketId) throw new ErrandError('account_not_allowed');
    const [cat] = await tx.select().from(errandCategories)
      .where(and(eq(errandCategories.marketId, input.marketId), eq(errandCategories.key, input.categoryKey), eq(errandCategories.active, true)));
    if (!cat) throw new ErrandError('invalid_category');
    if (input.requiresPurchase && !cat.purchaseAllowed) throw new ErrandError('purchase_not_allowed');
    const { fees } = await marketplaceConfig(tx, input.marketId);

    if (input.priceMinor <= 0n) throw new ErrandError('price_required');
    if (fees.minErrandPriceMinor !== null && input.priceMinor < fees.minErrandPriceMinor) throw new ErrandError('price_below_minimum', { min: fees.minErrandPriceMinor });
    const items = input.requiresPurchase ? input.items : [];
    if (input.requiresPurchase && items.length === 0) throw new ErrandError('items_required');
    const itemEstimate = items.reduce((s, i) => s + i.estUnitPriceMinor * BigInt(i.qty), 0n);
    if (fees.maxItemCostMinor !== null && itemEstimate > fees.maxItemCostMinor) throw new ErrandError('items_over_cap', { max: fees.maxItemCostMinor });
    if (!input.stops.some((s) => s.kind === 'dropoff')) throw new ErrandError('dropoff_required');
    if (input.windowKind === 'by_time') {
      const w = input.windowEnd?.getTime() ?? 0;
      if (w < now.getTime() + 15 * 60_000 || w > now.getTime() + 30 * 86_400_000) throw new ErrandError('invalid_window');
    }

    const areas = await tx.select().from(serviceAreas).where(and(eq(serviceAreas.marketId, input.marketId), eq(serviceAreas.active, true)));
    const errandId = uuidv7();
    const placeRows = input.stops.map((s) => {
      const area = areas.find((a) => a.id === s.serviceAreaId);
      if (!area) throw new ErrandError('invalid_area');
      let lat = Number(area.centerLat), lng = Number(area.centerLng), source: StopInput['pinSource'] = 'area_center';
      if (s.lat !== null && s.lng !== null) {
        const p = { lat: s.lat, lng: s.lng };
        if (!isValidLatLng(p)) throw new ErrandError('invalid_pin');
        // The pin must fall inside the chosen service area (we only operate there).
        if (!area.boundary || !pointInGeometry(p, area.boundary as AreaGeometry)) throw new ErrandError('pin_outside_area');
        ({ lat, lng } = p); source = s.pinSource === 'area_center' ? 'map' : s.pinSource;
      }
      return {
        id: uuidv7(), marketId: input.marketId, ownerId: input.customerId, lat: lat.toFixed(6), lng: lng.toFixed(6), pinSource: source,
        serviceAreaId: area.id, landmark: s.landmark, addressText: null, contactName: s.contactName, contactPhoneE164: s.contactPhoneE164,
      };
    });
    const origin = placeRows[0]!.serviceAreaId;

    await tx.insert(places).values(placeRows);
    await tx.insert(errands).values({
      id: errandId, marketId: input.marketId, customerId: input.customerId, categoryId: cat.id, title: input.title, description: input.description,
      currency: (await currencyOf(tx, input.marketId)), priceMinor: input.priceMinor, requiresPurchase: input.requiresPurchase, itemEstimateMinor: itemEstimate,
      originServiceAreaId: origin, windowKind: input.windowKind, windowEnd: input.windowKind === 'by_time' ? input.windowEnd : null,
    });
    await tx.insert(errandStops).values(input.stops.map((s, i) => ({ errandId, seq: i + 1, kind: s.kind, placeId: placeRows[i]!.id, instructions: s.instructions })));
    if (items.length) await tx.insert(errandItems).values(items.map((i) => ({ errandId, name: i.name, qty: i.qty, estUnitPriceMinor: i.estUnitPriceMinor })));
    await attachErrandMedia(tx, input.customerId, errandId, input.mediaIds);
    await event(tx, errandId, null, 'draft', 'created', 'customer', input.customerId);

    if (!input.publish) return { errandId, status: 'draft' as const, heldForReview: false };
    return publishInTx(tx, errandId, input.customerId, now);
  });
}

export async function publishDraft(db: Db, customerId: string, errandId: string, now = new Date()) {
  return asSystem(db, 'errands.publish (owner checked)', async (tx) => {
    const [e] = await tx.select({ customerId: errands.customerId }).from(errands).where(eq(errands.id, errandId));
    if (!e || e.customerId !== customerId) throw new ErrandError('not_found');
    return publishInTx(tx, errandId, customerId, now);
  });
}

async function publishInTx(tx: Tx, errandId: string, actorId: string, now: Date, opts: { reviewCleared?: boolean } = {}): Promise<PublishOutcome> {
  const [e] = await tx.select().from(errands).where(eq(errands.id, errandId)).for('update');
  if (!e || e.status !== 'draft') throw new ErrandError('not_draft');
  if (e.reviewState === 'pending_review' && !opts.reviewCleared) throw new ErrandError('under_review');
  const items = await tx.select({ name: errandItems.name }).from(errandItems).where(eq(errandItems.errandId, errandId));
  const stops = await tx.select({ instructions: errandStops.instructions, landmark: places.landmark }).from(errandStops)
    .innerJoin(places, eq(places.id, errandStops.placeId)).where(eq(errandStops.errandId, errandId));
  const rules = await tx.select().from(prohibitedItems).where(and(eq(prohibitedItems.marketId, e.marketId), eq(prohibitedItems.active, true)));
  const screen = screenText(
    [e.title, e.description, ...items.map((i) => i.name), ...stops.flatMap((s) => [s.instructions ?? '', s.landmark])],
    rules.map((r) => ({ id: r.id, label: r.label, keywords: r.keywords, action: r.action })),
  );
  if (screen.action === 'block') throw new ErrandError('prohibited', { labels: [...new Set(screen.matches.map((m) => m.label))] });
  // An admin clearance overrides "review" matches, never "block" ones.
  if (screen.action === 'review' && !opts.reviewCleared) {
    await tx.update(errands).set({ reviewState: 'pending_review', reviewNote: screen.matches.map((m) => m.label).join(', ') }).where(eq(errands.id, errandId));
    await event(tx, errandId, 'draft', 'draft', 'held_for_review', 'system', null, { matches: screen.matches });
    return { errandId, status: 'draft', heldForReview: true };
  }
  const { fees } = await marketplaceConfig(tx, e.marketId);
  const byExpiry = new Date(now.getTime() + fees.errandDefaultExpiryHours * 3_600_000);
  const expiresAt = e.windowEnd && e.windowEnd < byExpiry ? e.windowEnd : byExpiry;
  await tx.update(errands).set({ status: 'open', publishedAt: now, expiresAt, feeScheduleId: fees.id, version: sql`${errands.version} + 1` }).where(eq(errands.id, errandId));
  await event(tx, errandId, 'draft', 'open', 'published', 'customer', actorId);
  return { errandId, status: 'open', heldForReview: false };
}

async function currencyOf(tx: Tx, marketId: string) {
  const r = (await tx.execute(sql`select currency_code from markets where id = ${marketId}`)) as unknown as { currency_code: string }[];
  return r[0]!.currency_code;
}

async function event(tx: Tx, errandId: string, from: ErrandStatus | null, to: ErrandStatus, name: string,
  actorType: 'customer' | 'runner' | 'admin' | 'system', actorId: string | null, data: Record<string, unknown> = {}) {
  await tx.insert(errandEvents).values({ errandId, fromStatus: from, toStatus: to, event: name, actorType, actorId, data });
}

/** Customer raises/lowers the price while nobody has accepted (optimistic version check). */
export async function editPrice(db: Db, customerId: string, errandId: string, priceMinor: bigint, expectedVersion: number) {
  return asSystem(db, 'errands.editPrice (owner checked)', async (tx) => {
    const [e] = await tx.select().from(errands).where(eq(errands.id, errandId)).for('update');
    if (!e || e.customerId !== customerId) throw new ErrandError('not_found');
    if (e.status !== 'open' && e.status !== 'draft') throw new ErrandError('price_locked');
    if (e.version !== expectedVersion) throw new ErrandError('stale');
    const { fees } = await marketplaceConfig(tx, e.marketId);
    if (priceMinor <= 0n) throw new ErrandError('price_required');
    if (fees.minErrandPriceMinor !== null && priceMinor < fees.minErrandPriceMinor) throw new ErrandError('price_below_minimum', { min: fees.minErrandPriceMinor });
    await tx.update(errands).set({ priceMinor, version: e.version + 1 }).where(eq(errands.id, errandId));
    await event(tx, errandId, e.status, e.status, 'price_changed', 'customer', customerId, { from: e.priceMinor.toString(), to: priceMinor.toString() });
    return { version: e.version + 1 };
  });
}

// ── Accept (first eligible Runner wins) ──────────────────────────────────────
export async function acceptErrand(db: Db, runnerId: string, errandId: string, expectedPriceMinor: bigint, now = new Date()) {
  return asSystem(db, 'errands.accept (runner session verified by caller)', async (tx) => {
    // Row lock serialises concurrent accepts; the loser sees status != open.
    const [e] = await tx.select().from(errands).where(eq(errands.id, errandId)).for('update');
    if (!e) throw new ErrandError('not_found');
    const [u] = await tx.select({ marketId: users.marketId, status: users.status }).from(users).where(eq(users.id, runnerId));
    const [rp] = await tx.select({ kyc: runnerProfiles.kycStatus }).from(runnerProfiles).where(eq(runnerProfiles.userId, runnerId));
    const [role] = await tx.select().from(userRoles).where(and(eq(userRoles.userId, runnerId), eq(userRoles.role, 'runner'), eq(userRoles.status, 'active')));
    const [{ n }] = (await tx.execute(sql`select count(*)::int as n from errands where runner_id = ${runnerId} and status in (${sql.join(ACTIVE_RUNNER_STATUSES.map((s) => sql`${s}::errand_status`), sql`, `)})`)) as unknown as [{ n: number }];
    const blocked = await isBlockedEitherWay(tx, runnerId, e.customerId);
    const { rules } = await marketplaceConfig(tx, e.marketId);
    const check = checkAccept({
      errand: { status: e.status, marketId: e.marketId, customerId: e.customerId, reviewState: e.reviewState },
      runner: { id: runnerId, marketId: u?.marketId ?? '', kycStatus: rp?.kyc ?? 'none', hasRunnerRole: !!role && u?.status === 'active', activeCount: n },
      maxConcurrent: rules.maxConcurrentErrands, blocked,
    });
    if (!check.ok) throw new ErrandError(check.reason);
    // The price the Runner saw must still be the price (customer may have just edited it).
    if (e.priceMinor !== expectedPriceMinor) throw new ErrandError('price_changed', { price: e.priceMinor });

    const offerId = uuidv7();
    await tx.insert(offers).values({ id: offerId, marketId: e.marketId, errandId, runnerId, kind: 'accept_price', amountMinor: e.priceMinor, currency: e.currency, status: 'accepted' });
    await tx.update(errands).set({ status: 'offer_accepted', runnerId, acceptedOfferId: offerId, acceptedAt: now, version: e.version + 1 }).where(eq(errands.id, errandId));
    await event(tx, errandId, 'open', 'offer_accepted', 'runner_accepted', 'runner', runnerId, { price: e.priceMinor.toString() });
    // Threads with other Runners become read-only; make sure the chosen Runner has one.
    await tx.update(conversations).set({ status: 'read_only' }).where(and(eq(conversations.errandId, errandId), ne(conversations.runnerId, runnerId)));
    await tx.insert(conversations).values({ id: uuidv7(), marketId: e.marketId, errandId, customerId: e.customerId, runnerId }).onConflictDoNothing();
    const others = await tx.select({ runnerId: conversations.runnerId }).from(conversations).where(and(eq(conversations.errandId, errandId), ne(conversations.runnerId, runnerId)));
    return { errandId, customerId: e.customerId, marketId: e.marketId, title: e.title, otherRunnerIds: others.map((o) => o.runnerId) };
  });
}

export async function isBlockedEitherWay(tx: DbLike, a: string, b: string) {
  const rows = await tx.select({ x: blocks.blockerId }).from(blocks)
    .where(or(and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)), and(eq(blocks.blockerId, b), eq(blocks.blockedId, a)))).limit(1);
  return rows.length > 0;
}

// ── Expiry (Inngest cron + backstop route) ───────────────────────────────────
export async function expireDueErrands(db: Db, now = new Date()) {
  return asSystem(db, 'errands.expire sweeper', async (tx) => {
    const due = await tx.update(errands).set({ status: 'expired', version: sql`${errands.version} + 1` })
      .where(and(eq(errands.status, 'open'), lte(errands.expiresAt, now)))
      .returning({ id: errands.id, customerId: errands.customerId, marketId: errands.marketId, title: errands.title });
    for (const d of due) {
      await event(tx, d.id, 'open', 'expired', 'expired', 'system', null);
      await tx.update(conversations).set({ status: 'read_only' }).where(eq(conversations.errandId, d.id));
    }
    return due;
  });
}

// ── Admin review of errands held by prohibited-item screening ───────────────
export async function reviewHeldErrand(db: Db, input: { adminId: string; adminScope: 'all' | string[]; errandId: string; decision: 'clear' | 'reject'; note: string | null }, now = new Date()) {
  return asSystem(db, 'errands.review (admin, scope checked)', async (tx) => {
    const [e] = await tx.select().from(errands).where(eq(errands.id, input.errandId)).for('update');
    if (!e || e.reviewState !== 'pending_review') throw new ErrandError('not_found');
    if (input.adminScope !== 'all' && !input.adminScope.includes(e.marketId)) throw new ErrandError('out_of_scope');
    if (input.decision === 'reject') {
      await tx.update(errands).set({ reviewState: 'rejected', reviewNote: input.note, status: 'cancelled', cancelledAt: now, cancelledBy: input.adminId, cancelReasonCode: 'prohibited' }).where(eq(errands.id, e.id));
      await event(tx, e.id, 'draft', 'cancelled', 'review_rejected', 'admin', input.adminId, { note: input.note });
    } else {
      await tx.update(errands).set({ reviewState: 'cleared' }).where(eq(errands.id, e.id));
      await event(tx, e.id, 'draft', 'draft', 'review_cleared', 'admin', input.adminId, { note: input.note });
      await publishInTx(tx, e.id, input.adminId, now, { reviewCleared: true });
    }
    await tx.execute(sql`insert into admin_audit_log (actor_id, market_id, action, subject_type, subject_id, data)
      values (${input.adminId}, ${e.marketId}, ${'errand.review_' + input.decision}, 'errand', ${e.id}, ${JSON.stringify({ note: input.note })}::jsonb)`);
    return { customerId: e.customerId, marketId: e.marketId, title: e.title, decision: input.decision };
  });
}

// ── Reads ────────────────────────────────────────────────────────────────────
/** Customer's own errands (RLS). */
export async function listCustomerErrands(db: Db, claims: JwtClaims) {
  return asUser(db, claims, (tx) => tx.select({
    id: errands.id, title: errands.title, status: errands.status, reviewState: errands.reviewState, priceMinor: errands.priceMinor,
    currency: errands.currency, createdAt: errands.createdAt, publishedAt: errands.publishedAt, expiresAt: errands.expiresAt,
  }).from(errands).where(eq(errands.customerId, claims.sub)).orderBy(desc(errands.createdAt)).limit(100));
}

/** Full errand for a participant (customer, assigned Runner, admin). Exact places only where RLS allows. */
export async function getErrandForParticipant(db: Db, claims: JwtClaims, errandId: string) {
  return asUser(db, claims, async (tx) => {
    const [e] = await tx.select().from(errands).where(eq(errands.id, errandId));
    if (!e) return null;
    const stops = await tx.select({ seq: errandStops.seq, kind: errandStops.kind, instructions: errandStops.instructions, placeId: errandStops.placeId })
      .from(errandStops).where(eq(errandStops.errandId, errandId)).orderBy(asc(errandStops.seq));
    const visiblePlaces = stops.length ? await tx.select().from(places).where(inArray(places.id, stops.map((s) => s.placeId))) : [];
    const items = await tx.select().from(errandItems).where(eq(errandItems.errandId, errandId));
    const photos = await tx.select({ id: media.id, width: media.width, height: media.height }).from(media).where(and(eq(media.errandId, errandId), eq(media.kind, 'errand_reference')));
    const events = await tx.select().from(errandEvents).where(eq(errandEvents.errandId, errandId)).orderBy(asc(errandEvents.at));
    const [cat] = await tx.select({ key: errandCategories.key, nameKey: errandCategories.nameKey }).from(errandCategories).where(eq(errandCategories.id, e.categoryId));
    return { errand: e, category: cat!, stops, places: visiblePlaces, items, photos, events };
  });
}

/** Area names per stop — safe to show anyone who can see the errand (no pins, no contacts). */
export async function stopAreas(db: Db, errandId: string) {
  return asSystem(db, 'errands.stopAreas (area names only)', (tx) => tx.select({ seq: errandStops.seq, kind: errandStops.kind, areaId: serviceAreas.id, areaName: serviceAreas.name })
    .from(errandStops).innerJoin(places, eq(places.id, errandStops.placeId)).innerJoin(serviceAreas, eq(serviceAreas.id, places.serviceAreaId))
    .where(eq(errandStops.errandId, errandId)).orderBy(asc(errandStops.seq)));
}

export type OpenErrandCard = {
  id: string; title: string; categoryKey: string; categoryNameKey: string; priceMinor: bigint; currency: string; requiresPurchase: boolean;
  itemEstimateMinor: bigint; windowKind: string; windowEnd: Date | null; publishedAt: Date | null; expiresAt: Date | null; areaNames: LocalizedText[];
};

/**
 * Runner marketplace: OPEN errands in the Runner's market, safe columns only (no pins, landmarks,
 * contacts, customer identity). Filtered by the Runner's service areas unless `allAreas`.
 * Caller must have verified the Runner (approved KYC).
 */
export async function browseOpenErrands(db: Db, runnerId: string, opts: { marketId: string; allAreas: boolean; categoryKey?: string | null; limit?: number; before?: Date | null }): Promise<OpenErrandCard[]> {
  return asSystem(db, 'errands.browse (safe projection for verified runner)', async (tx) => {
    const myAreas = (await tx.select({ id: runnerServiceAreas.serviceAreaId }).from(runnerServiceAreas).where(eq(runnerServiceAreas.userId, runnerId))).map((a) => a.id);
    const blockedIds = (await tx.select({ a: blocks.blockerId, b: blocks.blockedId }).from(blocks).where(or(eq(blocks.blockerId, runnerId), eq(blocks.blockedId, runnerId))))
      .map((r) => (r.a === runnerId ? r.b : r.a));
    const conds = [eq(errands.marketId, opts.marketId), eq(errands.status, 'open'), ne(errands.customerId, runnerId)];
    if (blockedIds.length) conds.push(sql`${errands.customerId} not in (${sql.join(blockedIds.map((id) => sql`${id}`), sql`, `)})`);
    if (opts.categoryKey) conds.push(eq(errandCategories.key, opts.categoryKey));
    if (opts.before) conds.push(sql`${errands.publishedAt} < ${opts.before.toISOString()}`);
    if (!opts.allAreas) {
      if (!myAreas.length) return [];
      conds.push(sql`exists (select 1 from errand_stops s join places p on p.id = s.place_id where s.errand_id = ${errands.id} and p.service_area_id in (${sql.join(myAreas.map((id) => sql`${id}`), sql`, `)}))`);
    }
    const rows = await tx.select({
      id: errands.id, title: errands.title, categoryKey: errandCategories.key, categoryNameKey: errandCategories.nameKey, priceMinor: errands.priceMinor,
      currency: errands.currency, requiresPurchase: errands.requiresPurchase, itemEstimateMinor: errands.itemEstimateMinor, windowKind: errands.windowKind,
      windowEnd: errands.windowEnd, publishedAt: errands.publishedAt, expiresAt: errands.expiresAt,
    }).from(errands).innerJoin(errandCategories, eq(errandCategories.id, errands.categoryId))
      .where(and(...conds)).orderBy(desc(errands.publishedAt)).limit(Math.min(opts.limit ?? 20, 50));
    const areaRows = rows.length ? await tx.select({ errandId: errandStops.errandId, areaId: serviceAreas.id, name: serviceAreas.name }).from(errandStops)
      .innerJoin(places, eq(places.id, errandStops.placeId)).innerJoin(serviceAreas, eq(serviceAreas.id, places.serviceAreaId))
      .where(inArray(errandStops.errandId, rows.map((r) => r.id))).orderBy(asc(errandStops.seq)) : [];
    return rows.map((r) => {
      const mine = areaRows.filter((a) => a.errandId === r.id);
      return { ...r, areaNames: mine.filter((a, i) => mine.findIndex((b) => b.areaId === a.areaId) === i).map((a) => a.name) };
    });
  });
}

/** One open errand as a Runner sees it before accepting: safe fields + description, items and photo ids. */
export async function openErrandForRunner(db: Db, runnerId: string, marketId: string, errandId: string) {
  const [card] = (await browseOpenErrands(db, runnerId, { marketId, allAreas: true, limit: 50 })).filter((c) => c.id === errandId);
  if (!card) return null;
  return asSystem(db, 'errands.openForRunner (safe projection)', async (tx) => {
    const [e] = await tx.select({ description: errands.description, version: errands.version, feeScheduleId: errands.feeScheduleId }).from(errands).where(eq(errands.id, errandId));
    const items = await tx.select({ name: errandItems.name, qty: errandItems.qty, estUnitPriceMinor: errandItems.estUnitPriceMinor }).from(errandItems).where(eq(errandItems.errandId, errandId));
    const photos = await tx.select({ id: media.id }).from(media).where(and(eq(media.errandId, errandId), eq(media.kind, 'errand_reference')));
    const kinds = await tx.select({ kind: errandStops.kind, name: serviceAreas.name }).from(errandStops)
      .innerJoin(places, eq(places.id, errandStops.placeId)).innerJoin(serviceAreas, eq(serviceAreas.id, places.serviceAreaId))
      .where(eq(errandStops.errandId, errandId)).orderBy(asc(errandStops.seq));
    return { ...card, description: e!.description, feeScheduleId: e!.feeScheduleId, items, photoIds: photos.map((p) => p.id), stops: kinds };
  });
}

/** Errands this Runner has accepted (RLS: runner_id = me). */
export async function listRunnerJobs(db: Db, claims: JwtClaims) {
  return asUser(db, claims, (tx) => tx.select({
    id: errands.id, title: errands.title, status: errands.status, priceMinor: errands.priceMinor, currency: errands.currency, acceptedAt: errands.acceptedAt,
  }).from(errands).where(eq(errands.runnerId, claims.sub)).orderBy(desc(errands.acceptedAt)).limit(100));
}

/** Held errands for admins (pending prohibited-item review). */
export async function listHeldErrands(db: Db, claims: JwtClaims) {
  return asUser(db, claims, (tx) => tx.select({
    id: errands.id, title: errands.title, description: errands.description, marketId: errands.marketId, reviewNote: errands.reviewNote, createdAt: errands.createdAt,
  }).from(errands).where(eq(errands.reviewState, 'pending_review')).orderBy(asc(errands.createdAt)));
}

/** Approved Runners serving any of these areas (for "new errand near you" notifications). */
export async function runnersForAreas(db: Db, marketId: string, areaIds: string[], excludeUserId: string, cap = 200) {
  if (!areaIds.length) return [];
  return asSystem(db, 'errands.runnersForAreas', async (tx) => {
    const rows = await tx.selectDistinct({ userId: runnerServiceAreas.userId }).from(runnerServiceAreas)
      .innerJoin(runnerProfiles, eq(runnerProfiles.userId, runnerServiceAreas.userId))
      .innerJoin(users, eq(users.id, runnerServiceAreas.userId))
      .where(and(inArray(runnerServiceAreas.serviceAreaId, areaIds), eq(runnerProfiles.kycStatus, 'approved'), eq(runnerProfiles.marketId, marketId),
        eq(users.status, 'active'), ne(runnerServiceAreas.userId, excludeUserId)))
      .limit(cap);
    const blockedIds = new Set((await tx.select({ a: blocks.blockerId, b: blocks.blockedId }).from(blocks)
      .where(or(eq(blocks.blockerId, excludeUserId), eq(blocks.blockedId, excludeUserId)))).flatMap((r) => [r.a, r.b]));
    return rows.map((r) => r.userId).filter((id) => !blockedIds.has(id));
  });
}

export async function areasWithBoundaries(db: DbLike, marketId: string) {
  const rows = await db.select().from(serviceAreas).where(and(eq(serviceAreas.marketId, marketId), eq(serviceAreas.active, true))).orderBy(asc(serviceAreas.sort));
  return rows.map((a) => ({ id: a.id, slug: a.slug, name: a.name, center: { lat: Number(a.centerLat), lng: Number(a.centerLng) }, boundary: a.boundary as AreaGeometry | null, boundaryStatus: a.boundaryStatus }));
}
export { areaContaining };

/** Fee schedule as the pricing domain expects it (a specific version, or the market's current one). */
export async function feeScheduleFor(db: DbLike, marketId: string, scheduleId: string | null) {
  const [row] = scheduleId
    ? await db.select().from(marketFeeSchedules).where(eq(marketFeeSchedules.id, scheduleId))
    : await db.select().from(marketFeeSchedules).where(and(eq(marketFeeSchedules.marketId, marketId), isNull(marketFeeSchedules.effectiveTo)));
  if (!row) throw new Error('fee schedule not found');
  return {
    id: row.id, commissionBps: row.commissionBps, serviceFeeBps: row.serviceFeeBps, serviceFeeFixedMinor: row.serviceFeeFixedMinor,
    serviceFeeMinMinor: row.serviceFeeMinMinor, serviceFeeMaxMinor: row.serviceFeeMaxMinor,
  };
}
