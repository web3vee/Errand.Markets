import { describe, expect, it } from 'vitest';
import { exampleMobile, maskPhone, parseMarketPhone, phoneCountry } from '@/lib/phone';
import { MARKET_SEED } from '../../db/seed/markets';

import { TEST_MARKETS } from '../fixtures/markets';

const NG = MARKET_SEED.find((m) => m.code === 'NG')!.phoneRegions;
const VC = MARKET_SEED.find((m) => m.code === 'VC')!.phoneRegions;
const XW = TEST_MARKETS.find((m) => m.code === 'XW')!.phoneRegions; // Senegal + Côte d'Ivoire

describe('parseMarketPhone — Nigeria (config: region NG, +234)', () => {
  it.each(['0803 123 4567', '08031234567', '+234 803 123 4567', '2348031234567', '803 123 4567'])('accepts %s', (input) => {
    const r = parseMarketPhone(input, NG);
    expect(r).toMatchObject({ ok: true, e164: '+2348031234567', country: 'NG', international: '+234 803 123 4567' });
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

describe('parseMarketPhone — a market spanning several countries (SN + CI)', () => {
  it('accepts international numbers from each listed country', () => {
    expect(parseMarketPhone('+221 70 123 45 67', XW)).toMatchObject({ ok: true, country: 'SN', e164: '+221701234567' });
    expect(parseMarketPhone('+225 01 23 45 67 89', XW)).toMatchObject({ ok: true, country: 'CI', e164: '+2250123456789' });
  });
  it('reads national input against each country in order', () => {
    expect(parseMarketPhone('70 123 45 67', XW)).toMatchObject({ ok: true, country: 'SN' });
    expect(parseMarketPhone('01 23 45 67 89', XW)).toMatchObject({ ok: true, country: 'CI' });
  });
  it('rejects a number from a country outside the list', () =>
    expect(parseMarketPhone('+234 803 123 4567', XW)).toEqual({ ok: false, reason: 'wrong_country' }));
  it('rejects everything when no countries are configured', () =>
    expect(parseMarketPhone('+234 803 123 4567', [])).toEqual({ ok: false, reason: 'invalid' }));
});

describe('exampleMobile', () => {
  it('uses national format for a one-country market', () => expect(exampleMobile(['NG'])).toMatch(/^0\d/));
  it('uses international format when a market has several countries', () => expect(exampleMobile(XW)).toMatch(/^\+221 /));
});

describe('helpers', () => {
  it('detects the country of an E.164 number', () => {
    expect(phoneCountry('+2348031234567')).toBe('NG');
    expect(phoneCountry('+17844301234')).toBe('VC');
  });
  it('masks numbers for admin lists', () => expect(maskPhone('+2348031234567')).toBe('+234803•••4567'));
});
