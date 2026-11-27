import { z } from 'zod';

/**
 * Shape of a market's configuration. Mirrors the `markets` table (+ related
 * config tables) designed in docs/architecture/02-data-model.md.
 * Nothing outside this config and the provider adapters may hold a
 * market-specific value (currency, phone format, fee, tax, locale, provider).
 */
export const MarketCode = z.string().regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2, upper case');
export type MarketCode = z.infer<typeof MarketCode>;

export const ServiceArea = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  /** i18n key for the display name */
  nameKey: z.string(),
  island: z.string().nullable(),
  active: z.boolean(),
  /** Seed only: approximate centre + radius, turned into a placeholder boundary polygon. */
  center: z.object({ lat: z.number(), lng: z.number() }).optional(),
  radiusKm: z.number().positive().optional(),
});

export const ErrandCategory = z.object({
  key: z.string().regex(/^[a-z_]+$/),
  nameKey: z.string(),
  descriptionKey: z.string(),
  purchaseAllowed: z.boolean(),
  sort: z.number().int(),
  active: z.boolean(),
});

export const MarketConfig = z.object({
  code: MarketCode,
  /** URL segment, derived from code (lower case) */
  slug: z.string().regex(/^[a-z]{2}$/),
  status: z.enum(['draft', 'active', 'paused']),
  nameKey: z.string(),
  launchRegionKey: z.string(),
  currency: z.object({
    code: z.string().regex(/^[A-Z]{3}$/),
    /** digits after the decimal point; NEVER assumed (JPY 0, XCD 2, KWD 3) */
    minorUnit: z.number().int().min(0).max(4),
    /** Optional display override where CLDR's local symbol is ambiguous (XCD in en-VC → "$"). */
    displaySymbol: z.string().nullable(),
  }),
  timezone: z.string(),
  phone: z.object({ region: z.string().length(2), countryCode: z.string().regex(/^\+\d{1,4}$/) }),
  /** BCP 47 locale used for number/date/currency formatting in this market */
  formatLocale: z.string(),
  /** UI languages offered in this market (translation catalogs) */
  uiLanguages: z.array(z.string()).min(1),
  dataRegion: z.string(),
  providers: z.object({
    payment: z.string(),
    payout: z.string(),
    kyc: z.string(),
    sms: z.string(),
    maps: z.string(),
  }),
  /** ISO 3166 country codes that geo-detect to this market */
  geoCountries: z.array(z.string().length(2)),
  serviceAreas: z.array(ServiceArea),
  categories: z.array(ErrandCategory),
});
export type MarketConfig = z.infer<typeof MarketConfig>;
