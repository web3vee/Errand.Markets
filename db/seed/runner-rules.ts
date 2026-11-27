/**
 * Runner (worker) rules per market — seed values. Editable later via admin (Stage 7).
 * Decisions: customer sets the price, first eligible Runner to accept (2026-11-26);
 * Q16 max 3 concurrent errands; Q13 minimum age 18. No acceptance penalties or required hours.
 */
export const RUNNER_RULES_SEED: Record<string, {
  pricingControl: 'customer_fixed' | 'runner_offers' | 'both' | 'platform_set';
  maxConcurrentErrands: number;
  minAgeYears: number;
  requiredKycLevel: string;
}> = {
  NG: { pricingControl: 'customer_fixed', maxConcurrentErrands: 3, minAgeYears: 18, requiredKycLevel: 'runner_basic' },
  VC: { pricingControl: 'customer_fixed', maxConcurrentErrands: 3, minAgeYears: 18, requiredKycLevel: 'runner_basic' },
};
