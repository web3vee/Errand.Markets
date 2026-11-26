import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { cache } from 'react';
import { defaultDb, hasDatabase } from '../../../db/client';
import { errandCategories, markets, runnerRules, serviceAreas } from '../../../db/schema';
import { MARKET_SEED } from '../../../db/seed/markets';
import { and, isNull } from 'drizzle-orm';
import { MarketConfig } from './domain/schema';

export type MarketRecord = MarketConfig & { id: string | null; kycAutoApprove: boolean };

/** Where market configuration is read from. Business logic depends on this, not on a backend. */
export interface MarketConfigSource {
  list(): Promise<MarketRecord[]>;
  bySlug(slug: string): Promise<MarketRecord | null>;
  byCode(code: string): Promise<MarketRecord | null>;
}

/** Fallback when no database is configured (e.g. a static preview build). Same data as the DB seed. */
class SeedMarketSource implements MarketConfigSource {
  private readonly all = MARKET_SEED.map((m) => ({ ...MarketConfig.parse(m), id: null, kycAutoApprove: false }));
  async list() { return this.all.filter((m) => m.status === 'active'); }
  async bySlug(slug: string) { return this.all.find((m) => m.slug === slug && m.status === 'active') ?? null; }
  async byCode(code: string) { return this.all.find((m) => m.code === code && m.status === 'active') ?? null; }
}

/** Source of truth: the `markets` table and its config tables. */
class DbMarketSource implements MarketConfigSource {
  private load = cache(async (): Promise<MarketRecord[]> => {
    const db = defaultDb();
    const rows = await db.select().from(markets).where(eq(markets.status, 'active')).orderBy(asc(markets.code));
    const areas = await db.select().from(serviceAreas).orderBy(asc(serviceAreas.sort));
    const cats = await db.select().from(errandCategories).orderBy(asc(errandCategories.sort));
    return rows.map((m) => MarketConfig.parse({
      code: m.code, slug: m.slug, status: m.status, nameKey: m.nameKey, launchRegionKey: m.launchRegionKey,
      currency: { code: m.currencyCode, minorUnit: m.currencyMinorUnit, displaySymbol: m.currencyDisplaySymbol },
      timezone: m.timezone, phone: { region: m.phoneRegion, countryCode: m.phoneCountryCode }, formatLocale: m.formatLocale,
      uiLanguages: m.uiLanguages, dataRegion: m.dataRegion,
      providers: { payment: m.paymentProvider, payout: m.payoutProvider, kyc: m.kycProvider, sms: m.smsProvider, maps: m.mapsProvider },
      geoCountries: m.geoCountries,
      serviceAreas: areas.filter((a) => a.marketId === m.id).map((a) => ({ slug: a.slug, nameKey: a.nameKey, island: a.island, active: a.active })),
      categories: cats.filter((c) => c.marketId === m.id).map((c) => ({ key: c.key, nameKey: c.nameKey, descriptionKey: c.descriptionKey, purchaseAllowed: c.purchaseAllowed, sort: c.sort, active: c.active })),
    })).map((cfg, i) => ({ ...cfg, id: rows[i]!.id, kycAutoApprove: rows[i]!.kycAutoApprove }));
  });
  async list() { return this.load(); }
  async bySlug(slug: string) { return (await this.load()).find((m) => m.slug === slug) ?? null; }
  async byCode(code: string) { return (await this.load()).find((m) => m.code === code) ?? null; }
}

export function marketSource(): MarketConfigSource {
  return hasDatabase() ? new DbMarketSource() : new SeedMarketSource();
}

/** Current runner rules for a market (DB only). */
export async function currentRunnerRules(marketId: string) {
  const [r] = await defaultDb().select().from(runnerRules)
    .where(and(eq(runnerRules.marketId, marketId), isNull(runnerRules.effectiveTo)));
  return r ?? null;
}

export { activeMarketRouting, uiLanguages } from './static-routing';
