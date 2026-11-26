import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { kycVerifications, markets, providerWebhookEvents, runnerProfiles } from '../../db/schema';
import { becomeRunner, getAccount, updateRunnerProfile } from '@/modules/identity/service';
import { decideVerification, ingestKycWebhook, KycError, listReviews, startVerification } from '@/modules/kyc/service';
import { hitRateLimit } from '@/modules/platform/rate-limit';
import { SANDBOX_SIGNATURE_HEADER, SandboxKyc, signSandboxPayload } from '@/providers/kyc/sandbox';
import { areas, db, makeAdmin, makeUser, market } from './helpers';

const SECRET = 'test-sandbox-secret';
const kyc = new SandboxKyc({ secret: SECRET, launchUrl: (id) => `/en/x/runner/verify/sandbox?v=${id}` });

async function runnerWithProfile(code: 'NG' | 'VC', name = 'Ada Obi') {
  const u = await makeUser(code, name);
  await becomeRunner(db(), u.id);
  await updateRunnerProfile(db(), u.claims, { bio: null, vehicle: 'motorbike', emergencyContactName: null, emergencyContactPhone: null, serviceAreaIds: [(await areas(code))[0]!.id] });
  return u;
}

async function start(code: 'NG' | 'VC', u: { id: string; phone: string }) {
  const m = await market(code);
  const ctx = { market: { id: m.id, code, currency: m.currencyCode, minorUnit: m.currencyMinorUnit, timezone: m.timezone, locale: 'en' }, mode: 'sandbox' as const };
  return startVerification(db(), { kyc, ctx, market: { id: m.id, code, kycAutoApprove: m.kycAutoApprove } }, { userId: u.id, phoneE164: u.phone, locale: 'en', returnUrl: '/' });
}

async function deliver(code: 'NG' | 'VC', p: { verificationId: string; userId: string; outcome?: string; dob?: string; idNumber?: string; name?: string; eventId?: string }) {
  const m = await market(code);
  const raw = JSON.stringify({
    eventId: p.eventId ?? randomUUID(), verificationId: p.verificationId, userId: p.userId, outcome: p.outcome ?? 'approved', livenessPassed: true,
    document: { type: code === 'NG' ? 'nin' : 'national_id', idNumber: p.idNumber ?? randomUUID().slice(0, 11), name: p.name ?? 'Ada Obi', dateOfBirth: p.dob ?? '1995-06-15' },
  });
  const verified = await kyc.verifyWebhook({ rawBody: raw, headers: new Headers({ [SANDBOX_SIGNATURE_HEADER]: signSandboxPayload(SECRET, raw) }) });
  if (!verified.valid) throw new Error('bad signature in test');
  return ingestKycWebhook(db(), { providerKey: 'sandbox-kyc', market: { id: m.id, code, kycAutoApprove: m.kycAutoApprove }, verified, rawPayload: JSON.parse(raw), pepper: 'test-pepper' });
}

const runnerStatus = async (id: string) => (await db().select({ s: runnerProfiles.kycStatus }).from(runnerProfiles).where(eq(runnerProfiles.userId, id)))[0]!.s;

describe.each(['NG', 'VC'] as const)('Runner KYC end to end — %s', (code) => {
  it('sign-up → Runner profile → provider approves → admin approves', async () => {
    const r = await runnerWithProfile(code);
    const { verificationId, launch } = await start(code, r);
    expect(launch.kind).toBe('url');
    expect(await runnerStatus(r.id)).toBe('pending');

    const eventId = randomUUID();
    expect((await deliver(code, { verificationId, userId: r.id, eventId })).outcome).toBe('processed');
    expect(await runnerStatus(r.id)).toBe('in_review'); // admin approval required (Q8)

    // Same event delivered again → no-op.
    expect((await deliver(code, { verificationId, userId: r.id, eventId })).outcome).toBe('duplicate');
    const events = await db().select().from(providerWebhookEvents).where(eq(providerWebhookEvents.eventId, eventId));
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0]!.payload)).not.toContain('Ada Obi'); // PII redacted

    const admin = await makeAdmin(code);
    const queue = await listReviews(db(), admin.claims, { marketIds: [(await market(code)).id], statuses: ['in_review'] });
    expect(queue.map((q) => q.userId)).toContain(r.id);

    await decideVerification(db(), { adminId: admin.id, adminScope: [(await market(code)).id], verificationId, decision: 'approve', reasonCode: null, note: null });
    expect(await runnerStatus(r.id)).toBe('approved');
    const acct = await getAccount(db(), r.claims);
    expect(acct?.runner?.kycStatus).toBe('approved');
    const [v] = await db().select().from(kycVerifications).where(eq(kycVerifications.id, verificationId));
    expect(v!.idNumberHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(v!.resultSummary)).not.toMatch(/\d{11}/); // no raw ID number stored
  });

  it('an admin from the other market cannot decide (scope enforced in the service too)', async () => {
    const r = await runnerWithProfile(code);
    const { verificationId } = await start(code, r);
    await deliver(code, { verificationId, userId: r.id });
    const other = code === 'NG' ? 'VC' : 'NG';
    const foreign = await makeAdmin(other);
    await expect(decideVerification(db(), { adminId: foreign.id, adminScope: [(await market(other)).id], verificationId, decision: 'approve', reasonCode: null, note: null }))
      .rejects.toBeInstanceOf(KycError);
    const queue = await listReviews(db(), foreign.claims, { marketIds: 'all', statuses: [] });
    expect(queue.map((q) => q.userId)).not.toContain(r.id); // RLS hides it even with 'all'
  });
});

