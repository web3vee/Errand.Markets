import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { MarketView } from '@/modules/markets/view';
import { IconCheck, IconDot } from '@/ui/icons';
import { Button } from '@/ui/primitives/button';
import { Container } from '@/ui/primitives/container';
import { AreaStrip } from './area-strip';

/** Direction A — "Ledger": statement-like, left-aligned, with an escrow timeline that explains the trust model in type alone. */
export async function HeroLedger({ locale, market, standalone = false }: { locale: string; market: MarketView; standalone?: boolean }) {
  const t = await getTranslations();
  const home = `/${locale}/${market.slug}`;
  const steps = [
    { key: 'posted', state: 'done' },
    { key: 'chosen', state: 'done' },
    { key: 'held', state: 'now' },
    { key: 'proof', state: 'next' },
    { key: 'released', state: 'next' },
  ] as const;
  const firstArea = market.serviceAreas.find((a) => a.active);

  return (
    <section aria-labelledby="hero-title" className={`${standalone ? '' : 'dir-a-only'} border-b border-line`}>
      <Container className="grid gap-12 py-14 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] md:items-end md:gap-16 md:py-24">
        <div>
          <p className="text-small font-medium text-ink-3">{t('hero.eyebrow')}</p>
          <h1 id="hero-title" className="mt-4 text-display text-balance">{t('hero.title')}</h1>
          <p className="mt-6 max-w-[34rem] text-lead text-ink-2 text-pretty">{t('hero.lead')}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg"><Link href={`${home}/get-started?intent=post`}>{t('hero.ctaPost')}</Link></Button>
            <Button asChild size="lg" variant="secondary"><Link href={`${home}/get-started?intent=runner`}>{t('hero.ctaRunner')}</Link></Button>
          </div>
          <AreaStrip market={market} className="mt-10" />
        </div>

        <figure className="rounded-lg border border-line bg-surface" aria-labelledby="ledger-caption">
          <div className="flex items-baseline justify-between gap-4 border-b border-line px-5 py-4">
            <figcaption id="ledger-caption" className="text-micro font-medium uppercase text-ink-3">{t('hero.ledger.title')}</figcaption>
            <span className="text-micro tabular-nums text-ink-3">{market.symbol} · {market.currency.code}</span>
          </div>
          <div className="px-5 pt-4">
            <p className="text-h3">{t('hero.ledger.errand')}</p>
            {firstArea ? <p className="text-small text-ink-3">{t('hero.ledger.where', { area: t(firstArea.nameKey) })}</p> : null}
          </div>
          <ol className="mt-4 px-5">
            {steps.map((s) => (
              <li key={s.key} className="flex min-h-11 items-center justify-between gap-4 border-t border-line text-small">
                <span className={`inline-flex items-center gap-3 ${s.state === 'next' ? 'text-ink-3' : 'text-ink'}`}>
                  <span className="inline-flex size-4 items-center justify-center">
                    {s.state === 'done' ? <IconCheck /> : s.state === 'now' ? <IconDot className="text-accent" /> : <span className="size-1.5 rounded-full bg-line-strong" />}
                  </span>
                  <span className={s.state === 'now' ? 'font-medium' : undefined}>{t(`hero.ledger.steps.${s.key}`)}</span>
                </span>
                <span className={`text-micro ${s.state === 'now' ? 'text-accent-text font-medium' : 'text-ink-3'}`}>
                  {t(`hero.ledger.${s.state}`)}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-2 border-t border-line bg-sunken px-5 py-4 text-small text-ink-2 rounded-b-lg">
            {t('hero.ledger.held')}
          </p>
        </figure>
      </Container>
    </section>
  );
}
