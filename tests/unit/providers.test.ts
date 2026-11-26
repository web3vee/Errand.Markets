import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { Webhook } from 'standardwebhooks';
import { DojahKyc } from '@/providers/kyc/dojah';
import { SANDBOX_SIGNATURE_HEADER, SandboxKyc, signSandboxPayload } from '@/providers/kyc/sandbox';
import { SumsubKyc, sumsubSignature } from '@/providers/kyc/sumsub';
import { TermiiSms } from '@/providers/sms/termii';
import { TwilioSms } from '@/providers/sms/twilio';

const ctx = { market: { id: 'm', code: 'NG', currency: 'NGN', minorUnit: 2, timezone: 'Africa/Lagos', locale: 'en' }, mode: 'live' as const };

describe('sandbox KYC webhook', () => {
  const kyc = new SandboxKyc({ secret: 'sek', launchUrl: (id) => `/x?v=${id}` });
  const body = JSON.stringify({
    eventId: 'evt-12345678', verificationId: '0193a0f0-0000-7000-8000-000000000001', userId: '0193a0f0-0000-4000-8000-000000000002',
    outcome: 'approved', livenessPassed: true, document: { type: 'nin', idNumber: '12345678901', name: 'Ada Obi', dateOfBirth: '1995-06-15' },
  });
  it('accepts a correctly signed payload', async () => {
    const r = await kyc.verifyWebhook({ rawBody: body, headers: new Headers({ [SANDBOX_SIGNATURE_HEADER]: signSandboxPayload('sek', body) }) });
    expect(r.valid && r.events[0]?.result.status).toBe('approved');
  });
  it('rejects a tampered body or wrong secret', async () => {
    const sig = signSandboxPayload('sek', body);
    expect((await kyc.verifyWebhook({ rawBody: body.replace('approved', 'rejected'), headers: new Headers({ [SANDBOX_SIGNATURE_HEADER]: sig }) })).valid).toBe(false);
    expect((await kyc.verifyWebhook({ rawBody: body, headers: new Headers({ [SANDBOX_SIGNATURE_HEADER]: signSandboxPayload('nope', body) }) })).valid).toBe(false);
    expect((await kyc.verifyWebhook({ rawBody: body, headers: new Headers() })).valid).toBe(false);
  });
});

describe('Sumsub adapter (UNVERIFIED against live docs — tests our implementation of the documented scheme)', () => {
  it('signs requests as HMAC-SHA256(ts + METHOD + path + body)', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ token: 'tok' }), { status: 200 }));
    const k = new SumsubKyc({ appToken: 'app', secretKey: 'sec', webhookSecret: 'wh', baseUrl: 'https://api.sumsub.test', levelName: 'lvl' }, fetchMock as never, () => 1_700_000_000_000);
    const r = await k.startSession(ctx, { verificationId: 'v', userId: 'u1', phoneE164: '+1', level: 'x', locale: 'en', returnUrl: '/' });
    expect(r.launch).toEqual({ kind: 'sumsub_sdk', token: 'tok' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.sumsub.test/resources/accessTokens/sdk');
    const h = init.headers as Record<string, string>;
    expect(h['X-App-Access-Ts']).toBe('1700000000');
    expect(h['X-App-Access-Sig']).toBe(sumsubSignature('sec', '1700000000', 'POST', '/resources/accessTokens/sdk', init.body as string));
    expect(JSON.parse(init.body as string)).toMatchObject({ userId: 'u1', levelName: 'lvl' });
  });
  it('verifies webhook digests and maps review answers', async () => {
    const k = new SumsubKyc({ appToken: 'a', secretKey: 's', webhookSecret: 'wh', baseUrl: 'https://x', levelName: 'l' }, (async () => new Response('{}')) as never);
    const mk = (body: object, alg = 'HMAC_SHA256_HEX', key = 'wh') => {
      const raw = JSON.stringify(body);
      const a = { HMAC_SHA256_HEX: 'sha256', HMAC_SHA512_HEX: 'sha512', HMAC_SHA1_HEX: 'sha1' }[alg]!;
      return { rawBody: raw, headers: new Headers({ 'x-payload-digest': createHmac(a, key).update(raw).digest('hex'), 'x-payload-digest-alg': alg }) };
    };
    const retry = await k.verifyWebhook(mk({ type: 'applicantReviewed', applicantId: 'ap', externalUserId: 'u', correlationId: 'c1', reviewResult: { reviewAnswer: 'RED', reviewRejectType: 'RETRY' } }, 'HMAC_SHA512_HEX'));
    expect(retry.valid && retry.events[0]?.result.status).toBe('needs_resubmission');
    const final = await k.verifyWebhook(mk({ type: 'applicantReviewed', applicantId: 'ap', externalUserId: 'u', correlationId: 'c2', reviewResult: { reviewAnswer: 'RED', reviewRejectType: 'FINAL' } }));
    expect(final.valid && final.events[0]?.result.status).toBe('rejected');
    expect((await k.verifyWebhook(mk({ type: 'applicantReviewed' }, 'HMAC_SHA256_HEX', 'wrong'))).valid).toBe(false);
    const other = await k.verifyWebhook(mk({ type: 'applicantCreated', applicantId: 'ap', correlationId: 'c3' }));
    expect(other.valid && other.events).toEqual([]);
  });
});

