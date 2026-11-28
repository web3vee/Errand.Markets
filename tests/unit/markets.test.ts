import { describe, expect, it } from 'vitest';
import { MARKET_SEED } from '../../db/seed/markets';
import { MarketConfig } from '@/modules/markets/domain/schema';
import { resolveMarket } from '@/modules/markets/domain/resolve';
import { ALL_TEST_MARKETS, TEST_MARKETS } from '../fixtures/markets';

const markets = MARKET_SEED.map((m) => MarketConfig.parse(m));
const allMarkets = ALL_TEST_MARKETS.map((m) => MarketConfig.parse(m));

describe('market seed config', () => {
  it('validates against the schema', () => expect(markets.length).toBeGreaterThan(0));
  it('never ships test fixture markets', () => {
    for (const t of TEST_MARKETS) expect(MARKET_SEED.map((m) => m.code)).not.toContain(t.code);
  });
  it('gives every market text in each of its UI languages, and English as a fallback', () => {
    for (const m of allMarkets) {
      for (const text of [m.name, m.launchRegion, m.runnerIdRequirement, ...m.serviceAreas.map((a) => a.name)]) {
        expect(text.en).toBeTruthy();
        for (const lang of m.uiLanguages) expect(text[lang]).toBeTruthy();
      }
    }
  });
  it('maps each phone country and geo country to at most one market', () => {
    const phone = allMarkets.flatMap((m) => m.phoneRegions);
    expect(new Set(phone).size).toBe(phone.length);
    const geo = allMarkets.flatMap((m) => m.geoCountries);
    expect(new Set(geo).size).toBe(geo.length);
  });
  it('has unique codes and slugs that match codes', () => {
    for (const m of markets) expect(m.slug).toBe(m.code.toLowerCase());
    expect(new Set(markets.map((m) => m.code)).size).toBe(markets.length);
  });
  it('declares a valid IANA timezone and currency per market', () => {
    for (const m of allMarkets) {
      expect(() => new Intl.DateTimeFormat('en', { timeZone: m.timezone })).not.toThrow();
      expect(() => new Intl.NumberFormat('en', { style: 'currency', currency: m.currency.code })).not.toThrow();
    }
  });
});

describe('market config validation', () => {
  const base = TEST_MARKETS[0]!;
  it('rejects a market missing text for one of its UI languages', () => {
    const r = MarketConfig.safeParse({ ...base, uiLanguages: ['en', 'pt'] });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('missing \\"pt\\" text');
  });
  it('rejects unknown, duplicate or empty phone countries', () => {
    expect(MarketConfig.safeParse({ ...base, phoneRegions: ['ZZ'] }).success).toBe(false);
    expect(MarketConfig.safeParse({ ...base, phoneRegions: ['SN', 'SN'] }).success).toBe(false);
    expect(MarketConfig.safeParse({ ...base, phoneRegions: [] }).success).toBe(false);
  });
  it('rejects empty market text', () => {
    expect(MarketConfig.safeParse({ ...base, name: {} }).success).toBe(false);
    expect(MarketConfig.safeParse({ ...base, name: { en: ' ' } }).success).toBe(false);
  });
});

describe('resolveMarket with a market spanning several countries', () => {
  it('geo-detects each of its countries', () => {
    expect(resolveMarket(allMarkets, { geoCountry: 'SN' })).toBe('xw');
    expect(resolveMarket(allMarkets, { geoCountry: 'CI' })).toBe('xw');
    expect(resolveMarket(allMarkets, { geoCountry: 'NG' })).toBe('ng');
  });
});

describe('resolveMarket', () => {
  it('prefers the explicit cookie choice', () => {
    expect(resolveMarket(markets, { cookie: 'vc', geoCountry: 'NG' })).toBe('vc');
  });
  it('falls back to geo country', () => {
    expect(resolveMarket(markets, { geoCountry: 'NG' })).toBe('ng');
    expect(resolveMarket(markets, { geoCountry: 'vc' })).toBe('vc');
  });
  it('ignores unknown cookie values', () => {
    expect(resolveMarket(markets, { cookie: 'zz', geoCountry: 'VC' })).toBe('vc');
  });
  it('returns null outside launch markets (show picker)', () => {
    expect(resolveMarket(markets, { geoCountry: 'GB' })).toBeNull();
    expect(resolveMarket(markets, {})).toBeNull();
  });
  it('never resolves a paused market', () => {
    const paused = markets.map((m) => (m.slug === 'ng' ? { ...m, status: 'paused' as const } : m));
    expect(resolveMarket(paused, { cookie: 'ng', geoCountry: 'NG' })).toBeNull();
  });
});
