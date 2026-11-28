import { getExampleNumber, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';
import mobileExamples from 'libphonenumber-js/mobile/examples';

export type PhoneResult =
  | { ok: true; e164: string; national: string; international: string; country: string }
  | { ok: false; reason: 'invalid' | 'wrong_country' };

/**
 * Validate a phone number for a market whose numbers may come from several countries
 * (`regions`, primary first, from market config).
 * International input ("+234…") is checked against the list directly. National input
 * ("0803 123 4567", "784 430 1234") is read against each region in order and the first valid
 * reading in the list wins (for shared numbering plans like +1, the number itself decides).
 */
export function parseMarketPhone(input: string, regions: readonly string[]): PhoneResult {
  const cleaned = input.trim();
  if (!cleaned || cleaned.length > 32 || regions.length === 0) return { ok: false, reason: 'invalid' };
  let validElsewhere = false;
  for (const region of regions) {
    const parsed = parsePhoneNumberFromString(cleaned, region as CountryCode);
    if (!parsed || !parsed.isValid()) continue;
    if (parsed.country && regions.includes(parsed.country)) {
      return { ok: true, e164: parsed.number, national: parsed.formatNational(), international: parsed.formatInternational(), country: parsed.country };
    }
    validElsewhere = true;
  }
  return { ok: false, reason: validElsewhere ? 'wrong_country' : 'invalid' };
}

/** Which country a verified E.164 number belongs to (matched against markets' phone regions). */
export function phoneCountry(e164: string): string | null {
  return parsePhoneNumberFromString(e164)?.country ?? null;
}

/** For display in admin lists: keep the country code and last 4 digits. */
export function maskPhone(e164: string): string {
  if (e164.length < 8) return e164;
  return `${e164.slice(0, -7)}•••${e164.slice(-4)}`;
}

/**
 * A realistic example mobile number for a market (from libphonenumber data, not hardcoded):
 * national format when the market has one phone country, international when it has several.
 */
export function exampleMobile(regions: readonly string[]): string | null {
  const primary = regions[0];
  if (!primary) return null;
  const n = getExampleNumber(primary as CountryCode, mobileExamples);
  if (!n) return null;
  return regions.length > 1 ? n.formatInternational() : n.formatNational();
}
