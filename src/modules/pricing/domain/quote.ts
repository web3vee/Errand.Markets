/**
 * Pricing (docs/architecture/04 §1). Pure, integer minor units only.
 * Decisions (2026-11-26): customer sets the errand price; service fee 5% of the errand price,
 * paid by the customer; commission 0; customer pays the estimated item cost upfront (held, then
 * reimbursed to the Runner against the receipt). Every fee passes through the tax step (0% at launch).
 */
export type RoundingMode = 'half_up' | 'half_even';

/** round(numerator / denominator) for non-negative bigints. */
export function divRound(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  if (denominator <= 0n || numerator < 0n) throw new RangeError('divRound expects non-negative numerator and positive denominator');
  const q = numerator / denominator;
  const r = numerator % denominator;
  const twice = r * 2n;
  if (twice > denominator) return q + 1n;
  if (twice < denominator) return q;
  return mode === 'half_up' ? q + 1n : q % 2n === 0n ? q : q + 1n;
}

export const bps = (amount: bigint, basisPoints: number, mode: RoundingMode) => divRound(amount * BigInt(basisPoints), 10_000n, mode);

export type FeeSchedule = {
  id: string;
  commissionBps: number;
  serviceFeeBps: number | null;
  serviceFeeFixedMinor: bigint | null;
  serviceFeeMinMinor: bigint | null;
  serviceFeeMaxMinor: bigint | null;
};
export type TaxRule = { id: string; appliesTo: 'service_fee' | 'commission' | 'cancellation_fee' | 'errand_fee'; rateBps: number; inclusive: boolean };

export type QuoteLine = { code: 'errand_fee' | 'service_fee' | 'item_estimate'; amountMinor: bigint; taxMinor: bigint; payer: 'customer'; payee: 'runner' | 'platform' | 'escrow_items' };
export type Quote = {
  currency: string; minorUnit: number; feeScheduleId: string; taxRuleIds: string[];
  lines: QuoteLine[];
  customerTotalMinor: bigint;     // what the customer pays into escrow
  runnerEarningsMinor: bigint;    // errand fee − commission − tax on commission (items reimbursed separately)
  commissionMinor: bigint;
  platformRevenueMinor: bigint;   // service fee + commission (net of inclusive tax)
  taxTotalMinor: bigint;
  itemEstimateMinor: bigint;
};

/** Tax on a line: exclusive → added on top; inclusive → carved out of the line. */
function taxFor(amount: bigint, rules: TaxRule[], appliesTo: TaxRule['appliesTo'], mode: RoundingMode) {
  let extra = 0n, embedded = 0n;
  for (const r of rules.filter((x) => x.appliesTo === appliesTo && x.rateBps > 0)) {
    if (r.inclusive) embedded += amount - divRound(amount * 10_000n, 10_000n + BigInt(r.rateBps), mode);
    else extra += bps(amount, r.rateBps, mode);
  }
  return { extra, embedded };
}

export function quote(input: {
  currency: string; minorUnit: number; rounding: RoundingMode;
  errandFeeMinor: bigint; itemEstimateMinor: bigint;
  fees: FeeSchedule; taxRules: TaxRule[];
}): Quote {
  const { rounding: mode, fees } = input;
  if (input.errandFeeMinor <= 0n || input.itemEstimateMinor < 0n) throw new RangeError('invalid amounts');

  // Service fee: % of the errand price (+ fixed), clamped to [min, max] when configured.
  let service = (fees.serviceFeeBps ? bps(input.errandFeeMinor, fees.serviceFeeBps, mode) : 0n) + (fees.serviceFeeFixedMinor ?? 0n);
  if (fees.serviceFeeMinMinor !== null && service < fees.serviceFeeMinMinor) service = fees.serviceFeeMinMinor;
  if (fees.serviceFeeMaxMinor !== null && service > fees.serviceFeeMaxMinor) service = fees.serviceFeeMaxMinor;

  const serviceTax = taxFor(service, input.taxRules, 'service_fee', mode);
  const feeTax = taxFor(input.errandFeeMinor, input.taxRules, 'errand_fee', mode);
  const commission = bps(input.errandFeeMinor, fees.commissionBps, mode);
  const commissionTax = taxFor(commission, input.taxRules, 'commission', mode);

  const lines: QuoteLine[] = [
    { code: 'errand_fee', amountMinor: input.errandFeeMinor + feeTax.extra, taxMinor: feeTax.extra + feeTax.embedded, payer: 'customer', payee: 'runner' },
    ...(service > 0n ? [{ code: 'service_fee' as const, amountMinor: service + serviceTax.extra, taxMinor: serviceTax.extra + serviceTax.embedded, payer: 'customer' as const, payee: 'platform' as const }] : []),
    ...(input.itemEstimateMinor > 0n ? [{ code: 'item_estimate' as const, amountMinor: input.itemEstimateMinor, taxMinor: 0n, payer: 'customer' as const, payee: 'escrow_items' as const }] : []),
  ];
  const taxTotal = lines.reduce((s, l) => s + l.taxMinor, 0n) + commissionTax.extra + commissionTax.embedded;
  return {
    currency: input.currency, minorUnit: input.minorUnit, feeScheduleId: fees.id, taxRuleIds: input.taxRules.map((r) => r.id),
    lines,
    customerTotalMinor: lines.reduce((s, l) => s + l.amountMinor, 0n),
    runnerEarningsMinor: input.errandFeeMinor - commission - commissionTax.extra - feeTax.embedded,
    commissionMinor: commission,
    platformRevenueMinor: service - serviceTax.embedded + commission - commissionTax.embedded,
    taxTotalMinor: taxTotal,
    itemEstimateMinor: input.itemEstimateMinor,
  };
}
