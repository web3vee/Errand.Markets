import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { listMarketViews } from '@/modules/markets/view';
import { Logo } from '@/ui/brand/logo';
import { IconArrow } from '@/ui/icons';
import { Container } from '@/ui/primitives/container';
import { localized } from '@/lib/localized-text';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return { title: t('meta.title') };
}

/** Shown when we can't tell which market the visitor is in (or they asked to change). */
export default async function MarketPicker({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const markets = await listMarketViews(locale);

  return (
    <>
      <header className="border-b border-line">
        <Container className="flex h-16 items-center"><Logo /></Container>
      </header>
      <main id="main">
        <Container className="py-16 md:py-24">
          <div className="max-w-[40rem]">
            <p className="text-small font-medium text-accent-text">{t('brand.tagline')}</p>
            <h1 className="mt-3 text-h1 text-balance">{t('market.pickerTitle')}</h1>
            <p className="mt-4 text-lead text-ink-2">{t('market.pickerLead')}</p>
          </div>
          <ul className="mt-12 max-w-[40rem] border-b border-line">
            {markets.map((m) => (
              <li key={m.slug} className="border-t border-line">
                <Link href={`/${locale}/${m.slug}`} className="group flex min-h-20 items-center justify-between gap-6 py-5">
                  <span>
                    <span className="block text-h3">{localized(m.name, locale)}</span>
                    <span className="mt-1 block text-small text-ink-2">
                      {localized(m.launchRegion, locale)} · {t('market.pricesIn', { symbol: m.symbol, code: m.currency.code })}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-2 text-small font-medium text-ink">
                    <span className="sr-only">{t('market.choose', { market: localized(m.name, locale) })}</span>
                    <IconArrow className="transition-transform duration-[var(--duration-base)] group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-small text-ink-3">{t('market.pickerMore')}</p>
        </Container>
      </main>
    </>
  );
}
