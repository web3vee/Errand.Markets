import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { MarketView } from '@/modules/markets/view';
import { IconArrow } from '@/ui/icons';
import { Button } from '@/ui/primitives/button';
import { Container } from '@/ui/primitives/container';
import { AreaStrip } from './area-strip';

/** The logo's three speed lines, as a hairline motif. Mirrors in RTL so motion reads "forward". */
export function SpeedLines({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 40" className={`h-8 w-auto rtl:-scale-x-100 ${className}`} aria-hidden fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="5">
      <path d="M30 6h80M6 20h96M34 34h76" />
    </svg>
  );
}

/** Direction B — "Signal": kinetic, centred on phones, quick-start categories under the CTAs. */
export async function HeroSignal({ locale, market, standalone = false }: { locale: string; market: MarketView; standalone?: boolean }) {
  const t = await getTranslations();
  const home = `/${locale}/${market.slug}`;
  const cats = market.categories.filter((c) => c.active).sort((a, b) => a.sort - b.sort);

  return (
    <section aria-labelledby="hero-title-b" className={`${standalone ? '' : 'dir-b-only'} border-b border-line`}>
      <Container className="py-14 md:py-24">
        <div className="max-w-[52rem]">
          <SpeedLines className="text-accent" />
          <h1 id="hero-title-b" className="mt-6 text-display text-balance">{t('hero.title')}</h1>
          <p className="mt-6 max-w-[38rem] text-lead text-ink-2 text-pretty">{t('hero.lead')}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href={`${home}/get-started?intent=post`}>{t('hero.ctaPost')}<IconArrow /></Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="sm:px-4">
              <Link href={`${home}/get-started?intent=runner`}>{t('hero.ctaRunner')}</Link>
            </Button>
          </div>
        </div>
        <div className="mt-12 border-t border-line pt-6">
          <p className="text-small font-medium text-ink-3">{t('hero.quickStart')}</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {cats.map((c) => (
              <li key={c.key}>
                <Link
                  href={`${home}/get-started?intent=post&category=${c.key}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-small font-medium text-ink hover:border-line-strong hover:bg-surface"
                >
                  {t(c.nameKey)}
                </Link>
              </li>
            ))}
          </ul>
          <AreaStrip market={market} className="mt-6" />
        </div>
      </Container>
    </section>
  );
}
