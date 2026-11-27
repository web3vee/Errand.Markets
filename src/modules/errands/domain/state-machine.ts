/**
 * Errand state machine (docs/architecture/03). Pure and table-driven.
 * The same transition list is enforced by the Postgres trigger app.errand_transition_allowed
 * (an integration test asserts the two lists are identical).
 */
export const ERRAND_STATUSES = [
  'draft', 'open', 'offer_accepted', 'funded', 'in_progress', 'completed_pending_confirmation', 'confirmed', 'paid_out',
  'cancelled', 'disputed', 'refunded', 'expired',
] as const;
export type ErrandStatus = (typeof ERRAND_STATUSES)[number];

export const TRANSITIONS: readonly (readonly [ErrandStatus, ErrandStatus])[] = [
  ['draft', 'open'], ['draft', 'cancelled'],
  ['open', 'offer_accepted'], ['open', 'cancelled'], ['open', 'expired'],
  ['offer_accepted', 'funded'], ['offer_accepted', 'open'], ['offer_accepted', 'cancelled'],
  ['funded', 'in_progress'], ['funded', 'cancelled'], ['funded', 'disputed'],
  ['in_progress', 'completed_pending_confirmation'], ['in_progress', 'cancelled'], ['in_progress', 'disputed'],
  ['completed_pending_confirmation', 'confirmed'], ['completed_pending_confirmation', 'disputed'],
  ['disputed', 'confirmed'], ['disputed', 'refunded'],
  ['confirmed', 'paid_out'],
  ['cancelled', 'refunded'],
];

export const canTransition = (from: ErrandStatus, to: ErrandStatus) => TRANSITIONS.some(([f, t]) => f === from && t === to);

/** Statuses in which a Runner is "busy" with the errand (counts toward max concurrent errands). */
export const ACTIVE_RUNNER_STATUSES: ErrandStatus[] = ['offer_accepted', 'funded', 'in_progress', 'completed_pending_confirmation', 'disputed'];
/** Statuses where the assigned Runner may see exact locations and contact numbers (after payment). */
export const FULL_DETAIL_STATUSES: ErrandStatus[] = ['funded', 'in_progress', 'completed_pending_confirmation', 'confirmed', 'paid_out', 'disputed'];
export const TERMINAL_STATUSES: ErrandStatus[] = ['paid_out', 'refunded', 'expired', 'cancelled'];

export type AcceptCheck =
  | { ok: true }
  | { ok: false; reason: 'not_open' | 'own_errand' | 'not_verified' | 'wrong_market' | 'blocked' | 'too_many_active' | 'under_review' };

/** Guards for a Runner accepting the customer's price (first eligible Runner wins). */
export function checkAccept(input: {
  errand: { status: ErrandStatus; marketId: string; customerId: string; reviewState: string };
  runner: { id: string; marketId: string; kycStatus: string; hasRunnerRole: boolean; activeCount: number };
  maxConcurrent: number;
  blocked: boolean;
}): AcceptCheck {
  const { errand: e, runner: r } = input;
  if (e.status !== 'open') return { ok: false, reason: 'not_open' };
  if (e.reviewState === 'pending_review') return { ok: false, reason: 'under_review' };
  if (r.id === e.customerId) return { ok: false, reason: 'own_errand' };
  if (!r.hasRunnerRole || r.kycStatus !== 'approved') return { ok: false, reason: 'not_verified' };
  if (r.marketId !== e.marketId) return { ok: false, reason: 'wrong_market' };
  if (input.blocked) return { ok: false, reason: 'blocked' };
  if (r.activeCount >= input.maxConcurrent) return { ok: false, reason: 'too_many_active' };
  return { ok: true };
}
