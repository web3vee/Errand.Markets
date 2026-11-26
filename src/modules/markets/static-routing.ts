import { MARKET_SEED } from '../../../db/seed/markets';

/**
 * Edge-safe (no DB) routing data for middleware and locale routing.
 * Known limitation: a market added only in the database isn't routable until it is also
 * in the seed file. Stage 7 replaces this with a cached config endpoint.
 */
export function activeMarketRouting() {
  return MARKET_SEED.filter((m) => m.status === 'active').map(({ slug, status, geoCountries }) => ({ slug, status, geoCountries }));
}

export function uiLanguages(): string[] {
  return [...new Set(MARKET_SEED.flatMap((m) => m.uiLanguages))];
}
