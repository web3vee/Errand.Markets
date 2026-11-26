import { and, eq, isNull, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../db/schema';
import { MARKET_SEED } from '../../db/seed/markets';
import { RUNNER_RULES_SEED } from '../../db/seed/runner-rules';

/** Idempotent: upserts markets, current runner rules, service areas and categories. */
export async function seed(db: PostgresJsDatabase<typeof schema>) {
  for (const m of MARKET_SEED) {
    const values = {
      code: m.code, slug: m.slug, status: m.status, nameKey: m.nameKey, launchRegionKey: m.launchRegionKey,
      currencyCode: m.currency.code, currencyMinorUnit: m.currency.minorUnit, currencyDisplaySymbol: m.currency.displaySymbol,
      timezone: m.timezone, phoneRegion: m.phone.region, phoneCountryCode: m.phone.countryCode, formatLocale: m.formatLocale,
      uiLanguages: m.uiLanguages, dataRegion: m.dataRegion, paymentProvider: m.providers.payment, payoutProvider: m.providers.payout,
      kycProvider: m.providers.kyc, smsProvider: m.providers.sms, mapsProvider: m.providers.maps, geoCountries: m.geoCountries,
    };
    const [row] = await db.insert(schema.markets).values(values)
      .onConflictDoUpdate({ target: schema.markets.code, set: values }).returning({ id: schema.markets.id });
    const marketId = row!.id;

    const rules = RUNNER_RULES_SEED[m.code];
    if (rules) {
      const current = await db.select().from(schema.runnerRules)
        .where(and(eq(schema.runnerRules.marketId, marketId), isNull(schema.runnerRules.effectiveTo)));
      if (current.length === 0) await db.insert(schema.runnerRules).values({ marketId, ...rules });
    }
    for (const [i, a] of m.serviceAreas.entries()) {
      await db.insert(schema.serviceAreas).values({ marketId, slug: a.slug, nameKey: a.nameKey, island: a.island, active: a.active, sort: i })
        .onConflictDoUpdate({ target: [schema.serviceAreas.marketId, schema.serviceAreas.slug], set: { nameKey: a.nameKey, island: a.island, active: a.active, sort: i } });
    }
    for (const c of m.categories) {
      const v = { nameKey: c.nameKey, descriptionKey: c.descriptionKey, purchaseAllowed: c.purchaseAllowed, sort: c.sort, active: c.active };
      await db.insert(schema.errandCategories).values({ marketId, key: c.key, ...v })
        .onConflictDoUpdate({ target: [schema.errandCategories.marketId, schema.errandCategories.key], set: v });
    }
  }
  const [{ n }] = (await db.execute(sql`select count(*)::int as n from markets`)) as unknown as [{ n: number }];
  return { markets: n };
}
