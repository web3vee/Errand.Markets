import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getMarketView, listMarketViews } from '@/modules/markets/view';
import { SiteHeader } from '@/ui/home/site-header';
import { Button } from '@/ui/primitives/button';
import { Container } from '@/ui/primitives/container';

/** Placeholder: the CTA destination until auth ships in Stage 3. */
export default async function GetStarted({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; market: string }>;
  searchParams: Promise<{ intent?: string }>;
}) {
  const { locale, market: slug } = await params;
  const { intent } = await searchParams;
  setRequestLocale(locale);
  const market = await getMarketView(slug, locale);
  if (!market) notFound();
  const t = await getTranslations();
  const region = t(market.launchRegionKey);

  return (
    <>
      <SiteHeader locale={locale} market={market} markets={await listMarketViews(locale)} />
      <main id="main">
        <Container className="py-20">
          <h1 className="text-h1">{t('getStarted.title')}</h1>
          <p className="mt-4 text-lead text-ink-2">{intent === 'runner' ? t('getStarted.runner', { region }) : t('getStarted.post', { region })}</p>
          <Button asChild variant="secondary" className="mt-8"><Link href={`/${locale}/${slug}`}>{t('getStarted.back')}</Link></Button>
        </Container>
      </main>
    </>
  );
}