describe('KYC safeguards', () => {
  it('flags under-age Runners and duplicate identities for the admin', async () => {
    const minor = await runnerWithProfile('NG');
    const v1 = await start('NG', minor);
    await deliver('NG', { verificationId: v1.verificationId, userId: minor.id, dob: '2012-01-01', idNumber: '99999999901' });
    const [row] = await db().select().from(kycVerifications).where(eq(kycVerifications.id, v1.verificationId));
    expect((row!.resultSummary as { flags: string[] }).flags).toContain('underage');

    const first = await runnerWithProfile('NG', 'Chi Eze');
    const a = await start('NG', first);
    await deliver('NG', { verificationId: a.verificationId, userId: first.id, idNumber: '55555555555', name: 'Chi Eze' });
    const second = await runnerWithProfile('NG', 'Someone Else');
    const b = await start('NG', second);
    await deliver('NG', { verificationId: b.verificationId, userId: second.id, idNumber: '555 5555 5555', name: 'Someone Else' });
    const [dup] = await db().select().from(kycVerifications).where(eq(kycVerifications.id, b.verificationId));
    expect((dup!.resultSummary as { flags: string[] }).flags).toContain('duplicate_identity');
  });

  it('auto-approves only when the market enables it and nothing is flagged', async () => {
    await db().update(markets).set({ kycAutoApprove: true }).where(eq(markets.code, 'VC'));
    try {
      const r = await runnerWithProfile('VC');
      const { verificationId } = await start('VC', r);
      await deliver('VC', { verificationId, userId: r.id });
      expect(await runnerStatus(r.id)).toBe('approved');
    } finally {
      await db().update(markets).set({ kycAutoApprove: false }).where(eq(markets.code, 'VC'));
    }
  });

  it('a verified Runner cannot start another verification; late provider events after a decision are ignored', async () => {
    const r = await runnerWithProfile('VC');
    const { verificationId } = await start('VC', r);
    await deliver('VC', { verificationId, userId: r.id });
    const admin = await makeAdmin('VC');
    await decideVerification(db(), { adminId: admin.id, adminScope: 'all', verificationId, decision: 'approve', reasonCode: null, note: null });
    await expect(start('VC', r)).rejects.toMatchObject({ code: 'already_approved' });
    await deliver('VC', { verificationId, userId: r.id, outcome: 'rejected' });
    expect(await runnerStatus(r.id)).toBe('approved');
  });

  it('rejects webhooks for verifications in another market', async () => {
    const r = await runnerWithProfile('NG');
    const { verificationId } = await start('NG', r);
    await expect(deliver('VC', { verificationId, userId: r.id })).rejects.toThrow(/unknown verification/);
  });
});

describe('rate limiting', () => {
  it('counts within a window and blocks over the limit', async () => {
    const key = `test:${randomUUID()}`;
    const now = new Date('2026-11-26T10:00:05Z');
    expect((await hitRateLimit(db(), key, 2, 60, now)).allowed).toBe(true);
    expect((await hitRateLimit(db(), key, 2, 60, now)).allowed).toBe(true);
    const third = await hitRateLimit(db(), key, 2, 60, now);
    expect(third).toMatchObject({ allowed: false, count: 3, retryAfterSeconds: 55 });
    expect((await hitRateLimit(db(), key, 2, 60, new Date('2026-11-26T10:01:00Z'))).allowed).toBe(true);
    await db().execute(sql`delete from rate_limits where key = ${key}`);
  });
});
