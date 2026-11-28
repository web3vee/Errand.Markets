/**
 * Runner (worker) rules per market — seed values. Editable later via admin (Stage 7).
 * Decisions: customer sets the price, first eligible Runner to accept (2026-11-26);
 * Q16 max 3 concurrent errands; Q13 minimum age 18. No acceptance penalties or required hours.
 */
export type RunnerRulesSeed = {
  pricingControl: 'customer_fixed' | 'runner_offers' | 'both' | 'platform_set';
  maxConcurrentErrands: number;
  minAgeYears: number;
  requiredKycLevel: string;
};

/** Applies to any market without its own entry below, so a new market is never seeded without rules. */
export const DEFAULT_RUNNER_RULES: RunnerRulesSeed = { pricingControl: 'customer_fixed', maxConcurrentErrands: 3, minAgeYears: 18, requiredKycLevel: 'runner_basic' };

/** Per-market overrides (none today: every launch market uses the defaults). */
export const RUNNER_RULES_SEED: Record<string, RunnerRulesSeed> = {};

export const runnerRulesFor = (code: string): RunnerRulesSeed => RUNNER_RULES_SEED[code] ?? DEFAULT_RUNNER_RULES;
