import type { SmsProvider } from '../types';

/**
 * Termii (Nigeria). UNVERIFIED: written from Termii's public API as I know it; the docs site
 * was unreachable from the build environment. Verify against developers.termii.com with test keys.
 * POST {base}/api/sms/send  { api_key, to, from, sms, type: 'plain', channel: 'dnd' | 'generic' } → { message_id }
 * OTPs use the DND route so they reach numbers on Do-Not-Disturb.
 */
export class TermiiSms implements SmsProvider {
  readonly key = 'termii';
  readonly sandbox = false;
  constructor(private readonly cfg: { apiKey: string; senderId: string; baseUrl: string }, private readonly fetchImpl: typeof fetch = fetch) {}
  async send(_ctx: Parameters<SmsProvider['send']>[0], m: Parameters<SmsProvider['send']>[1]) {
    const res = await this.fetchImpl(`${this.cfg.baseUrl}/api/sms/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: this.cfg.apiKey, to: m.toE164.replace(/^\+/, ''), from: this.cfg.senderId, sms: m.body,
        type: 'plain', channel: m.purpose === 'otp' ? 'dnd' : 'generic',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as { message_id?: string; message?: string };
    if (!res.ok || !json.message_id) throw new Error(`Termii send failed (${res.status}): ${json.message ?? 'no message_id'}`);
    return { providerRef: json.message_id };
  }
}
