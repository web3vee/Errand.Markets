import 'server-only';
import { eq } from 'drizzle-orm';
import { errands } from '../../db/schema';
import { expireDueErrands, runnersForAreas, stopAreas, type acceptErrand, type reviewHeldErrand } from '@/modules/errands/service';
import { notify, type NotificationType } from '@/modules/notifications/service';
import { defaultDb, getMarketById } from './context';
import { deliverNotification } from './deliver-notification';
import { enqueue, registerInline } from './jobs';

/** Side effects after state changes: notifications (and later: payments, timers). */
async function send(userIds: string[], marketId: string, type: NotificationType, payload: Record<string, unknown>, coalesceKey?: string) {
  const deliveryIds = await notify(defaultDb(), { userIds, marketId, type, payload, coalesceKey });
  for (const id of deliveryIds) await enqueue('notifications/deliver', { deliveryId: id });
}

async function priceFields(marketId: string, priceMinor: bigint) {
  const m = await getMarketById(marketId);
  return { priceMinor: priceMinor.toString(), currency: m?.currency.code, minorUnit: m?.currency.minorUnit, displaySymbol: m?.currency.displaySymbol, formatLocale: m?.formatLocale, marketSlug: m?.slug };
}
const path = (slug: string | undefined, rest: string) => `/en/${slug ?? ''}${rest}`;

export async function onErrandPublished(errandId: string) {
  await enqueue('errands/published', { errandId });
}

/** Fan-out: tell verified Runners serving the errand's areas (push + in-app, no SMS). */
export async function fanOutPublished(errandId: string) {
  const db = defaultDb();
  const [e] = await db.select().from(errands).where(eq(errands.id, errandId));
  if (!e || e.status !== 'open') return;
  const areas = [...new Set((await stopAreas(db, errandId)).map((a) => a.areaId))];
  const runners = await runnersForAreas(db, e.marketId, areas, e.customerId);
  const pf = await priceFields(e.marketId, e.priceMinor);
  await send(runners, e.marketId, 'errand_nearby', { title: e.title, errandId, ...pf, url: path(pf.marketSlug, `/runner/errands/${errandId}`) });
}

export async function onAccepted(r: Awaited<ReturnType<typeof acceptErrand>>, runnerName: string) {
  const m = await getMarketById(r.marketId);
  await send([r.customerId], r.marketId, 'errand_accepted', { title: r.title, runner: runnerName, errandId: r.errandId, url: path(m?.slug, `/errands/${r.errandId}`) });
  await send(r.otherRunnerIds, r.marketId, 'errand_taken', { title: r.title, errandId: r.errandId, url: path(m?.slug, '/runner/errands') });
}

export async function onMessage(m: { recipientId: string; marketId: string; conversationId: string; senderName: string; preview: string }) {
  const market = await getMarketById(m.marketId);
  await send([m.recipientId], m.marketId, 'new_message', {
    sender: m.senderName, preview: m.preview.slice(0, 80), conversationId: m.conversationId, url: path(market?.slug, `/messages/${m.conversationId}`),
  }, `conversation:${m.conversationId}`);
}

export async function onReviewed(r: Awaited<ReturnType<typeof reviewHeldErrand>>, errandId: string) {
  const m = await getMarketById(r.marketId);
  await send([r.customerId], r.marketId, r.decision === 'clear' ? 'errand_review_cleared' : 'errand_review_rejected', { title: r.title, errandId, url: path(m?.slug, `/errands/${errandId}`) });
  if (r.decision === 'clear') await onErrandPublished(errandId);
}

export async function onKycDecision(userId: string, marketId: string, runnerStatus: string) {
  const type: NotificationType | null = runnerStatus === 'approved' ? 'kyc_approved' : runnerStatus === 'rejected' ? 'kyc_rejected' : runnerStatus === 'resubmission_required' ? 'kyc_resubmission' : null;
  if (!type) return;
  const m = await getMarketById(marketId);
  await send([userId], marketId, type, { url: path(m?.slug, '/runner/verify') });
}

/** Cron (Inngest every 5 min; Vercel Cron backstop). */
export async function sweep(now = new Date()) {
  const expired = await expireDueErrands(defaultDb(), now);
  for (const e of expired) {
    const m = await getMarketById(e.marketId);
    await send([e.customerId], e.marketId, 'errand_expired', { title: e.title, errandId: e.id, url: path(m?.slug, `/errands/${e.id}`) });
  }
  return { expired: expired.length };
}

registerInline('notifications/deliver', ({ deliveryId }) => deliverNotification(deliveryId));
registerInline('errands/published', ({ errandId }) => fanOutPublished(errandId));
