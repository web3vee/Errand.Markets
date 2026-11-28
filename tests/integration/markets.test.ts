import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { serviceAreas, users } from '../../db/schema';
import { localized } from '@/lib/localized-text';
import { parseMarketPhone } from '@/lib/phone';
import { marketSource } from '@/modules/markets/source';
import { ALL_MARKET_CODES, ALL_TEST_MARKETS } from '../fixtures/markets';
import { db, makeUser, market, randomMobile } from './helpers';

describe('market config in the database', () => {
  it('every seeded market (real + fixtures) loads with its text and phone countries', async () => {
    const loaded = await marketSource().list();
    expect(loaded.map((m) => m.code).sort()).toEqual([...ALL_MARKET_CODES].sort());
    for (const cfg of ALL_TEST_MARKETS) {
      const m = loaded.find((x) => x.code === cfg.code)!;
      expect(m.name).toEqual(cfg.name);
      expect(m.launchRegion).toEqual(cfg.launchRegion);
      expect(m.runnerIdRequirement).toEqual(cfg.runnerIdRequirement);
      expect(m.phoneRegions).toEqual(cfg.phoneRegions);
      expect(m.serviceAreas.map((a) => a.name)).toEqual(cfg.serviceAreas.map((a) => a.name));
    }
  });

  it('serves market text per UI language, falling back to English', async () => {
    const xw = (await marketSource().byCode('XW'))!;
    expect(localized(xw.name, 'fr')).toBe("Test Afrique de l'Ouest");
    expect(localized(xw.name, 'fr-CI')).toBe("Test Afrique de l'Ouest");
    expect(localized(xw.name, 'pt')).toBe('Test West Africa');
    const [area] = await db().select({ name: serviceAreas.name }).from(serviceAreas)
      .where(eq(serviceAreas.marketId, (await market('XW')).id));
    expect(area!.name).toHaveProperty('en');
  });
});

describe('a market spanning several countries', () => {
  it('accepts sign-ups from each of its phone countries and refuses others', async () => {
    const xw = (await marketSource().byCode('XW'))!;
    for (const region of xw.phoneRegions) {
      const n = randomMobile(region);
      expect(parseMarketPhone(n, xw.phoneRegions)).toMatchObject({ ok: true, country: region, e164: n });
    }
    expect(parseMarketPhone(randomMobile('NG'), xw.phoneRegions)).toEqual({ ok: false, reason: 'wrong_country' });
  });

  it('stores users from different countries in the same market', async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 12 && seen.size < 2; i++) {
      const u = await makeUser('XW');
      const [row] = await db().select({ phone: users.phoneE164, marketId: users.marketId }).from(users).where(eq(users.id, u.id));
      expect(row!.marketId).toBe((await market('XW')).id);
      const p = parseMarketPhone(row!.phone!, ['SN', 'CI']);
      if (p.ok) seen.add(p.country);
    }
    expect([...seen].sort()).toEqual(['CI', 'SN']);
  });
});