describe('Dojah adapter (UNVERIFIED field names)', () => {
  it('verifies signature and extracts the reference + NIN data', async () => {
    const k = new DojahKyc({ appId: 'a', publicKey: 'p', secretKey: 'sk', widgetId: 'w', webhookAlg: 'sha256' });
    const raw = JSON.stringify({ reference_id: 'ver-1', verification_status: 'Completed', data: { government_data: { data: { nin: { entity: { nin: '123', first_name: 'Ada', last_name: 'Obi', date_of_birth: '1995-06-15' } } } } } });
    const r = await k.verifyWebhook({ rawBody: raw, headers: new Headers({ 'x-dojah-signature': createHmac('sha256', 'sk').update(raw).digest('hex') }) });
    expect(r.valid && r.events[0]).toMatchObject({ verificationId: 'ver-1', result: { status: 'approved', idNumber: '123', nameOnDocument: 'Ada Obi', dateOfBirth: '1995-06-15' } });
    expect((await k.verifyWebhook({ rawBody: raw, headers: new Headers({ 'x-dojah-signature': 'bad' }) })).valid).toBe(false);
  });
});

describe('SMS adapters', () => {
  it('Termii sends OTPs on the DND channel without the + prefix (UNVERIFIED field names)', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ message_id: 'm1' }), { status: 200 }));
    const r = await new TermiiSms({ apiKey: 'k', senderId: 'Errand', baseUrl: 'https://t.test' }, f as never).send(ctx, { toE164: '+2348031234567', body: 'hi', purpose: 'otp' });
    expect(r.providerRef).toBe('m1');
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ to: '2348031234567', channel: 'dnd', from: 'Errand', api_key: 'k' });
  });
  it('Twilio posts form data with Basic auth via a Messaging Service', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ sid: 'SM1' }), { status: 201 }));
    await new TwilioSms({ accountSid: 'AC1', authToken: 't', messagingServiceSid: 'MG1' }, f as never).send(ctx, { toE164: '+17844301234', body: 'hi', purpose: 'otp' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json');
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from('AC1:t').toString('base64')}`);
    expect(String(init.body)).toContain('MessagingServiceSid=MG1');
  });
  it('surfaces provider errors', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ message: 'no balance' }), { status: 400 }));
    await expect(new TermiiSms({ apiKey: 'k', senderId: 'E', baseUrl: 'https://t' }, f as never).send(ctx, { toE164: '+234', body: 'x', purpose: 'otp' })).rejects.toThrow(/no balance/);
  });
});

describe('Supabase SMS hook signature (Standard Webhooks)', () => {
  it('round-trips with the standardwebhooks library', () => {
    const secret = Buffer.from('a'.repeat(32)).toString('base64');
    const wh = new Webhook(secret);
    const payload = JSON.stringify({ user: { phone: '2348031234567' }, sms: { otp: '123456' } });
    const id = 'msg_1', ts = new Date();
    const sig = wh.sign(id, ts, payload);
    const headers = { 'webhook-id': id, 'webhook-timestamp': String(Math.floor(ts.getTime() / 1000)), 'webhook-signature': sig };
    expect(wh.verify(payload, headers)).toMatchObject({ sms: { otp: '123456' } });
    expect(() => wh.verify(payload.replace('123456', '000000'), headers)).toThrow();
  });
});
