import { getTranslations, setRequestLocale } from 'next-intl/server';
import { areasWithBoundaries, feeScheduleFor, marketplaceConfig } from '@/modules/errands/service';
import { serializeFees } from '@/ui/pricing/price-summary';
import { currencySymbol } from '@/lib/money';
import { defaultDb, requireAccount } from '@/server/context';
import { money, tzLabel } from '@/server/format';
import { Notice } from '@/ui/forms/fields';
import { Container } from '@/ui/primitives/container';
import { postErrandAction } from './actions';
import { PostErrandForm } from './form';
import { localized } from '@/lib/localized-text';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('post.title') };
}

export default async function NewErrand({ params, searchParams }: { params: Promise<{ locale: string; market: string }>; searchParams: Promise<{ category?: string }> }) {
  const { locale, market: slug } = await params;
  setRequestLocale(locale);
  const { market } = await requireAccount(locale, slug, `/${locale}/${slug}/errands/new`);
  const t = await getTranslations();
  const db = defaultDb();
  const { fees } = await marketplaceConfig(db, market.id);
  const areas = await areasWithBoundaries(db, market.id);
  const cats = market.categories.filter((c) => c.active).sort((a, b) => a.sort - b.sort);
  const initial = (await searchParams).category;
  return (
    <Container className="max-w-[44rem] py-12">
      <h1 className="text-h1">{t('post.title')}</h1>
      <p className="mt-3 text-body text-ink-2">{t('post.lead')}</p>
      {areas.some((a) => a.boundaryStatus === 'approximate') ? <div className="mt-4"><Notice>{t('market2.approxAreas')}</Notice></div> : null}
      <PostErrandForm
        action={postErrandAction.bind(null, locale, slug)}
        categories={cats.map((c) => ({ key: c.key, name: t(c.nameKey), description: t(c.descriptionKey), purchaseAllowed: c.purchaseAllowed }))}
        areas={areas.map((a) => ({ id: a.id, name: localized(a.name, locale), boundary: a.boundary }))}
        currencyCode={market.currency.code}
        currencySymbol={currencySymbol(market.currency, market.formatLocale)}
        minPriceLabel={fees.minErrandPriceMinor !== null ? money(market, fees.minErrandPriceMinor, true) : null}
        timezoneLabel={tzLabel(market.timezone, market.formatLocale)}
        initialCategory={cats.some((c) => c.key === initial) ? initial! : null}
        formatLocale={market.formatLocale}
        minorUnit={market.currency.minorUnit}
        fees={serializeFees(await feeScheduleFor(db, market.id, null))}
        rounding={market.roundingMode}
        displaySymbol={market.currency.displaySymbol}
      />
    </Container>
  );
}
