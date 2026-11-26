import { describe, expect, it } from 'vitest';
import { currencySymbol, formatMoney, minorToDecimalString } from '@/lib/money';

describe('minorToDecimalString', () => {
  it.each([
    [12345n, 2, '123.45'],
    [5n, 2, '0.05'],
    [0n, 2, '0.00'],
    [-150n, 2, '-1.50'],
    [1500n, 0, '1500'], // JPY
    [1234n, 3, '1.234'], // KWD
    [7n, 3, '0.007'],
    [9007199254740993123n, 2, '90071992547409931.23'], // beyond float precision
  ])('%s with minor unit %s → %s', (minor, unit, expected) => {
    expect(minorToDecimalString(minor, unit)).toBe(expected);
  });
  it('rejects invalid minor units', () => {
    expect(() => minorToDecimalString(1n, -1)).toThrow();
    expect(() => minorToDecimalString(1n, 1.5)).toThrow();
  });
});

describe('formatMoney', () => {
  const NGN = { code: 'NGN', minorUnit: 2, displaySymbol: null };
  const XCD = { code: 'XCD', minorUnit: 2, displaySymbol: 'EC$' };
  it('formats NGN in en-NG with ₦', () => {
    expect(formatMoney(150_000_00n, NGN, 'en-NG')).toBe('₦150,000.00');
  });
  it('uses the market display symbol override for XCD (en-VC would print a bare $)', () => {
    expect(formatMoney(2_550n, XCD, 'en-VC')).toBe('EC$25.50');
  });
  it('can trim a zero fraction for headline prices', () => {
    expect(formatMoney(2_500n, XCD, 'en-VC', { trimZeroFraction: true })).toBe('EC$25');
    expect(formatMoney(2_550n, XCD, 'en-VC', { trimZeroFraction: true })).toBe('EC$25.50');
  });
  it('respects minor units of 0 and 3', () => {
    expect(formatMoney(1500n, { code: 'JPY', minorUnit: 0 }, 'en-US')).toBe('¥1,500');
    expect(formatMoney(1234n, { code: 'KWD', minorUnit: 3 }, 'en-US')).toBe('KWD\u00a01.234');
  });
  it('does not lose precision on very large amounts', () => {
    expect(formatMoney(9007199254740993123n, NGN, 'en-NG')).toBe('₦90,071,992,547,409,931.23');
  });
  it('formats by locale, not by hand', () => {
    expect(formatMoney(123456n, { code: 'EUR', minorUnit: 2 }, 'de-DE')).toBe('1.234,56 €');
  });
});

describe('currencySymbol', () => {
  it('reads symbol from Intl or override', () => {
    expect(currencySymbol({ code: 'NGN', minorUnit: 2 }, 'en-NG')).toBe('₦');
    expect(currencySymbol({ code: 'XCD', minorUnit: 2, displaySymbol: 'EC$' }, 'en-VC')).toBe('EC$');
  });
});
