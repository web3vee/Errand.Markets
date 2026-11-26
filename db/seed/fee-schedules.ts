/**
 * Fee schedule seed per market. NULL = not decided yet (nothing enforced).
 * Decided 2026-11-26: commission 0 at launch; service fee 5% of the errand price, paid by the customer
 * (Q4a); no minimum errand price — customers set any price (Q4b). Accepted defaults: auto-release 24h,
 * reminders 2h/20h, funding timeout 30 min, errand expiry 48h (Q15).
 * Open: item-cost cap (Q1d), cancellation fee (Q5).
 */
export const FEE_SCHEDULE_SEED = {
  commissionBps: 0,
  serviceFeeBps: 500,
  serviceFeeFixedMinor: null,
  serviceFeeMinMinor: null,
  serviceFeeMaxMinor: null,
  cancellationFeeMinor: null,
  minErrandPriceMinor: null,
  maxItemCostMinor: null,
  autoReleaseHours: 24,
  reminderOffsetsHours: [2, 20],
  unfundedOfferTimeoutMinutes: 30,
  errandDefaultExpiryHours: 48,
} as const;
