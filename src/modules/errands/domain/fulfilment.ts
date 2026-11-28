/**
 * Stage 5 fulfilment rules (docs/architecture/12-fulfilment.md). Pure functions: no I/O.
 */
import type { ErrandStatus } from './state-machine';

/** Q11 (default accepted): ratings are two-way and blind for 7 days after confirmation. Mirrors app.rating_window_open. */
export const RATING_WINDOW_DAYS = 7;
const DAY = 86_400_000;

export type Party = 'customer' | 'runner';
export const DISPUTABLE_STATUSES: ErrandStatus[] = ['funded', 'in_progress', 'completed_pending_confirmation'];
export const DISPUTE_REASONS = ['not_done', 'wrong_items', 'damaged', 'receipt_mismatch', 'unreachable', 'wrong_location', 'safety', 'other'] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number];
export const CANCELLABLE_BY_CUSTOMER: ErrandStatus[] = ['draft', 'open', 'offer_accepted'];

export function partyOf(errand: { customerId: string; runnerId: string | null }, userId: string): Party | null {
  if (errand.customerId === userId) return 'customer';
  if (errand.runnerId === userId) return 'runner';
  return null;
}

export type CompleteCheck = { ok: true } | { ok: false; reason: 'proof_required' | 'receipt_required' | 'amount_required' };

/** Completing needs at least one proof photo; purchase errands also need a receipt photo and the amount spent. */
export function checkComplete(input: { requiresPurchase: boolean; proofCount: number; receiptCount: number; itemActualMinor: bigint | null }): CompleteCheck {
  if (input.proofCount < 1) return { ok: false, reason: 'proof_required' };
  if (input.requiresPurchase) {
    if (input.receiptCount < 1) return { ok: false, reason: 'receipt_required' };
    if (input.itemActualMinor === null || input.itemActualMinor < 0n) return { ok: false, reason: 'amount_required' };
  }
  return { ok: true };
}

/**
 * How many "please confirm" reminders should have gone out by `now` (offsets in hours after completion).
 * Returns null when nothing new is due. Offsets past the auto-release time are ignored.
 */
export function remindersDue(input: { completedAt: Date; autoReleaseAt: Date | null; offsetsHours: number[]; sent: number; now: Date }): number | null {
  const due = [...input.offsetsHours].sort((a, b) => a - b).filter((h) => {
    const at = input.completedAt.getTime() + h * 3_600_000;
    return at <= input.now.getTime() && (!input.autoReleaseAt || at < input.autoReleaseAt.getTime());
  }).length;
  return due > input.sent ? due : null;
}

export const ratingWindowOpen = (confirmedAt: Date | null, now: Date) => !!confirmedAt && now.getTime() < confirmedAt.getTime() + RATING_WINDOW_DAYS * DAY;
export const ratingWindowEnds = (confirmedAt: Date) => new Date(confirmedAt.getTime() + RATING_WINDOW_DAYS * DAY);

/** A rating becomes visible to the person rated once they've rated back, or the window has closed. */
export const ratingRevealed = (input: { otherSideRated: boolean; confirmedAt: Date | null; now: Date }) =>
  input.otherSideRated || !ratingWindowOpen(input.confirmedAt, input.now);

/** Positive: the Runner spent more than the estimate (customer owes a top-up). Negative: surplus to refund. */
export const itemDifferenceMinor = (estimateMinor: bigint, actualMinor: bigint) => actualMinor - estimateMinor;
