import { MARKET_SEED } from '../../../db/seed/markets';
import { MarketConfig } from './domain/schema';

/** Where market configuration is read from. Business logic depends on this, not on a backend. */
export interface MarketConfigSource {
  list(): Promise<MarketConfig[]>;
  bySlug(slug: string): Promise<MarketConfig | null>;
}

/**
 * STAGE 2 STUB SOURCE — reads db/seed/markets.ts (validated with Zod).
 * Replaced by a database-backed source in Stage 3. Same data, same interface.
 */
class SeedMarketSource implements MarketConfigSource {
  private readonly markets = MARKET_SEED.map((m) => MarketConfig.parse(m));
  async list() {
    return this.markets.filter((m) => m.status === 'active');
  }
  async bySlug(slug: string) {
    return this.markets.find((m) => m.slug === slug && m.status === 'active') ?? null;
  }
}

let source: MarketConfigSource | null = null;
export function marketSource(): MarketConfigSource {
  source ??= new SeedMarketSource();
  return source;
}

/** Synchronous slugs list for edge middleware (which can't await a DB). In Stage 3 this is served from a cached config endpoint. */
export function activeMarketRouting() {
  return MARKET_SEED.filter((m) => m.status === 'active').map(({ slug, status, geoCountries }) => ({ slug, status, geoCountries }));
}

export function uiLanguages(): string[] {
  return [...new Set(MARKET_SEED.flatMap((m) => m.uiLanguages))];
}
