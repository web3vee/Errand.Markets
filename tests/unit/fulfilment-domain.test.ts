import { describe, expect, it } from 'vitest';
import {
  checkComplete, itemDifferenceMinor, partyOf, ratingRevealed, ratingWindowEnds, ratingWindowOpen, remindersDue, RATING_WINDOW_DAYS,
} from '@/modules/errands/domain/fulfilment';

const H = 3_600_000;
const t0 = new Date('2026-11-28T10:00:00Z');
const at = (hours: number) => new Date(t0.getTime() + hours * H);

describe('completing an errand', () => {
  it('needs a proof photo', () => {
    expect(checkComplete({ requiresPurchase: false, proofCount: 0, receiptCount: 0, itemActualMinor: null })).toEqual({ ok: false, reason: 'proof_required' });
    expect(checkComplete({ requiresPurchase: false, proofCount: 1, receiptCount: 0, itemActualMinor: null })).toEqual({ ok: true });
  });
  it('purchase errands also need a receipt and the amount spent (zero is allowed)', () => {
    expect(checkComplete({ requiresPurchase: true, proofCount: 1, receiptCount: 0, itemActualMinor: 100n })).toEqual({ ok: false, reason: 'receipt_required' });
    expect(checkComplete({ requiresPurchase: true, proofCount: 1, receiptCount: 1, itemActualMinor: null })).toEqual({ ok: false, reason: 'amount_required' });
    expect(checkComplete({ requiresPurchase: true, proofCount: 1, receiptCount: 1, itemActualMinor: -1n })).toEqual({ ok: false, reason: 'amount_required' });
    expect(checkComplete({ requiresPurchase: true, proofCount: 1, receiptCount: 1, itemActualMinor: 0n })).toEqual({ ok: true });
  });
});

describe('confirmation reminders', () => {
  const base = { completedAt: t0, autoReleaseAt: at(24), offsetsHours: [20, 2] };
  it('sends each offset once, in order', () => {
    expect(remindersDue({ ...base, sent: 0, now: at(1) })).toBeNull();
    expect(remindersDue({ ...base, sent: 0, now: at(2) })).toBe(1);
    expect(remindersDue({ ...base, sent: 1, now: at(3) })).toBeNull();
    expect(remindersDue({ ...base, sent: 1, now: at(20) })).toBe(2);
    expect(remindersDue({ ...base, sent: 0, now: at(21) })).toBe(2); // a late sweep catches up with one reminder
    expect(remindersDue({ ...base, sent: 2, now: at(23) })).toBeNull();
  });
  it('ignores offsets at or after auto-release', () => {
    expect(remindersDue({ ...base, autoReleaseAt: at(10), sent: 1, now: at(21) })).toBeNull();
  });
});

describe('blind ratings', () => {
  it(`window is ${RATING_WINDOW_DAYS} days after confirmation`, () => {
    expect(ratingWindowOpen(null, t0)).toBe(false);
    expect(ratingWindowOpen(t0, at(24 * 7 - 1))).toBe(true);
    expect(ratingWindowOpen(t0, at(24 * 7))).toBe(false);
    expect(ratingWindowEnds(t0)).toEqual(at(24 * 7));
  });
  it('a rating is revealed when the other side has rated, or the window has closed', () => {
    expect(ratingRevealed({ otherSideRated: false, confirmedAt: t0, now: at(1) })).toBe(false);
    expect(ratingRevealed({ otherSideRated: true, confirmedAt: t0, now: at(1) })).toBe(true);
    expect(ratingRevealed({ otherSideRated: false, confirmedAt: t0, now: at(24 * 8) })).toBe(true);
  });
});

describe('helpers', () => {
  it('works out who is who', () => {
    const e = { customerId: 'c', runnerId: 'r' };
    expect(partyOf(e, 'c')).toBe('customer');
    expect(partyOf(e, 'r')).toBe('runner');
    expect(partyOf(e, 'x')).toBeNull();
    expect(partyOf({ customerId: 'c', runnerId: null }, 'r')).toBeNull();
  });
  it('item difference: positive = top-up, negative = surplus', () => {
    expect(itemDifferenceMinor(1000n, 1200n)).toBe(200n);
    expect(itemDifferenceMinor(1000n, 900n)).toBe(-100n);
  });
});
