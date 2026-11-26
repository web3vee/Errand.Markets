import { describe, expect, it } from 'vitest';
import { MARKET_SEED } from '../../db/seed/markets';
import { MarketConfig } from '@/modules/markets/domain/schema';
import { resolveMarket } from '@/modules/markets/domain/resolve';

const markets = MARKET_SEED.map((m) => MarketConfig.parse(m));

describe('market seed config', () => {
  it('validates against the schema', () => expect(markets).toHaveLength(2));
  it('has unique codes and slugs that match codes', () => {
    for (const m of markets) expect(m.slug).toBe(m.code.toLowerCase());
    expect(new Set(markets.map((m) => m.code)).size).toBe(markets.length);
  });
  it('declares a valid IANA timezone and currency per market', () => {
    for (const m of markets) {
      expect(() => new Intl.DateTimeFormat('en', { timeZone: m.timezone })).not.toThrow();
      expect(() => new Intl.NumberFormat('en', { style: 'currency', currency: m.currency.code })).not.toThrow();
    }
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
