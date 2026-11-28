import { beforeAll, describe, expect, it } from 'vitest';
import { signLocalSession, verifyLocalSession } from '@/server/auth/local';

beforeAll(() => { process.env.LOCAL_AUTH_SECRET = 'unit-test-local-auth-secret-0123456789'; });

describe('local session tokens', () => {
  it('phone sign-in: carries the phone in the session and claims', async () => {
    const s = await verifyLocalSession(await signLocalSession('11111111-1111-4111-8111-111111111111', '+2348031234567'));
    expect(s).toMatchObject({ phoneE164: '+2348031234567', email: null, claims: { phone: '+2348031234567', role: 'authenticated' } });
  });
  it('Google sign-in: email and name, no phone claim', async () => {
    const s = await verifyLocalSession(await signLocalSession('22222222-2222-4222-8222-222222222222', { phone: null, email: 'g@example.com', name: 'Gloria' }));
    expect(s).toMatchObject({ phoneE164: null, email: 'g@example.com', name: 'Gloria' });
    expect(s!.claims).not.toHaveProperty('phone');
  });
  it('rejects a token with neither phone nor email, and tampered tokens', async () => {
    expect(await verifyLocalSession(await signLocalSession('33333333-3333-4333-8333-333333333333', { phone: null, email: null, name: 'x' }))).toBeNull();
    const t = await signLocalSession('44444444-4444-4444-8444-444444444444', '+2348031234567');
    expect(await verifyLocalSession(t.slice(0, -2) + (t.endsWith('A') ? 'BB' : 'AA'))).toBeNull();
  });
});
