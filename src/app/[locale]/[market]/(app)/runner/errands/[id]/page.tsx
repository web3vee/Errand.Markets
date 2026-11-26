import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { openErrandForRunner } from '@/modules/errands/service';
import { defaultDb } from '@/server/context';
import { money } from '@/server/format';
import { requireVerifiedRunner } from '@/server/runner-guard';
import { Notice } from '@/ui/forms/fields';
import { Button } from '@/ui/primitives/button';
import { Container } from '@/ui/primitives/container';
import { askAction } from '../actions';
import { acceptAction } from '../actions';
import { AcceptForm } from '../accept-form';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('runnerMarket.title') };
}

export default async function OpenErrand({ params, searchParams }: { params: Promise<{ locale: string; market: string; id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { locale, market: slug, id } = await params;
  setRequestLocale(locale);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { account, market, verified } = await requireVerifiedRunner(locale, slug, `/${locale}/${slug}/runner/errands/${id}`);
  if (!verified) redirect(`/${locale}/${slug}/runner/errands`);
  const t = await getTranslations();
  const e = await openErrandForRunner(defaultDb(), account.id, market.id, id);
  if (!e) {
    return (
      <Container className="max-w-[40rem] py-12">
        <Notice>{t('runnerMarket.errors.not_open')}</Notice>
        <Button asChild variant="secondary" className="mt-6"><Link href={`/${locale}/${slug}/runner/errands`}>{t('common.back')}</Link></Button>
      </Container>
    );
  }
  const err = (await searchParams).error;
  return (
    <Container className="max-w-[44rem] py-12">
      <Link href={`/${locale}/${slug}/runner/errands`} className="inline-flex min-h-11 items-center text-small underline">{t('common.back')}</Link>
      <p className="mt-2 text-small text-ink-3">{t(e.categoryNameKey)}</p>
      <h1 className="text-h1 text-balance">{e.title}</h1>
      <p className="mt-4 text-h2 tabular-nums">{money(market, e.priceMinor)}</p>
      {e.requiresPurchase ? <p className="text-small text-ink-3">{t('runnerMarket.itemsEstimate', { amount: money(market, e.itemEstimateMinor) })}</p> : null}
      {err ? <div className="mt-4"><Notice tone="danger">{t.has(`chat.errors.${err}`) ? t(`chat.errors.${err}` as never) : t('common.error')}</Notice></div> : null}
      <dl className="mt-8 border-b border-line">
        {e.description ? <div className="border-t border-line py-4"><dd className="whitespace-pre-line">{e.description}</dd></div> : null}
        <div className="border-t border-line py-4">
          <dt className="text-small text-ink-3">{t('errands.stops')}</dt>
          <dd><ol className="mt-2 flex flex-col gap-1">{e.stops.map((s, i) => <li key={i}>{t(`stopKinds.${s.kind}`)} · {t(s.nameKey)}</li>)}</ol></dd>
        </div>
        <div className="border-t border-line py-4">
          <dt className="text-small text-ink-3">{t('errands.when')}</dt>
          <dd>{e.windowKind === 'by_time' && e.windowEnd ? t('errands.by', { time: new Intl.DateTimeFormat(market.formatLocale, { dateStyle: 'medium', timeStyle: 'short', timeZone: market.timezone }).format(e.windowEnd) }) : t('errands.asap')}</dd>
        </div>
        {e.items.length ? (
          <div className="border-t border-line py-4">
            <dt className="text-small text-ink-3">{t('errands.items')}</dt>
            <dd><ul className="mt-2">{e.items.map((i, k) => <li key={k} className="flex justify-between gap-4"><span>{i.qty} × {i.name}</span><span className="tabular-nums">{money(market, i.estUnitPriceMinor * BigInt(i.qty))}</span></li>)}</ul></dd>
          </div>
        ) : null}
        {e.photoIds.length ? (
          <div className="border-t border-line py-4">
            <dt className="text-small text-ink-3">{t('errands.photos')}</dt>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <dd className="mt-2 flex flex-wrap gap-3">{e.photoIds.map((p) => <img key={p} src={`/api/media/${p}`} alt="" loading="lazy" className="size-28 rounded-md border border-line object-cover" />)}</dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-start">
        <AcceptForm action={acceptAction.bind(null, locale, slug, id)} priceMinor={e.priceMinor.toString()} label={t('runnerMarket.accept', { amount: money(market, e.priceMinor, true) })} />
        <form action={askAction.bind(null, locale, slug, id)}><Button type="submit" size="lg" variant="secondary">{t('runnerMarket.ask')}</Button></form>
      </div>
      <p className="mt-3 text-small text-ink-3">{t('runnerMarket.acceptHelp')}</p>
    </Container>
  );
}
