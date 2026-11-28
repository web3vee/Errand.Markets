import { isSupportedCountry } from 'libphonenumber-js/max';
import { z } from 'zod';

/**
 * Shape of a market's configuration. Mirrors the `markets` table (+ related
 * config tables) designed in docs/architecture/02-data-model.md.
 * Nothing outside this config and the provider adapters may hold a
 * market-specific value (currency, phone format, fee, tax, locale, provider).
 */
export const MarketCode = z.string().regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2, upper case');
export type MarketCode = z.infer<typeof MarketCode>;

/**
 * Text that belongs to one market (its name, launch region, area names), keyed by UI language
 * ("en", "fr", …). Lives with the market's config, not in the translation catalogs, so a new
 * market needs no code change. Resolve with `localized()` from '@/lib/localized-text'.
 */
export const LocalizedText = z.record(z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/), z.string().trim().min(1))
  .refine((t) => Object.keys(t).length > 0, 'at least one language');
export type LocalizedText = z.infer<typeof LocalizedText>;

/** ISO 3166-1 alpha-2 region that libphonenumber knows (so numbers from it can be validated). */
const PhoneRegion = z.string().regex(/^[A-Z]{2}$/).refine((r): boolean => isSupportedCountry(r), 'not a phone region libphonenumber supports');

export const ServiceArea = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: LocalizedText,
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

const MarketConfigShape = z.object({
  code: MarketCode,
  /** URL segment, derived from code (lower case) */
  slug: z.string().regex(/^[a-z]{2}$/),
  status: z.enum(['draft', 'active', 'paused']),
  name: LocalizedText,
  /** Where in the market the service runs today ("Abuja"). */
  launchRegion: LocalizedText,
  /** What a Runner needs to verify their identity here (depends on the market's KYC provider). */
  runnerIdRequirement: LocalizedText,
  currency: z.object({
    code: z.string().regex(/^[A-Z]{3}$/),
    /** digits after the decimal point; NEVER assumed (JPY 0, XCD 2, KWD 3) */
    minorUnit: z.number().int().min(0).max(4),
    /** Optional display override where CLDR's local symbol is ambiguous (XCD in en-VC → "$"). */
    displaySymbol: z.string().nullable(),
  }),
  timezone: z.string(),
  /**
   * Countries whose phone numbers can sign up in this market, primary first. National-format input
   * ("0803…") is read against each in order; the calling code comes from libphonenumber.
   * A market spanning several countries (e.g. a shared-currency region) lists them all.
   */
  phoneRegions: z.array(PhoneRegion).min(1),
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

export const MarketConfig = MarketConfigShape.superRefine((m, ctx) => {
  if (new Set(m.phoneRegions).size !== m.phoneRegions.length) ctx.addIssue({ code: 'custom', path: ['phoneRegions'], message: 'duplicate phone region' });
  // Every UI language the market offers must have its market text.
  const texts: [string, LocalizedText][] = [
    ['name', m.name], ['launchRegion', m.launchRegion], ['runnerIdRequirement', m.runnerIdRequirement],
    ...m.serviceAreas.map((a) => [`serviceAreas.${a.slug}.name`, a.name] as [string, LocalizedText]),
  ];
  for (const [path, text] of texts) {
    for (const lang of m.uiLanguages) {
      if (!text[lang]) ctx.addIssue({ code: 'custom', path: path.split('.'), message: `missing "${lang}" text` });
    }
  }
});
export type MarketConfig = z.infer<typeof MarketConfig>;
