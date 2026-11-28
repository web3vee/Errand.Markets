import Link from 'next/link';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { currencySymbol } from '@/lib/money';
import { parseMarketPhone } from '@/lib/phone';
import { minorToInput } from '@/modules/errands/domain/amount';
import { feeScheduleFor, getErrandForParticipant, stopAreas } from '@/modules/errands/service';
import { PriceSummary, rateLabel } from '@/ui/pricing/price-summary';
import { listErrandConversations, participantNames } from '@/modules/messaging/service';
import { defaultDb, requireAccount } from '@/server/context';
import { money } from '@/server/format';
import { Notice } from '@/ui/forms/fields';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Container } from '@/ui/primitives/container';
import { fulfilmentMedia, hasRated, latestDispute, ratingsForErrand, ratingSummary } from '@/modules/errands/fulfilment';
import { providerMode } from '@/providers/registry';
import { editPriceAction, publishDraftAction } from './actions';
import { FulfilmentPanel, ProofSection } from './fulfilment-panel';
import { PriceForm } from './price-form';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('errands.detailTitle') };
}

export default async function ErrandDetail({ params, searchParams }: {
  params: Promise<{ locale: string; market: string; id: string }>;
  searchParams: Promise<{ posted?: string; held?: string; draft?: string; price?: string; error?: string; f?: string; ferr?: string }>;
}) {
  const { locale, market: slug, id } = await params;
  setRequestLocale(locale);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { account, session, market } = await requireAccount(locale, slug, `/${locale}/${slug}/errands/${id}`);
  const db = defaultDb();
  const data = await getErrandForParticipant(db, session.claims, id); // RLS: customer, assigned Runner, admins
  if (!data) notFound();
  const { errand: e, stops, places, items, photos, events, category } = data;
  const t = await getTranslations();
  const format = await getFormatter();
  const sp = await searchParams;
  const isCustomer = e.customerId === account.id;
  const isRunner = e.runnerId === account.id;
  const areas = await stopAreas(db, id);
  const threads = isCustomer || isRunner ? await listErrandConversations(db, session.claims, id) : [];
  const names = await participantNames(db, [...threads.map((c) => c.runnerId), ...(e.runnerId ? [e.runnerId] : []), e.customerId]);
  const when = (d: Date) => format.dateTime(d, { dateStyle: 'medium', timeStyle: 'short', timeZone: market.timezone });
  const editable = isCustomer && (e.status === 'open' || e.status === 'draft') && e.reviewState !== 'pending_review';
  const myThread = threads.find((c) => (isRunner ? c.runnerId === account.id : c.runnerId === e.runnerId));
  const statusLabel = e.reviewState === 'pending_review' ? t('errandStatus.pending_review') : t(`errandStatus.${e.status}`);
  const row = 'border-t border-line py-4';
  // The fee schedule frozen at publication (or the current one for drafts).
  const fees = await feeScheduleFor(db, market.id, e.feeScheduleId);
  // Stage 5: fulfilment state for the panel.
  const role = isCustomer ? 'customer' as const : isRunner ? 'runner' as const : null;
  const otherId = isCustomer ? e.runnerId : e.customerId;
  const sandbox = providerMode(market.code) === 'sandbox' && process.env.VERCEL_ENV !== 'production';
  const [proofPhotos, dispute, visibleRatings, otherRated, reputation] = await Promise.all([
    fulfilmentMedia(db, session.claims, id),
    latestDispute(db, session.claims, id),
    ratingsForErrand(db, session.claims, id),
    otherId ? hasRated(db, id, otherId) : Promise.resolve(false),
    ratingSummary(db, e.runnerId ? [e.runnerId] : []),
  ]);
  const myRating = visibleRatings.find((r) => r.raterId === account.id) ?? null;
  const theirRating = visibleRatings.find((r) => r.raterId === otherId) ?? null;
  const runnerRep = e.runnerId ? reputation.get(e.runnerId) : undefined;

  return (
    <Container className="max-w-[48rem] py-12">
      <Link href={`/${locale}/${slug}/${isRunner ? 'runner/jobs' : 'errands'}`} className="inline-flex min-h-11 items-center text-small underline">{t('common.back')}</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-small text-ink-3">{t(category.nameKey)}</p>
          <h1 className="text-h1 text-balance">{e.title}</h1>
        </div>
        <Badge tone={e.status === 'open' ? 'accent' : 'neutral'} data-testid="errand-status" data-status={e.status}>{statusLabel}</Badge>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {sp.posted ? <Notice tone="success">{t('post.posted')}</Notice> : null}
        {sp.held || e.reviewState === 'pending_review' ? <Notice>{t('errands.reviewPending', { note: e.reviewNote ?? '' })}</Notice> : null}
        {e.reviewState === 'rejected' ? <Notice tone="danger">{t('errands.reviewRejected')}</Notice> : null}
        {sp.price ? <Notice tone="success">{t('errands.priceSaved')}</Notice> : null}
        {sp.error ? <Notice tone="danger">{t.has(`post.errors.${sp.error}`) ? t(`post.errors.${sp.error}` as never, { amount: '', labels: '' } as never) : t('common.error')}</Notice> : null}
        {sp.f === 'cancelled' ? <Notice tone="success">{t('fulfil.cancelled')}</Notice> : null}
        {sp.f === 'rated' ? <Notice tone="success">{t('fulfil.rated')}</Notice> : null}
        {sp.ferr ? <Notice tone="danger">{t.has(`fulfil.errors.${sp.ferr}`) ? t(`fulfil.errors.${sp.ferr}` as never) : t('common.error')}</Notice> : null}
      </div>

      {role ? (
        <FulfilmentPanel e={e} role={role} locale={locale} slug={slug} market={market} sandbox={sandbox} otherName={otherId ? names.get(otherId) ?? '' : ''}
          dispute={dispute} myRating={myRating} theirRating={theirRating} theirRatingHidden={otherRated && !theirRating} now={new Date()} />
      ) : null}

      <dl className="mt-8 border-b border-line">
        <div className={row}>
          <dt className="text-small text-ink-3">{t('errands.price')}</dt>
          <dd className="mt-1 text-h2 tabular-nums" data-testid="errand-price">{money(market, e.priceMinor)}</dd>
          {editable ? <dd><PriceForm action={editPriceAction.bind(null, locale, slug, id)} version={e.version} initial={minorToInput(e.priceMinor, market.currency.minorUnit, market.formatLocale)} symbol={currencySymbol(market.currency, market.formatLocale)} /></dd> : null}
        </div>
        <div className={row}>
          <dt className="text-small text-ink-3">{t('errands.when')}</dt>
          <dd className="mt-1">{e.windowKind === 'by_time' && e.windowEnd ? t('errands.by', { time: when(e.windowEnd) }) : t('errands.asap')}</dd>
          {e.status === 'open' && e.expiresAt ? <dd className="text-small text-ink-3">{t('errands.expires', { time: when(e.expiresAt) })}</dd> : null}
        </div>
        {e.description ? <div className={row}><dd className="whitespace-pre-line text-body">{e.description}</dd></div> : null}
        <div className={row}>
          <dt className="text-small text-ink-3">{t('errands.stops')}</dt>
          <dd>
            <ol className="mt-2 flex flex-col gap-4">
              {stops.map((s) => {
                const place = places.find((p) => p.id === s.placeId);
                const area = areas.find((a) => a.seq === s.seq);
                const phone = place?.contactPhoneE164 ? parseMarketPhone(place.contactPhoneE164, market.phone) : null;
                return (
                  <li key={s.seq}>
                    <p className="font-medium">{t(`stopKinds.${s.kind}`)} · {area ? t(area.areaNameKey) : ''}</p>
                    {place ? (
                      <>
                        <p className="text-body text-ink-2">{place.landmark}</p>
                        {place.contactName || phone ? <p className="text-small text-ink-3">{t('errands.contact')}: {place.contactName ?? ''} {phone?.ok ? <a dir="ltr" href={`tel:${place.contactPhoneE164}`} className="underline">{phone.national}</a> : null}</p> : null}
                      </>
                    ) : null}
                    {s.instructions ? <p className="text-small text-ink-2">{s.instructions}</p> : null}
                  </li>
                );
              })}
            </ol>
          </dd>
        </div>
        {items.length ? (
          <div className={row}>
            <dt className="text-small text-ink-3">{t('errands.items')}</dt>
            <dd>
              <ul className="mt-2">{items.map((i) => <li key={i.id} className="flex justify-between gap-4"><span>{i.qty} × {i.name}</span><span className="tabular-nums">{money(market, i.estUnitPriceMinor * BigInt(i.qty))}</span></li>)}</ul>
              <p className="mt-2 text-small text-ink-3">{t('errands.itemsTotal', { amount: money(market, e.itemEstimateMinor) })}</p>
            </dd>
          </div>
        ) : null}
        {photos.length ? (
          <div className={row}>
            <dt className="text-small text-ink-3">{t('errands.photos')}</dt>
            <dd className="mt-2 flex flex-wrap gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {photos.map((p) => <a key={p.id} href={`/api/media/${p.id}`}><img src={`/api/media/${p.id}`} alt="" width={p.width} height={p.height} loading="lazy" className="size-28 rounded-md border border-line object-cover" /></a>)}
            </dd>
          </div>
        ) : null}
      </dl>

      {role ? <ProofSection role={role} photos={proofPhotos} e={e} market={market} /> : null}

      {isCustomer ? (
        <div className="mt-6">
          <PriceSummary testId="errand-summary" errandFeeMinor={e.priceMinor} itemEstimateMinor={e.itemEstimateMinor} fees={fees} rounding={market.roundingMode}
            currency={market.currency} formatLocale={market.formatLocale}
            labels={{ title: t('pricing.title'), errandFee: t('pricing.errandFee'), serviceFee: t('pricing.serviceFee', { rate: rateLabel(fees.serviceFeeBps, market.formatLocale) }), items: t('pricing.items'), total: t('pricing.total'), note: t('pricing.whenPaid') }} />
        </div>
      ) : null}

      {isCustomer && e.status === 'draft' && e.reviewState === 'none' ? (
        <form action={publishDraftAction.bind(null, locale, slug, id)} className="mt-6"><Button type="submit" size="lg">{t('errands.publish')}</Button></form>
      ) : null}

      {(isRunner || (isCustomer && e.runnerId)) && myThread ? (
        <section className="mt-10" aria-labelledby="runner-h">
          <h2 id="runner-h" className="text-h3">{isRunner ? t('nav.messages') : t('errands.runner')}</h2>
          <p className="mt-2 flex flex-wrap items-center gap-3">
            <span>{isRunner ? names.get(e.customerId) : names.get(e.runnerId!)}</span>
            {!isRunner ? <span className="text-small text-ink-3" data-testid="runner-rating">{runnerRep ? t('fulfil.ratingSummary', { avg: format.number(runnerRep.avg, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), count: runnerRep.count }) : t('fulfil.noRatings')}</span> : null}
            <Button asChild variant="secondary"><Link href={`/${locale}/${slug}/messages/${myThread.id}`}>{t('errands.chat')}</Link></Button>
          </p>
        </section>
      ) : null}

      {isCustomer ? (
        <section className="mt-10" aria-labelledby="q-h">
          <h2 id="q-h" className="text-h3">{t('errands.questions')}</h2>
          {threads.filter((c) => c.runnerId !== e.runnerId).length === 0 ? <p className="mt-2 text-small text-ink-3">{t('errands.noQuestions')}</p> : (
            <ul className="mt-2 border-b border-line">
              {threads.filter((c) => c.runnerId !== e.runnerId).map((c) => (
                <li key={c.id} className="border-t border-line">
                  <Link href={`/${locale}/${slug}/messages/${c.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2 hover:bg-sunken">
                    <span>{names.get(c.runnerId)}</span>{c.unread ? <Badge tone="accent">{t('chat.new')}</Badge> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

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
