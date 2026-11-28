import Link from 'next/link';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { listNotifications, markAllRead } from '@/modules/notifications/service';
import { defaultDb, getSession, requireAccount } from '@/server/context';
import { renderNotification } from '@/server/render-notification';
import { Button } from '@/ui/primitives/button';
import { Container } from '@/ui/primitives/container';
import { PushToggle } from '@/ui/pwa/push-toggle';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('notificationsPage.title') };
}

async function markAllAction() {
  'use server';
  const s = await getSession();
  if (s) await markAllRead(defaultDb(), s.claims);
  revalidatePath('/', 'layout');
}

export default async function NotificationsPage({ params }: { params: Promise<{ locale: string; market: string }> }) {
  const { locale, market: slug } = await params;
  setRequestLocale(locale);
  const { account, session, market } = await requireAccount(locale, slug, `/${locale}/${slug}/notifications`);
  const t = await getTranslations();
  const format = await getFormatter();
  const rows = await listNotifications(defaultDb(), session.claims);
  return (
    <Container className="max-w-[44rem] py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1">{t('notificationsPage.title')}</h1>
        {rows.some((r) => !r.readAt) ? <form action={markAllAction}><Button type="submit" variant="ghost">{t('notificationsPage.markAll')}</Button></form> : null}
      </div>
      <section className="mt-6 rounded-lg border border-line bg-surface p-4" aria-labelledby="push-h">
        <h2 id="push-h" className="text-small font-medium">{t('notificationsPage.pushTitle')}</h2>
        <div className="mt-2"><PushToggle vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} /></div>
      </section>
      {rows.length === 0 ? <p className="mt-8 text-body text-ink-2">{t('notificationsPage.empty')}</p> : (
        <ul className="mt-8 border-b border-line" data-testid="notifications">
          {rows.map((n) => {
            const text = renderNotification(account.locale, n.type, n.payload as Record<string, unknown>);
            const url = String((n.payload as { url?: string }).url ?? '#');
            return (
              <li key={n.id} className="border-t border-line">
                <Link href={url.startsWith('/') ? url : '#'} className="flex min-h-16 items-start justify-between gap-4 py-3 hover:bg-sunken">
                  <span className="min-w-0">
                    <span className={`block ${n.readAt ? 'font-medium' : 'font-semibold'}`}>{!n.readAt ? <span className="me-2 inline-block size-2 rounded-full bg-accent align-middle" aria-hidden /> : null}{text.title}</span>
                    <span className="block text-small text-ink-2">{text.body}</span>
                  </span>
                  <span className="shrink-0 text-micro text-ink-3">{format.dateTime(n.createdAt, { dateStyle: 'medium', timeStyle: 'short', timeZone: market.timezone })}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Container>
  );
}
