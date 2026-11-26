import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { errands } from '../../../../../../../db/schema';
import { getThread, hasBlocked, participantNames, REPORT_REASONS } from '@/modules/messaging/service';
import { markReadByKey } from '@/modules/notifications/service';
import { defaultDb, requireAccount } from '@/server/context';
import { Notice, Select, Textarea } from '@/ui/forms/fields';
import { Button } from '@/ui/primitives/button';
import { Container } from '@/ui/primitives/container';
import { blockAction, reportAction, sendMessageAction } from '../actions';
import { Thread } from './thread';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('chat.inbox') };
}

export default async function ThreadPage({ params, searchParams }: { params: Promise<{ locale: string; market: string; id: string }>; searchParams: Promise<{ reported?: string }> }) {
  const { locale, market: slug, id } = await params;
  setRequestLocale(locale);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { account, session, market } = await requireAccount(locale, slug, `/${locale}/${slug}/messages/${id}`);
  const db = defaultDb();
  const thread = await getThread(db, session.claims, id); // RLS: participants (and support admins)
  if (!thread) notFound();
  await markReadByKey(db, session.claims, `conversation:${id}`);
  const t = await getTranslations();
  const c = thread.conversation;
  const otherId = c.customerId === account.id ? c.runnerId : c.customerId;
  const names = await participantNames(db, [c.customerId, c.runnerId]);
  const [e] = await db.select({ title: errands.title }).from(errands).where(eq(errands.id, c.errandId));
  const iBlocked = await hasBlocked(db, account.id, otherId);
  const isParticipant = c.customerId === account.id || c.runnerId === account.id;
  const errandHref = c.customerId === account.id || c.runnerId === account.id
    ? (c.runnerId === account.id ? `/${locale}/${slug}/runner/errands/${c.errandId}` : `/${locale}/${slug}/errands/${c.errandId}`) : '#';
  return (
    <Container className="max-w-[40rem] py-8">
      <Link href={`/${locale}/${slug}/messages`} className="inline-flex min-h-11 items-center text-small underline">{t('chat.inbox')}</Link>
      <h1 className="mt-2 text-h2">{names.get(otherId)}</h1>
      <p className="text-small text-ink-2"><Link href={errandHref} className="underline">{t('chat.about', { title: e?.title ?? '' })}</Link></p>
      {(await searchParams).reported ? <div className="mt-4"><Notice tone="success">{t('chat.reported')}</Notice></div> : null}
      {iBlocked ? <div className="mt-4"><Notice>{t('chat.blocked')}</Notice></div> : null}
      <Thread
        conversationId={id} me={account.id} readOnly={c.status !== 'open' || !isParticipant} locale={market.formatLocale} timeZone={market.timezone}
        initial={thread.messages.map((m) => ({ id: m.id, senderId: m.senderId, body: m.body, mediaId: m.mediaId, createdAt: m.createdAt.toISOString() }))}
        action={sendMessageAction.bind(null, locale, slug, id)} names={Object.fromEntries(names)}
      />
      {isParticipant ? (
        <details className="mt-10 border-t border-line pt-4">
          <summary className="inline-flex min-h-11 items-center text-small text-ink-2 underline">{t('chat.report')} / {iBlocked ? t('chat.unblock') : t('chat.block')}</summary>
          <form action={reportAction.bind(null, locale, slug, id)} className="mt-4 flex flex-col gap-3">
            <p className="text-small font-medium">{t('chat.reportTitle')}</p>
            <label className="flex flex-col gap-1.5 text-small">{t('chat.reportReason')}
              <Select name="reason" required defaultValue="">{[<option key="" value="">—</option>, ...REPORT_REASONS.map((r) => <option key={r} value={r}>{t(`chat.reasons.${r}`)}</option>)]}</Select>
            </label>
            <label className="flex flex-col gap-1.5 text-small">{t('chat.reportDetails')}<Textarea name="details" maxLength={1000} /></label>
            <Button type="submit" variant="secondary" className="self-start">{t('chat.reportSubmit')}</Button>
          </form>
          <form action={blockAction.bind(null, locale, slug, id, iBlocked)} className="mt-6">
            <Button type="submit" variant="ghost">{iBlocked ? t('chat.unblock') : t('chat.block')}</Button>
          </form>
        </details>
      ) : null}
    </Container>
  );
}
