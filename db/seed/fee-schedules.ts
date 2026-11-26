/**
 * Fee schedule seed per market. NULL = not decided yet (nothing enforced).
 * Decided: commission 0 at launch (2026-11-26). Accepted defaults: auto-release 24h, reminders 2h/20h,
 * funding timeout 30 min, errand expiry 48h (Q15).
 * Open: service fee (Q4a), minimum errand price (Q4b), item-cost cap (Q1d), cancellation fee (Q5).
 */
export const FEE_SCHEDULE_SEED = {
  commissionBps: 0,
  serviceFeeBps: null,
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
