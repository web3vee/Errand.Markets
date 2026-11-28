import Link from 'next/link';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { listConversations, participantNames } from '@/modules/messaging/service';
import { defaultDb, requireAccount } from '@/server/context';
import { Badge } from '@/ui/primitives/badge';
import { Container } from '@/ui/primitives/container';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('chat.inbox') };
}

export default async function Inbox({ params }: { params: Promise<{ locale: string; market: string }> }) {
  const { locale, market: slug } = await params;
  setRequestLocale(locale);
  const { account, session, market } = await requireAccount(locale, slug, `/${locale}/${slug}/messages`);
  const t = await getTranslations();
  const format = await getFormatter();
  const rows = await listConversations(defaultDb(), session.claims);
  const names = await participantNames(defaultDb(), rows.flatMap((r) => [r.customerId, r.runnerId]));
  return (
    <Container className="max-w-[44rem] py-12">
      <h1 className="text-h1">{t('chat.inbox')}</h1>
      {rows.length === 0 ? <p className="mt-8 text-body text-ink-2">{t('chat.empty')}</p> : (
        <ul className="mt-8 border-b border-line">
          {rows.map((r) => {
            const other = r.customerId === account.id ? r.runnerId : r.customerId;
            return (
              <li key={r.id} className="border-t border-line">
                <Link href={`/${locale}/${slug}/messages/${r.id}`} className="flex min-h-16 items-center justify-between gap-4 py-3 hover:bg-sunken">
                  <span className="min-w-0">
                    <span className={`block truncate ${r.unread ? 'font-semibold' : 'font-medium'}`}>{names.get(other)}</span>
                    <span className="block truncate text-small text-ink-3">{t('chat.about', { title: r.errandTitle })}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {r.lastMessageAt ? <span className="text-micro text-ink-3">{format.dateTime(r.lastMessageAt, { dateStyle: 'medium', timeStyle: 'short', timeZone: market.timezone })}</span> : null}
                    {r.unread ? <Badge tone="accent">{t('chat.new')}</Badge> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Container>
  );
}
