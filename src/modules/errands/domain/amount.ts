/**
 * Parse a user-typed amount ("1,500", "25.50", "1 500,75") into integer minor units using the
 * locale's separators and the currency's minor unit from market config. No floating point.
 */
export function parseAmountToMinor(input: string, minorUnit: number, locale: string): bigint | null {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.';
  const group = parts.find((p) => p.type === 'group')?.value ?? ',';
  let s = input.trim().replace(/[\s  ]/g, '');
  if (!s) return null;
  // Remove currency symbols/letters a user may type (₦, EC$, $, NGN).
  s = s.replace(/[^\d.,'’-]/g, '');
  if (s.startsWith('-')) return null;
  s = s.split(group === ' ' || group === ' ' || group === ' ' ? '' : group).join('');
  const segments = s.split(decimal);
  if (segments.length > 2) return null;
  const [whole = '', frac = ''] = segments;
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac) || (whole === '' && frac === '')) return null;
  if (frac.length > minorUnit) return null; // more precision than the currency allows
  const minor = BigInt(whole || '0') * 10n ** BigInt(minorUnit) + BigInt((frac || '').padEnd(minorUnit, '0') || '0');
  return minor;
}

/** Inverse for pre-filling inputs ("2500.00"-style, locale-formatted without currency symbol). */
export function minorToInput(amountMinor: bigint, minorUnit: number, locale: string): string {
  const neg = amountMinor < 0n;
  const abs = neg ? -amountMinor : amountMinor;
  const base = 10n ** BigInt(minorUnit);
  const whole = (abs / base).toString();
  const frac = minorUnit ? (abs % base).toString().padStart(minorUnit, '0') : '';
  const decimal = new Intl.NumberFormat(locale).formatToParts(1.1).find((p) => p.type === 'decimal')?.value ?? '.';
  return `${neg ? '-' : ''}${whole}${frac && !/^0+$/.test(frac) ? decimal + frac : ''}`;
}
