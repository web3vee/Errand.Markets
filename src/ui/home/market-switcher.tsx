import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { IconCheck, IconChevron } from '@/ui/icons';
import type { MarketView } from '@/modules/markets/view';
import { localized } from '@/lib/localized-text';

/** Native <details> disclosure: keyboard-accessible, zero JavaScript. */
export async function MarketSwitcher({ locale, current, markets }: { locale: string; current: MarketView; markets: MarketView[] }) {
  const t = await getTranslations();
  return (
    <details className="group relative">
      <summary
        className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-small font-medium text-ink-2 hover:bg-sunken hover:text-ink"
        aria-label={t('market.switch')}
      >
        <span className="whitespace-nowrap sm:hidden">{localized(current.name, locale)}</span>
        <span className="hidden whitespace-nowrap sm:inline">{t('market.current', { market: localized(current.name, locale), currency: current.currency.code })}</span>
        <IconChevron className="transition-transform duration-[var(--duration-fast)] group-open:rotate-180" />
      </summary>
      <div className="absolute end-0 z-20 mt-2 w-64 rounded-md border border-line bg-surface p-1 shadow-[0_8px_24px_-12px_rgb(0_0_0/0.25)]">
        <p className="px-3 py-2 text-micro font-medium text-ink-3">{t('market.label')}</p>
        <ul>
          {markets.map((m) => {
            const active = m.slug === current.slug;
            return (
              <li key={m.slug}>
                <Link
                  href={`/${locale}/${m.slug}`}
                  aria-current={active ? 'page' : undefined}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-sm px-3 text-small hover:bg-sunken"
                >
                  <span>
                    <span className="font-medium text-ink">{localized(m.name, locale)}</span>
                    <span className="ms-2 text-ink-3">{m.symbol} · {m.currency.code}</span>
                  </span>
                  {active ? <IconCheck className="text-accent" /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
