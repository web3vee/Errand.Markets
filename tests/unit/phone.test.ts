import { describe, expect, it } from 'vitest';
import { maskPhone, parseMarketPhone, phoneCountry } from '@/lib/phone';
import { MARKET_SEED } from '../../db/seed/markets';

const NG = MARKET_SEED.find((m) => m.code === 'NG')!.phone;
const VC = MARKET_SEED.find((m) => m.code === 'VC')!.phone;

describe('parseMarketPhone — Nigeria (config: region NG, +234)', () => {
  it.each(['0803 123 4567', '08031234567', '+234 803 123 4567', '2348031234567', '803 123 4567'])('accepts %s', (input) => {
    const r = parseMarketPhone(input, NG);
    expect(r).toMatchObject({ ok: true, e164: '+2348031234567', country: 'NG' });
  });
  it('rejects too-short numbers', () => expect(parseMarketPhone('0803 123', NG)).toEqual({ ok: false, reason: 'invalid' }));
  it('rejects a St Vincent number in the Nigeria market', () =>
    expect(parseMarketPhone('+1 784 430 1234', NG)).toEqual({ ok: false, reason: 'wrong_country' }));
  it('rejects junk', () => expect(parseMarketPhone('hello', NG)).toEqual({ ok: false, reason: 'invalid' }));
});

describe('parseMarketPhone — St Vincent (config: region VC, +1 784)', () => {
  it.each(['784 430 1234', '(784) 430-1234', '+1 784 430 1234', '17844301234'])('accepts %s', (input) => {
    expect(parseMarketPhone(input, VC)).toMatchObject({ ok: true, e164: '+17844301234', country: 'VC' });
  });
  it('rejects a US number (same +1 prefix, different country)', () =>
    expect(parseMarketPhone('+1 202 555 0143', VC)).toMatchObject({ ok: false }));
  it('rejects a Nigerian number', () => expect(parseMarketPhone('+234 803 123 4567', VC)).toEqual({ ok: false, reason: 'wrong_country' }));
});

describe('helpers', () => {
  it('detects the country of an E.164 number', () => {
    expect(phoneCountry('+2348031234567')).toBe('NG');
    expect(phoneCountry('+17844301234')).toBe('VC');
  });
  it('masks numbers for admin lists', () => expect(maskPhone('+2348031234567')).toBe('+234803•••4567'));
});
