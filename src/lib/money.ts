/**
 * Money display helpers. Amounts are integers in the currency's minor unit
 * (bigint); the minor-unit precision comes from market config, never assumed.
 * Formatting is delegated to Intl with the locale; we never build strings by hand.
 */
export type CurrencySpec = { code: string; minorUnit: number; displaySymbol?: string | null };

/** Convert integer minor units to an exact decimal string ("12345", 2 → "123.45"). No floats. */
export function minorToDecimalString(amountMinor: bigint, minorUnit: number): string {
  if (!Number.isInteger(minorUnit) || minorUnit < 0) throw new RangeError('minorUnit must be a non-negative integer');
  const negative = amountMinor < 0n;
  const digits = (negative ? -amountMinor : amountMinor).toString();
  if (minorUnit === 0) return (negative ? '-' : '') + digits;
  const padded = digits.padStart(minorUnit + 1, '0');
  const whole = padded.slice(0, -minorUnit);
  const frac = padded.slice(-minorUnit);
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

export function formatMoney(
  amountMinor: bigint,
  currency: CurrencySpec,
  locale: string,
  opts: { trimZeroFraction?: boolean } = {},
): string {
  const decimal = minorToDecimalString(amountMinor, currency.minorUnit);
  const isWhole = currency.minorUnit === 0 || /\.0+$/.test(decimal);
  const fraction = opts.trimZeroFraction && isWhole ? 0 : currency.minorUnit;
  const nf = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.code,
    minimumFractionDigits: fraction,
    maximumFractionDigits: currency.minorUnit,
  });
  // Intl accepts exact decimal strings (ES2023 Intl.NumberFormat v3), so no precision loss.
  const parts = nf.formatToParts(decimal as unknown as number);
  return parts
    .map((p) => (p.type === 'currency' && currency.displaySymbol ? currency.displaySymbol : p.value))
    .join('');
}

/** The symbol a market shows for its currency (e.g. "₦", "EC$"). */
export function currencySymbol(currency: CurrencySpec, locale: string): string {
  if (currency.displaySymbol) return currency.displaySymbol;
  const part = new Intl.NumberFormat(locale, { style: 'currency', currency: currency.code })
    .formatToParts(0)
    .find((p) => p.type === 'currency');
  return part?.value ?? currency.code;
}
