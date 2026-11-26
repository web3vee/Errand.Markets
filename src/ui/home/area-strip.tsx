import { getFormatter, getTranslations } from 'next-intl/server';
import type { MarketView } from '@/modules/markets/view';
import { IconDot } from '@/ui/icons';

export async function AreaStrip({ market, className = '' }: { market: MarketView; className?: string }) {
  const t = await getTranslations();
  const format = await getFormatter();
  const areas = market.serviceAreas.filter((a) => a.active).map((a) => t(a.nameKey));
  return (
    <div className={`flex flex-col gap-1 text-small text-ink-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 ${className}`}>
      <p className="inline-flex items-center gap-2">
        <IconDot className="text-accent" />
        <span>
          {t.rich('market.nowInAreas', {
            region: t(market.launchRegionKey),
            areas: format.list(areas, { type: 'conjunction' }),
            strong: (c) => <span className="font-medium text-ink">{c}</span>,
          })}
        </span>
      </p>
      <p className="text-ink-3 sm:border-s sm:border-line sm:ps-4">
        {t('market.pricesIn', { symbol: market.symbol, code: market.currency.code })}
      </p>
    </div>
  );
}
