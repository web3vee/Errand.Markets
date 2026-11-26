import { describe, expect, it } from 'vitest';
import { bps, divRound, quote, type FeeSchedule } from '@/modules/pricing/domain/quote';

// Launch schedule (decided 2026-11-26): 5% service fee on the errand price, 0 commission.
const LAUNCH: FeeSchedule = { id: 'fs1', commissionBps: 0, serviceFeeBps: 500, serviceFeeFixedMinor: null, serviceFeeMinMinor: null, serviceFeeMaxMinor: null };
const base = { currency: 'NGN', minorUnit: 2, rounding: 'half_up' as const, fees: LAUNCH, taxRules: [] };

describe('rounding (integer only)', () => {
  it.each([[5n, 2n, 'half_up', 3n], [5n, 2n, 'half_even', 2n], [7n, 2n, 'half_even', 4n], [1n, 3n, 'half_up', 0n], [2n, 3n, 'half_up', 1n]] as const)(
    '%s/%s %s → %s', (n, d, m, out) => expect(divRound(n, d, m)).toBe(out));
  it('basis points', () => {
    expect(bps(250000n, 500, 'half_up')).toBe(12500n); // 5% of ₦2,500.00 = ₦125.00
    expect(bps(2550n, 500, 'half_up')).toBe(128n);      // 5% of EC$25.50 = 127.5 → 128 cents
    expect(bps(2550n, 500, 'half_even')).toBe(128n);    // 127.5 → 128 (even)
    expect(bps(2530n, 500, 'half_even')).toBe(126n);    // 126.5 → 126 (even)
  });
});

describe('launch quote: 5% service fee, no commission, items upfront', () => {
  it('Nigeria: ₦2,500 errand + ₦13,000 items', () => {
    const q = quote({ ...base, errandFeeMinor: 250000n, itemEstimateMinor: 1300000n });
    expect(q.lines.map((l) => [l.code, l.amountMinor])).toEqual([['errand_fee', 250000n], ['service_fee', 12500n], ['item_estimate', 1300000n]]);
    expect(q.customerTotalMinor).toBe(1562500n);       // ₦15,625.00
    expect(q.runnerEarningsMinor).toBe(250000n);       // full price (0 commission)
    expect(q.platformRevenueMinor).toBe(12500n);
    expect(q.taxTotalMinor).toBe(0n);
  });
  it('St Vincent: EC$25.50 errand, no items', () => {
    const q = quote({ ...base, currency: 'XCD', errandFeeMinor: 2550n, itemEstimateMinor: 0n });
    expect(q.customerTotalMinor).toBe(2678n);          // EC$26.78
    expect(q.lines.map((l) => l.code)).toEqual(['errand_fee', 'service_fee']);
  });
  it('the service fee never applies to item costs', () => {
    const a = quote({ ...base, errandFeeMinor: 100000n, itemEstimateMinor: 0n });
    const b = quote({ ...base, errandFeeMinor: 100000n, itemEstimateMinor: 9999900n });
    expect(a.lines.find((l) => l.code === 'service_fee')!.amountMinor).toBe(b.lines.find((l) => l.code === 'service_fee')!.amountMinor);
  });
  it('works for currencies with 0 and 3 minor units', () => {
    expect(quote({ ...base, currency: 'JPY', minorUnit: 0, errandFeeMinor: 1990n, itemEstimateMinor: 0n }).customerTotalMinor).toBe(2090n); // 99.5 → 100
    expect(quote({ ...base, currency: 'KWD', minorUnit: 3, errandFeeMinor: 5250n, itemEstimateMinor: 0n }).customerTotalMinor).toBe(5513n); // 262.5 → 263
  });
});

describe('ready for later markets / decisions', () => {
  it('commission comes out of the Runner side, never the customer total', () => {
    const q = quote({ ...base, fees: { ...LAUNCH, commissionBps: 1000 }, errandFeeMinor: 100000n, itemEstimateMinor: 0n });
    expect(q.customerTotalMinor).toBe(105000n);
    expect(q.runnerEarningsMinor).toBe(90000n);
    expect(q.platformRevenueMinor).toBe(15000n);
  });
  it('exclusive VAT on the service fee is added on top; inclusive VAT is carved out', () => {
    const ex = quote({ ...base, errandFeeMinor: 100000n, itemEstimateMinor: 0n, taxRules: [{ id: 'vat', appliesTo: 'service_fee', rateBps: 750, inclusive: false }] });
    expect(ex.lines[1]).toMatchObject({ amountMinor: 5375n, taxMinor: 375n }); // ₦50 fee + 7.5% VAT
    expect(ex.customerTotalMinor).toBe(105375n);
    const inc = quote({ ...base, errandFeeMinor: 100000n, itemEstimateMinor: 0n, taxRules: [{ id: 'vat', appliesTo: 'service_fee', rateBps: 1600, inclusive: true }] });
    expect(inc.lines[1]).toMatchObject({ amountMinor: 5000n, taxMinor: 690n });   // 16% inside ₦50.00
    expect(inc.platformRevenueMinor).toBe(4310n);
  });
  it('clamps the service fee to configured min/max', () => {
    expect(quote({ ...base, fees: { ...LAUNCH, serviceFeeMinMinor: 10000n }, errandFeeMinor: 100000n, itemEstimateMinor: 0n }).lines[1]!.amountMinor).toBe(10000n);
    expect(quote({ ...base, fees: { ...LAUNCH, serviceFeeMaxMinor: 1000n }, errandFeeMinor: 100000n, itemEstimateMinor: 0n }).lines[1]!.amountMinor).toBe(1000n);
  });
  it('invariant: customer total = Σ lines, for many random amounts', () => {
    for (let i = 0; i < 500; i++) {
      const fee = BigInt(1 + Math.floor(Math.random() * 10_000_000));
      const items = BigInt(Math.floor(Math.random() * 10_000_000));
      const q = quote({ ...base, rounding: i % 2 ? 'half_even' : 'half_up', errandFeeMinor: fee, itemEstimateMinor: items });
      expect(q.customerTotalMinor).toBe(q.lines.reduce((s, l) => s + l.amountMinor, 0n));
      expect(q.customerTotalMinor).toBe(fee + items + q.platformRevenueMinor);
    }
  });
  it('rejects zero or negative prices', () => expect(() => quote({ ...base, errandFeeMinor: 0n, itemEstimateMinor: 0n })).toThrow());
});
