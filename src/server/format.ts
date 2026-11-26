import 'server-only';
import { formatMoney } from '@/lib/money';
import type { MarketRecord } from '@/modules/markets/source';

/** Money in a market's currency, formatted for that market (precision + symbol from config). */
export const money = (market: Pick<MarketRecord, 'currency' | 'formatLocale'>, minor: bigint, trim = false) =>
  formatMoney(minor, market.currency, market.formatLocale, { trimZeroFraction: trim });

/** Short time-zone label for a market, e.g. "WAT" / "AST", from Intl. */
export function tzLabel(timeZone: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
}
