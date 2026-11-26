import { describe, expect, it } from 'vitest';
import { challengeUsable, generateOtp, hashOtp, OTP_POLICY, otpMatches } from '@/modules/identity/domain/otp';
import { adminScope, canAdmin, safeNextPath } from '@/modules/identity/domain/policy';
import { windowStart } from '@/modules/platform/rate-limit';

describe('OTP', () => {
  it('generates zero-padded 6-digit codes', () => {
    expect(generateOtp(() => 42)).toBe('000042');
    expect(generateOtp()).toMatch(/^\d{6}$/);
  });
  it('binds the hash to the phone number and secret', () => {
    const h = hashOtp('s', '+2348031234567', '123456');
    expect(otpMatches('s', '+2348031234567', '123456', h)).toBe(true);
    expect(otpMatches('s', '+2348031234568', '123456', h)).toBe(false); // other phone
    expect(otpMatches('other', '+2348031234567', '123456', h)).toBe(false); // other secret
    expect(otpMatches('s', '+2348031234567', '654321', h)).toBe(false);
  });
  it('rejects malformed codes without comparing', () => {
    const h = hashOtp('s', '+1', '123456');
    for (const bad of ['12345', '1234567', 'abcdef', '', '12 456']) expect(otpMatches('s', '+1', bad, h)).toBe(false);
  });
  it('expires and locks challenges', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const future = new Date(now.getTime() + 60_000);
    expect(challengeUsable({ attempts: 0, expiresAt: future, consumedAt: null }, now)).toBe('ok');
    expect(challengeUsable({ attempts: 0, expiresAt: now, consumedAt: null }, now)).toBe('expired');
    expect(challengeUsable({ attempts: 0, expiresAt: future, consumedAt: now }, now)).toBe('expired');
    expect(challengeUsable({ attempts: OTP_POLICY.maxAttemptsPerCode, expiresAt: future, consumedAt: null }, now)).toBe('too_many_attempts');
  });
});

describe('admin RBAC', () => {
  const admin = [{ role: 'admin', status: 'active' }];
  const NG = 'ng-id', VC = 'vc-id';
  it('scopes to granted markets and permissions', () => {
    const grants = [{ marketId: NG, permissions: ['ops'], revokedAt: null }];
    expect(adminScope(admin, grants, 'ops')).toEqual([NG]);
    expect(adminScope(admin, grants, 'finance')).toEqual([]);
    expect(canAdmin(admin, grants, NG, 'ops')).toBe(true);
    expect(canAdmin(admin, grants, VC, 'ops')).toBe(false);
  });
  it('treats a NULL market grant as all markets, and super as every permission', () => {
    expect(adminScope(admin, [{ marketId: null, permissions: ['super'], revokedAt: null }], 'finance')).toBe('all');
  });
  it('ignores revoked grants and inactive admin role', () => {
    const g = [{ marketId: null, permissions: ['ops'], revokedAt: new Date() }];
    expect(adminScope(admin, g, 'ops')).toEqual([]);
    expect(adminScope([{ role: 'admin', status: 'revoked' }], [{ marketId: null, permissions: ['ops'], revokedAt: null }], 'ops')).toEqual([]);
    expect(adminScope([{ role: 'customer', status: 'active' }], [{ marketId: null, permissions: ['ops'], revokedAt: null }], 'ops')).toEqual([]);
  });
});

describe('safeNextPath (open-redirect protection)', () => {
  it.each([
    ['/en/ng/account', '/en/ng/account'],
    ['/en/ng/runner?x=1', '/en/ng/runner?x=1'],
    ['https://evil.com/en/ng', null],
    ['//evil.com/en/ng', null],
    ['/fr/ng/account', null],
    ['/en/../../evil', null],
    ['/en/ng/../vc/account', '/en/vc/account'],
    ['/en\\@evil.com', null],
    [null, null],
  ])('%s → %s', (input, expected) => expect(safeNextPath(input as string | null, 'en')).toBe(expected));
});

describe('rate limit windows', () => {
  it('aligns to fixed windows', () => {
    expect(windowStart(new Date('2026-01-01T10:59:59Z'), 3600).toISOString()).toBe('2026-01-01T10:00:00.000Z');
    expect(windowStart(new Date('2026-01-01T10:00:30Z'), 60).toISOString()).toBe('2026-01-01T10:00:00.000Z');
  });
});
