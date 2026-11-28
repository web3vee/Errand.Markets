import { MARKET_SEED } from '../../db/seed/markets';
import type { MarketConfig } from '@/modules/markets/domain/schema';

/**
 * Test-only markets, seeded into the test database next to the real ones so no code path can quietly
 * assume there are exactly two markets. Deliberately different from both launch markets:
 *  - spans two countries (phone numbers and geo from Senegal AND Côte d'Ivoire)
 *  - a zero-decimal currency (XOF)
 *  - market text in two languages, with a French format locale
 * `XW` is an ISO 3166 user-assigned code, so it can never collide with a real market.
 * Never part of MARKET_SEED: it must not reach a real deploy.
 */
export const TEST_MARKETS: MarketConfig[] = [
  {
    code: 'XW',
    slug: 'xw',
    status: 'active',
    name: { en: 'Test West Africa', fr: "Test Afrique de l'Ouest" },
    launchRegion: { en: 'Dakar and Abidjan', fr: 'Dakar et Abidjan' },
    runnerIdRequirement: { en: 'A national ID card and a quick selfie check', fr: "Une carte d'identité nationale et un selfie" },
    currency: { code: 'XOF', minorUnit: 0, displaySymbol: null },
    timezone: 'Africa/Dakar',
    phoneRegions: ['SN', 'CI'],
    formatLocale: 'fr-SN',
    uiLanguages: ['en'],
    dataRegion: 'eu-west-2',
    providers: { payment: 'test', payout: 'test', kyc: 'sumsub', sms: 'twilio', maps: 'google' },
    geoCountries: ['SN', 'CI'],
    serviceAreas: [
      { slug: 'plateau', name: { en: 'Plateau', fr: 'Plateau' }, island: null, active: true, center: { lat: 14.6697, lng: -17.4381 }, radiusKm: 1.5 },
      { slug: 'cocody', name: { en: 'Cocody', fr: 'Cocody' }, island: null, active: true, center: { lat: 5.3599, lng: -3.9870 }, radiusKm: 2.5 },
    ],
    categories: MARKET_SEED[0]!.categories,
  },
];

/** Every market the test database holds: the real seed plus the fixtures. */
export const ALL_TEST_MARKETS: MarketConfig[] = [...MARKET_SEED, ...TEST_MARKETS];
export const ALL_MARKET_CODES = ALL_TEST_MARKETS.map((m) => m.code);

export const marketConfig = (code: string) => {
  const m = ALL_TEST_MARKETS.find((x) => x.code === code);
  if (!m) throw new Error(`No test market ${code}`);
  return m;
};
/** A different market than `code`, for cross-market isolation tests. */
export const otherMarketCode = (code: string) => ALL_MARKET_CODES[(ALL_MARKET_CODES.indexOf(code) + 1) % ALL_MARKET_CODES.length]!;
/** The market's first active service area (where tests post errands and place Runners). */
export const firstAreaSlug = (code: string) => marketConfig(code).serviceAreas.find((a) => a.active)!.slug;
