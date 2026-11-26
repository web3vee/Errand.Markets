import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { MarketView } from '@/modules/markets/view';
import { Logo } from '@/ui/brand/logo';
import { IconMenu } from '@/ui/icons';
import { Button } from '@/ui/primitives/button';
import { Container } from '@/ui/primitives/container';
import { MarketSwitcher } from './market-switcher';

export async function SiteHeader({ locale, market, markets }: { locale: string; market: MarketView; markets: MarketView[] }) {
  const t = await getTranslations();
  const home = `/${locale}/${market.slug}`;
  const nav = [
    { href: `${home}#how`, label: t('nav.howItWorks') },
    { href: `${home}#runners`, label: t('nav.runners') },
    { href: `${home}#business`, label: t('nav.business') },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-[color-mix(in_oklab,var(--bg),transparent_8%)] backdrop-blur-sm">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-ink focus:px-4 focus:py-3 focus:text-bg">
        {t('nav.skipToContent')}
      </a>
      <Container className="flex h-16 items-center justify-between gap-3">
        <Link href={home} aria-label={t('brand.name')} className="-ms-1 inline-flex min-h-11 items-center rounded-md px-1">
          <Logo />
        </Link>
        <nav aria-label={t('nav.label')} className="hidden items-center gap-1 md:flex">
          {nav.map((n) => (
            <a key={n.href} href={n.href} className="inline-flex min-h-11 items-center rounded-md px-3 text-small font-medium text-ink-2 hover:bg-sunken hover:text-ink">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <MarketSwitcher locale={locale} current={market} markets={markets} />
          <Button asChild variant="ink" className="hidden sm:inline-flex">
            <Link href={`${home}/get-started?intent=post`}>{t('hero.ctaPost')}</Link>
          </Button>
          <details className="group relative md:hidden">
            <summary aria-label={t('nav.menu')} className="inline-flex size-11 items-center justify-center rounded-md text-ink hover:bg-sunken">
              <IconMenu width={20} height={20} />
            </summary>
            <nav aria-label={t('nav.label')} className="absolute end-0 z-20 mt-2 w-56 rounded-md border border-line bg-surface p-1 shadow-[0_8px_24px_-12px_rgb(0_0_0/0.25)]">
              {nav.map((n) => (
                <a key={n.href} href={n.href} className="flex min-h-11 items-center rounded-sm px-3 text-body hover:bg-sunken">{n.label}</a>
              ))}
              <Link href={`${home}/get-started?intent=post`} className="flex min-h-11 items-center rounded-sm px-3 text-body font-medium text-accent-text hover:bg-sunken">
                {t('hero.ctaPost')}
              </Link>
            </nav>
          </details>
        </div>
      </Container>
    </header>
  );
}
