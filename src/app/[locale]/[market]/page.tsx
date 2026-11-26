import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { marketSource } from '@/modules/markets/source';
import { getMarketView, listMarketViews } from '@/modules/markets/view';
import { HeroLedger } from '@/ui/home/hero-ledger';
import { BecomeRunner, Categories, ForBusiness, HowItWorks, RidesTeaser, TrustSafety } from '@/ui/home/sections';
import { SiteFooter } from '@/ui/home/site-footer';
import { SiteHeader } from '@/ui/home/site-header';

type Params = { locale: string; market: string };

export const dynamicParams = false;
export async function generateStaticParams() {
  const markets = await marketSource().list();
  return routing.locales.flatMap((locale) => markets.map((m) => ({ locale, market: m.slug })));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale, market: slug } = await params;
  const market = await getMarketView(slug, locale);
  if (!market) return {};
  const t = await getTranslations({ locale });
  const markets = await marketSource().list();
  return {
    title: t('meta.title'),
    description: t('meta.description', { region: t(market.launchRegionKey) }),
    alternates: {
      canonical: `/${locale}/${slug}`,
      languages: Object.fromEntries(markets.map((m) => [`en-${m.code}`, `/${locale}/${m.slug}`])),
    },
  };
}

export default async function MarketHome({ params }: { params: Promise<Params> }) {
  const { locale, market: slug } = await params;
  setRequestLocale(locale);
  const market = await getMarketView(slug, locale);
  if (!market) notFound();
  const markets = await listMarketViews(locale);
  const p = { locale, market };

  return (
    <>
      <SiteHeader locale={locale} market={market} markets={markets} />
      <main id="main">
        <HeroLedger {...p} />
        <HowItWorks {...p} />
        <Categories {...p} />
        <BecomeRunner {...p} />
        <TrustSafety {...p} />
        <ForBusiness {...p} />
        <RidesTeaser {...p} />
      </main>
      <SiteFooter locale={locale} market={market} markets={markets} />
    </>
  );
}
