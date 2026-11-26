import type { MarketConfig } from '@/modules/markets/domain/schema';

/**
 * Seed data for the `markets` config tables.
 *
 * TEMPORARY SOURCE OF TRUTH (Stage 2): until the database exists (Stage 3),
 * the app reads this file through `SeedMarketSource`. In Stage 3 this file
 * becomes the DB seed and the app switches to `DbMarketSource`; nothing
 * else changes.
 *
 * Not included yet (need decisions — see docs/architecture/09):
 *  - fee schedule numbers (Q4), tax rules (0 at launch), runner rules
 *  - service-area polygons (drawn in Stage 4)
 *  - prohibited-items lists (legal input, 08 BOTH-7)
 */
export const MARKET_SEED: MarketConfig[] = [
  {
    code: 'NG',
    slug: 'ng',
    status: 'active',
    nameKey: 'markets.NG.name',
    launchRegionKey: 'markets.NG.launchRegion',
    currency: { code: 'NGN', minorUnit: 2, displaySymbol: null },
    timezone: 'Africa/Lagos',
    phone: { region: 'NG', countryCode: '+234' },
    formatLocale: 'en-NG',
    uiLanguages: ['en'],
    dataRegion: 'eu-west-2',
    providers: { payment: 'paystack', payout: 'paystack_transfers', kyc: 'dojah', sms: 'termii', maps: 'google' },
    geoCountries: ['NG'],
    serviceAreas: [
      { slug: 'wuse-2', nameKey: 'areas.wuse-2', island: null, active: true },
      { slug: 'maitama', nameKey: 'areas.maitama', island: null, active: true },
      { slug: 'garki', nameKey: 'areas.garki', island: null, active: true },
      { slug: 'wuse', nameKey: 'areas.wuse', island: null, active: true },
      { slug: 'jabi', nameKey: 'areas.jabi', island: null, active: true },
    ],
    categories: defaultCategories(),
  },
  {
    code: 'VC',
    slug: 'vc',
    status: 'active',
    nameKey: 'markets.VC.name',
    launchRegionKey: 'markets.VC.launchRegion',
    currency: { code: 'XCD', minorUnit: 2, displaySymbol: 'EC$' },
    timezone: 'America/St_Vincent',
    phone: { region: 'VC', countryCode: '+1' },
    formatLocale: 'en-VC',
    uiLanguages: ['en'],
    dataRegion: 'eu-west-2',
    providers: { payment: 'scotia_ecom', payout: 'bank_batch', kyc: 'sumsub', sms: 'twilio', maps: 'google' },
    geoCountries: ['VC'],
    serviceAreas: [
      { slug: 'kingstown', nameKey: 'areas.kingstown', island: 'st-vincent', active: true },
      { slug: 'arnos-vale', nameKey: 'areas.arnos-vale', island: 'st-vincent', active: true },
      { slug: 'calliaqua', nameKey: 'areas.calliaqua', island: 'st-vincent', active: true },
      { slug: 'villa', nameKey: 'areas.villa', island: 'st-vincent', active: true },
      { slug: 'campden-park', nameKey: 'areas.campden-park', island: 'st-vincent', active: true },
      { slug: 'mesopotamia', nameKey: 'areas.mesopotamia', island: 'st-vincent', active: true },
    ],
    categories: defaultCategories(),
  },
];

function defaultCategories(): MarketConfig['categories'] {
  return [
    { key: 'shopping', purchaseAllowed: true, sort: 10 },
    { key: 'pickup', purchaseAllowed: false, sort: 20 },
    { key: 'documents', purchaseAllowed: false, sort: 30 },
    { key: 'delivery', purchaseAllowed: false, sort: 40 },
    { key: 'business', purchaseAllowed: true, sort: 50 },
  ].map((c) => ({
    ...c,
    nameKey: `categories.${c.key}.name`,
    descriptionKey: `categories.${c.key}.description`,
    active: true,
  }));
}
