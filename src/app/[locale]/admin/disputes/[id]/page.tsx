import Link from 'next/link';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { ErrandError, getErrandForParticipant } from '@/modules/errands/service';
import { fulfilmentMedia, getDispute, resolveDispute, type DisputeOutcome } from '@/modules/errands/fulfilment';
import { participantNames } from '@/modules/messaging/service';
import { defaultDb, getMarketById, requireAdmin } from '@/server/context';
import { money } from '@/server/format';
import { onDisputeResolved } from '@/server/workflows';
import { Notice, Radio, Textarea } from '@/ui/forms/fields';
import { SubmitButton } from '@/ui/forms/submit-button';
import { Badge } from '@/ui/primitives/badge';
import { Container } from '@/ui/primitives/container';

export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('adminDisputes.title') };
}

async function resolve(locale: string, disputeId: string, form: FormData) {
  'use server';
  const { account, scope } = await requireAdmin('ops');
  const outcome = String(form.get('outcome') ?? '') as DisputeOutcome;
  let q = 'done=1';
  try {
    const r = await resolveDispute(defaultDb(), { adminId: account.id, adminScope: scope, disputeId, outcome, note: String(form.get('note') ?? '') });
    await onDisputeResolved(r);
  } catch (e) {
    if (!(e instanceof ErrandError)) throw e;
    q = `error=${encodeURIComponent(e.code)}`;
  }
  redirect(`/${locale}/admin/disputes/${disputeId}?${q}`);
}

export default async function DisputeDetail({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { session } = await requireAdmin('ops');
  const db = defaultDb();
  const d = await getDispute(db, session.claims, id); // RLS: admin's markets only
  if (!d) notFound();
  const data = await getErrandForParticipant(db, session.claims, d.errandId);
  if (!data) notFound();
  const { errand: e, events } = data;
  const m = (await getMarketById(e.marketId))!;
  const t = await getTranslations();
  const format = await getFormatter();
  const sp = await searchParams;
  const when = (x: Date) => format.dateTime(x, { dateStyle: 'medium', timeStyle: 'short', timeZone: m.timezone });
  const names = await participantNames(db, [e.customerId, ...(e.runnerId ? [e.runnerId] : []), d.raisedBy]);
  const photos = await fulfilmentMedia(db, session.claims, e.id);
  const row = 'border-t border-line py-3';
  return (
    <Container className="max-w-[48rem] py-10">
      <Link href={`/${locale}/admin/disputes`} className="inline-flex min-h-11 items-center text-small underline">{t('adminDisputes.back')}</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 text-h1 text-balance">{e.title}</h1>
        <Badge tone={d.status === 'open' ? 'accent' : 'neutral'} data-testid="dispute-status">{t(`adminDisputes.statuses.${d.status}`)}</Badge>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {sp.done ? <Notice tone="success">{t('adminDisputes.done')}</Notice> : null}
        {sp.error ? <Notice tone="danger">{t.has(`adminDisputes.errors.${sp.error}`) ? t(`adminDisputes.errors.${sp.error}` as never) : t('common.error')}</Notice> : null}
      </div>
      <dl className="mt-6 border-b border-line text-small">
        <div className={row}><dt className="text-ink-3">{t('adminDisputes.reason')}</dt><dd className="mt-1 text-body">{t(`fulfil.reasons.${d.reasonCode}` as never)} · {t('adminDisputes.raisedBy', { role: t(`adminDisputes.roles.${d.raisedRole}`) })} ({names.get(d.raisedBy)}) · <span className="tabular-nums">{when(d.createdAt)}</span></dd></div>
        {d.details ? <div className={row}><dt className="text-ink-3">{t('adminDisputes.details')}</dt><dd className="mt-1 whitespace-pre-line text-body">{d.details}</dd></div> : null}
        <div className={row}><dt className="text-ink-3">{t('adminDisputes.stageWhenRaised')}</dt><dd className="mt-1 text-body">{t(`errandStatus.${d.fromStatus}`)}</dd></div>
        <div className={row}><dt className="text-ink-3">{t('adminDisputes.errand')}</dt><dd className="mt-1 text-body">{names.get(e.customerId)} → {e.runnerId ? names.get(e.runnerId) : '—'} · <span className="tabular-nums">{money(m, e.priceMinor)}</span>{e.requiresPurchase ? ` · ${t('fulfil.itemsSpent', { actual: e.itemActualMinor !== null ? money(m, e.itemActualMinor) : '—', estimate: money(m, e.itemEstimateMinor) })}` : ''}</dd></div>
        {photos.length ? (
          <div className={row}><dt className="text-ink-3">{t('fulfil.proofTitle')}</dt>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <dd className="mt-2 flex flex-wrap gap-3">{photos.map((p) => <a key={p.id} href={`/api/media/${p.id}`}><img src={`/api/media/${p.id}`} alt="" loading="lazy" className="size-24 rounded-md border border-line object-cover" /></a>)}</dd>
          </div>
        ) : null}
      </dl>

      {d.status === 'resolved' && d.resolvedAt && d.outcome ? (
        <p className="mt-6 text-body">{t('adminDisputes.resolved', { when: when(d.resolvedAt), outcome: t(`adminDisputes.outcomes.${d.outcome}`) })}{d.resolutionNote ? ` · ${d.resolutionNote}` : ''}</p>
      ) : (
        <form action={resolve.bind(null, locale, d.id)} className="mt-8 flex flex-col gap-3">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-small font-medium">{t('adminDisputes.outcome')}</legend>
            <Radio name="outcome" value="release_runner" required label={t('adminDisputes.release')} />
            <Radio name="outcome" value="refund_customer" required label={t('adminDisputes.refund')} />
          </fieldset>
          <p className="text-small text-ink-3">{t('adminDisputes.moneyNote')}</p>
          <label className="flex flex-col gap-1.5 text-small font-medium">{t('adminDisputes.note')}<Textarea name="note" maxLength={1000} rows={3} /></label>
          <SubmitButton className="self-start">{t('adminDisputes.submit')}</SubmitButton>
        </form>
      )}

      <section className="mt-10" aria-labelledby="tl-h">
        <h2 id="tl-h" className="text-h3">{t('errands.timeline')}</h2>
        <ol className="mt-2 border-b border-line">
          {events.map((ev) => (
            <li key={ev.id} className="flex justify-between gap-4 border-t border-line py-2 text-small">
              <span>{t.has(`errands.events.${ev.event}`) ? t(`errands.events.${ev.event}` as never) : ev.event}</span>
              <span className="tabular-nums text-ink-3">{when(ev.at)}</span>
            </li>
          ))}
        </ol>
      </section>
    </Container>
  );
}
