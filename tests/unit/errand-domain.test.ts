import { describe, expect, it } from 'vitest';
import { minorToInput, parseAmountToMinor } from '@/modules/errands/domain/amount';
import { areaContaining, circlePolygon, haversineKm, pointInGeometry } from '@/modules/errands/domain/geo';
import { screenText } from '@/modules/errands/domain/screening';
import { canTransition, checkAccept, ERRAND_STATUSES, TRANSITIONS } from '@/modules/errands/domain/state-machine';

describe('state machine', () => {
  it('allows the documented happy path and nothing that skips payment', () => {
    const path = ['draft', 'open', 'offer_accepted', 'funded', 'in_progress', 'completed_pending_confirmation', 'confirmed', 'paid_out'] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
    expect(canTransition('offer_accepted', 'in_progress')).toBe(false);
    expect(canTransition('open', 'funded')).toBe(false);
    expect(canTransition('completed_pending_confirmation', 'paid_out')).toBe(false);
  });
  it('terminal states have no exits except cancelled → refunded', () => {
    for (const s of ['paid_out', 'refunded', 'expired'] as const) expect(TRANSITIONS.filter(([f]) => f === s)).toEqual([]);
    expect(TRANSITIONS.filter(([f]) => f === 'cancelled')).toEqual([['cancelled', 'refunded']]);
  });
  it('only uses known statuses', () => {
    for (const [f, t] of TRANSITIONS) { expect(ERRAND_STATUSES).toContain(f); expect(ERRAND_STATUSES).toContain(t); }
  });
});

describe('checkAccept (first eligible Runner wins)', () => {
  const errand = { status: 'open' as const, marketId: 'NG', customerId: 'c', reviewState: 'none' };
  const runner = { id: 'r', marketId: 'NG', kycStatus: 'approved', hasRunnerRole: true, activeCount: 0 };
  const base = { errand, runner, maxConcurrent: 3, blocked: false };
  it('accepts an eligible Runner', () => expect(checkAccept(base)).toEqual({ ok: true }));
  it.each([
    [{ errand: { ...errand, status: 'offer_accepted' as const } }, 'not_open'],
    [{ errand: { ...errand, reviewState: 'pending_review' } }, 'under_review'],
    [{ runner: { ...runner, id: 'c' } }, 'own_errand'],
    [{ runner: { ...runner, kycStatus: 'in_review' } }, 'not_verified'],
    [{ runner: { ...runner, hasRunnerRole: false } }, 'not_verified'],
    [{ runner: { ...runner, marketId: 'VC' } }, 'wrong_market'],
    [{ blocked: true }, 'blocked'],
    [{ runner: { ...runner, activeCount: 3 } }, 'too_many_active'],
  ])('rejects %o → %s', (over, reason) => expect(checkAccept({ ...base, ...over } as never)).toEqual({ ok: false, reason }));
});

describe('parseAmountToMinor (no floats, precision from config)', () => {
  it.each([
    ['2500', 2, 'en-NG', 250000n], ['2,500.50', 2, 'en-NG', 250050n], ['₦ 1,500', 2, 'en-NG', 150000n],
    ['EC$25.5', 2, 'en-VC', 2550n], ['0.05', 2, 'en', 5n], ['1500', 0, 'ja-JP', 1500n], ['1.234', 3, 'en', 1234n],
    ['1.234,56', 2, 'de-DE', 123456n], ['99999999999999.99', 2, 'en', 9999999999999999n],
  ])('%s (%s dp, %s) → %s', (s, mu, loc, out) => expect(parseAmountToMinor(s, mu, loc)).toBe(out));
  it.each([['', 2], ['abc', 2], ['1.234', 2], ['1.5', 0], ['-5', 2], ['1.2.3', 2]])('rejects %s', (s, mu) =>
    expect(parseAmountToMinor(s, mu, 'en')).toBeNull());
  it('round-trips for input pre-fill', () => {
    expect(minorToInput(250050n, 2, 'en-NG')).toBe('2500.50');
    expect(minorToInput(250000n, 2, 'en-NG')).toBe('2500');
    expect(parseAmountToMinor(minorToInput(123456n, 2, 'de-DE'), 2, 'de-DE')).toBe(123456n);
  });
});

describe('geo', () => {
  const wuse2 = { lat: 9.0765, lng: 7.47 };
  const poly = circlePolygon(wuse2, 1.6);
  it('builds closed circular boundaries of the right size', () => {
    const ring = poly.coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    const edge = { lat: ring[0]![1]!, lng: ring[0]![0]! };
    expect(haversineKm(wuse2, edge)).toBeCloseTo(1.6, 1);
  });
  it('point-in-polygon', () => {
    expect(pointInGeometry(wuse2, poly)).toBe(true);
    expect(pointInGeometry({ lat: 9.0765, lng: 7.5 }, poly)).toBe(false); // ~3.3 km east
    expect(pointInGeometry({ lat: 13.1587, lng: -61.2248 }, poly)).toBe(false);
  });
  it('respects holes and picks the containing area', () => {
    const donut = { type: 'Polygon' as const, coordinates: [circlePolygon(wuse2, 2).coordinates[0]!, circlePolygon(wuse2, 0.5).coordinates[0]!] };
    expect(pointInGeometry(wuse2, donut)).toBe(false);
    expect(areaContaining(wuse2, [{ id: 'x', boundary: null }, { id: 'w2', boundary: poly }])?.id).toBe('w2');
  });
});

describe('prohibited-item screening', () => {
  const rules = [
    { id: '1', label: 'Firearms', keywords: ['gun', 'ammunition'], action: 'block' as const },
    { id: '2', label: 'Prescription medicine', keywords: ['prescription', 'codeine'], action: 'review' as const },
  ];
  it('blocks, reviews or allows', () => {
    expect(screenText(['Buy a GUN please'], rules).action).toBe('block');
    expect(screenText(['Pick up my prescription'], rules).action).toBe('review');
    expect(screenText(['Need guns and codeine'], rules).action).toBe('block');
    expect(screenText(['Buy bread and milk'], rules)).toEqual({ action: 'allow', matches: [] });
  });
  it('matches whole words only (no false positives inside other words)', () => {
    expect(screenText(['Collect the burgundy bag from Begun Street'], rules).action).toBe('allow');
  });
  it('ignores accents and punctuation', () => expect(screenText(['Códeine!!'], rules).action).toBe('review'));
  it('an empty list allows everything (launch state until legal provides lists)', () =>
    expect(screenText(['anything'], []).action).toBe('allow'));
});
