import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { MarketView } from '@/modules/markets/view';
import { Logo } from '@/ui/brand/logo';
import { Container } from '@/ui/primitives/container';

export async function SiteFooter({ locale, market, markets }: { locale: string; market: MarketView; markets: MarketView[] }) {
  const t = await getTranslations();
  return (
    <footer className="py-12">
      <Container className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-[22rem]">
          <Logo />
          <p className="mt-3 text-small text-ink-2">{t('brand.tagline')}</p>
        </div>
        <div className="text-small text-ink-2">
          <p>{t('footer.market', { market: t(market.nameKey) })}</p>
          <ul className="mt-2 flex flex-wrap gap-x-4">
            {markets.filter((m) => m.slug !== market.slug).map((m) => (
              <li key={m.slug}>
                <Link href={`/${locale}/${m.slug}`} className="inline-flex min-h-11 items-center underline hover:text-ink">
                  {t('market.choose', { market: t(m.nameKey) })}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Container>
      <Container>
        <p className="mt-8 border-t border-line pt-6 text-micro text-ink-3">{t('footer.rights', { year: new Date().getFullYear() })}</p>
      </Container>
    </footer>
  );
}
