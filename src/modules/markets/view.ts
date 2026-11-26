import { formatLocaleFor } from '@/lib/i18n-direction';
import { currencySymbol } from '@/lib/money';
import type { MarketConfig } from './domain/schema';
import { marketSource } from './source';

export type MarketView = MarketConfig & { displayLocale: string; symbol: string };

/** Market config + values derived for display in the visitor's UI language. */
export async function getMarketView(slug: string, uiLocale: string): Promise<MarketView | null> {
  const m = await marketSource().bySlug(slug);
  if (!m) return null;
  const displayLocale = formatLocaleFor(uiLocale, m.formatLocale);
  return { ...m, displayLocale, symbol: currencySymbol(m.currency, displayLocale) };
}

export async function listMarketViews(uiLocale: string): Promise<MarketView[]> {
  const all = await marketSource().list();
  return (await Promise.all(all.map((m) => getMarketView(m.slug, uiLocale)))).filter((m): m is MarketView => !!m);
}
