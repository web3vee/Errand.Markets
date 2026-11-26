'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { formatMoney } from '@/lib/money';
import { parseMarketPhone } from '@/lib/phone';
import { zonedLocalToUtc } from '@/lib/time';
import { parseAmountToMinor } from '@/modules/errands/domain/amount';
import { createErrand, ErrandError, type StopInput } from '@/modules/errands/service';
import { hitRateLimit } from '@/modules/platform/rate-limit';
import { defaultDb, requireAccount } from '@/server/context';
import { onErrandPublished } from '@/server/workflows';

export type PostState = { error?: string; field?: string } | null;

const Stop = z.object({
  kind: z.enum(['pickup', 'purchase', 'collect', 'dropoff']),
  serviceAreaId: z.string().uuid(),
  lat: z.number().nullable(), lng: z.number().nullable(), pinSource: z.enum(['area_center', 'device', 'map']),
  landmark: z.string().trim().min(3).max(200),
  contactName: z.string().trim().max(60).nullable(), contactPhone: z.string().trim().max(32).nullable(),
  instructions: z.string().trim().max(300).nullable(),
});
const Payload = z.object({
  categoryKey: z.string().regex(/^[a-z_]+$/),
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().max(2000),
  requiresPurchase: z.boolean(),
  items: z.array(z.object({ name: z.string().trim().min(1).max(80), qty: z.number().int().min(1).max(999), price: z.string().max(20) })).max(30),
  stops: z.array(Stop).min(1).max(3),
  price: z.string().max(20),
  windowKind: z.enum(['asap', 'by_time']),
  windowLocal: z.string().max(20).nullable(),
  mediaIds: z.array(z.string().uuid()).max(3),
  publish: z.boolean(),
});

export async function postErrandAction(locale: string, marketSlug: string, _prev: PostState, form: FormData): Promise<PostState> {
  const { account, market } = await requireAccount(locale, marketSlug, `/${locale}/${marketSlug}/errands/new`);
  const t = await getTranslations({ locale });
  const fmt = (m: bigint) => formatMoney(m, market.currency, market.formatLocale);
  let raw: unknown;
  try { raw = JSON.parse(String(form.get('payload') ?? '')); } catch { return { error: t('common.error') }; }
  const parsed = Payload.safeParse(raw);
  if (!parsed.success) {
    const f = String(parsed.error.issues[0]?.path[0] ?? '');
    const key = f === 'title' ? 'title' : f === 'description' ? 'description' : f === 'stops' ? 'landmark' : null;
    return { error: key ? t(`post.errors.${key}`) : t('common.error'), field: f };
  }
  const p = parsed.data;
  const limit = await hitRateLimit(defaultDb(), `post:${account.id}`, 20, 3600);
  if (!limit.allowed) return { error: t('auth.errors.rate_limited', { minutes: Math.ceil(limit.retryAfterSeconds / 60) }) };

  const priceMinor = parseAmountToMinor(p.price, market.currency.minorUnit, market.formatLocale);
  if (priceMinor === null) return { error: t('post.errors.amount'), field: 'price' };
  const items = [];
  for (const i of p.requiresPurchase ? p.items : []) {
    const unit = parseAmountToMinor(i.price, market.currency.minorUnit, market.formatLocale);
    if (unit === null) return { error: t('post.errors.amount'), field: 'items' };
    items.push({ name: i.name, qty: i.qty, estUnitPriceMinor: unit });
  }
  const stops: StopInput[] = [];
  for (const s of p.stops) {
    let phone: string | null = null;
    if (s.contactPhone) {
      const r = parseMarketPhone(s.contactPhone, market.phone);
      if (!r.ok) return { error: t('post.errors.phone'), field: 'stops' };
      phone = r.e164;
    }
    stops.push({ kind: s.kind, serviceAreaId: s.serviceAreaId, lat: s.lat, lng: s.lng, pinSource: s.pinSource, landmark: s.landmark,
      contactName: s.contactName || null, contactPhoneE164: phone, instructions: s.instructions || null });
  }
  const windowEnd = p.windowKind === 'by_time' && p.windowLocal ? zonedLocalToUtc(p.windowLocal, market.timezone) : null;
  if (p.windowKind === 'by_time' && !windowEnd) return { error: t('post.errors.invalid_window'), field: 'window' };

  let outcome;
  try {
    outcome = await createErrand(defaultDb(), {
      customerId: account.id, marketId: market.id, categoryKey: p.categoryKey, title: p.title, description: p.description, priceMinor,
      requiresPurchase: p.requiresPurchase, items, stops, windowKind: p.windowKind, windowEnd, mediaIds: p.mediaIds, publish: p.publish,
    });
  } catch (e) {
    if (e instanceof ErrandError) {
      const d = e.detail ?? {};
      const values = { amount: d.min !== undefined ? fmt(d.min as bigint) : d.max !== undefined ? fmt(d.max as bigint) : '', labels: Array.isArray(d.labels) ? (d.labels as string[]).join(', ') : '' };
      return { error: t.has(`post.errors.${e.code}`) ? t(`post.errors.${e.code}` as never, values as never) : t('common.error') };
    }
    throw e;
  }
  if (outcome.status === 'open') await onErrandPublished(outcome.errandId);
  redirect(`/${locale}/${marketSlug}/errands/${outcome.errandId}?${outcome.heldForReview ? 'held=1' : outcome.status === 'open' ? 'posted=1' : 'draft=1'}`);
}
