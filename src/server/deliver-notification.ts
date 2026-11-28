import 'server-only';
import { eq } from 'drizzle-orm';
import { asSystem } from '../../db/client';
import { notificationDeliveries, notifications, pushSubscriptions, users } from '../../db/schema';
import { providerContext, pushProvider, smsFor } from '@/providers/registry';
import { defaultDb, getMarketById, providerDeps } from './context';
import { renderNotification } from './render-notification';

/** Deliver one queued notification (push or SMS). Idempotent: only `queued` deliveries are sent. */
export async function deliverNotification(deliveryId: string) {
  const db = defaultDb();
  const row = await asSystem(db, 'notifications.deliver load', async (tx) => {
    const [d] = await tx.select().from(notificationDeliveries).where(eq(notificationDeliveries.id, deliveryId)).for('update');
    if (!d || d.status !== 'queued') return null;
    const [n] = await tx.select().from(notifications).where(eq(notifications.id, d.notificationId));
    const [u] = await tx.select({ phone: users.phoneE164, locale: users.locale, status: users.status }).from(users).where(eq(users.id, n!.userId));
    return { d, n: n!, u: u! };
  });
  if (!row) return { skipped: true };
  const { d, n, u } = row;
  const market = await getMarketById(n.marketId);
  const finish = (status: 'sent' | 'failed' | 'skipped', extra: { providerRef?: string; error?: string } = {}) =>
    asSystem(db, 'notifications.deliver finish', (tx) => tx.update(notificationDeliveries).set({ status, sentAt: status === 'sent' ? new Date() : null, ...extra }).where(eq(notificationDeliveries.id, d.id)));
  if (!market || u.status !== 'active') return finish('skipped', { error: 'inactive' });

  const text = renderNotification(u.locale, n.type, n.payload as Record<string, unknown>);
  const url = String((n.payload as { url?: string }).url ?? `/${u.locale}/${market.slug}/notifications`);
  const deps = providerDeps(market, u.locale);
  try {
    if (d.channel === 'sms') {
      if (!u.phone) return finish('skipped', { error: 'no_phone' }); // Google account without a phone yet
      const r = await smsFor(market, deps).send(providerContext(market, u.locale), { toE164: u.phone, body: text.sms, purpose: 'transactional' });
      return finish('sent', { providerRef: r.providerRef });
    }
    const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, n.userId));
    if (!subs.length) return finish('skipped', { error: 'no_subscription' });
    const push = pushProvider(deps.writeOutbox);
    let sent = 0;
    for (const s of subs) {
      const r = await push.send(s, { title: text.title, body: text.body, url, tag: (n.payload as { coalesceKey?: string }).coalesceKey ?? n.type });
      if (r.ok) sent++;
      else if (r.gone) await asSystem(db, 'push.prune gone subscription', (tx) => tx.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id)));
    }
    return finish(sent ? 'sent' : 'failed', sent ? {} : { error: 'all_push_failed' });
  } catch (e) {
    await finish('failed', { error: String((e as Error).message).slice(0, 300) });
    throw e; // let the job runner retry
  }
}
