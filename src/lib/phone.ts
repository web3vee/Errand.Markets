import { getExampleNumber, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';
import mobileExamples from 'libphonenumber-js/mobile/examples';

export type PhoneRule = { region: string; countryCode: string };
export type PhoneResult =
  | { ok: true; e164: string; national: string; country: string }
  | { ok: false; reason: 'invalid' | 'wrong_country' };

/**
 * Validate a phone number for a market. Region and prefix come from market config.
 * Accepts national ("0803 123 4567", "784 430 1234") or international ("+234…") input.
 */
export function parseMarketPhone(input: string, rule: PhoneRule): PhoneResult {
  const cleaned = input.trim();
  if (!cleaned || cleaned.length > 32) return { ok: false, reason: 'invalid' };
  const parsed = parsePhoneNumberFromString(cleaned, rule.region as CountryCode);
  if (!parsed || !parsed.isValid()) return { ok: false, reason: 'invalid' };
  if (parsed.country !== rule.region) return { ok: false, reason: 'wrong_country' };
  return { ok: true, e164: parsed.number, national: parsed.formatNational(), country: parsed.country };
}

/** Which market a verified E.164 number belongs to (by phone region in market config). */
export function phoneCountry(e164: string): string | null {
  return parsePhoneNumberFromString(e164)?.country ?? null;
}

/** For display in admin lists: keep the country code and last 4 digits. */
export function maskPhone(e164: string): string {
  if (e164.length < 8) return e164;
  return `${e164.slice(0, -7)}•••${e164.slice(-4)}`;
}


/** A realistic example mobile number for a market's phone region (from libphonenumber data, not hardcoded). */
export function exampleMobile(region: string): string | null {
  const n = getExampleNumber(region as CountryCode, mobileExamples);
  return n ? n.formatNational() : null;
}
