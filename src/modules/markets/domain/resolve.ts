import type { MarketConfig } from './schema';

/**
 * Decide which market a visitor sees.
 * Priority: explicit choice (cookie) → geo country → none (show picker).
 * Pure function: no I/O, unit-tested.
 */
export function resolveMarket(
  markets: Pick<MarketConfig, 'slug' | 'status' | 'geoCountries'>[],
  input: { cookie?: string | null; geoCountry?: string | null },
): string | null {
  const live = markets.filter((m) => m.status === 'active');
  const fromCookie = input.cookie?.toLowerCase();
  if (fromCookie && live.some((m) => m.slug === fromCookie)) return fromCookie;
  const geo = input.geoCountry?.toUpperCase();
  if (geo) {
    const hit = live.find((m) => m.geoCountries.includes(geo));
    if (hit) return hit.slug;
  }
  return null;
}
