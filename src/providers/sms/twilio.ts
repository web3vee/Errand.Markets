import type { SmsProvider } from '../types';

/**
 * Twilio Programmable Messaging (St Vincent) via a Messaging Service.
 * POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json
 * form: To, MessagingServiceSid, Body — HTTP Basic auth (AccountSid:AuthToken) → { sid }
 */
export class TwilioSms implements SmsProvider {
  readonly key = 'twilio';
  readonly sandbox = false;
  constructor(private readonly cfg: { accountSid: string; authToken: string; messagingServiceSid: string }, private readonly fetchImpl: typeof fetch = fetch) {}
  async send(_ctx: Parameters<SmsProvider['send']>[0], m: Parameters<SmsProvider['send']>[1]) {
    const body = new URLSearchParams({ To: m.toE164, MessagingServiceSid: this.cfg.messagingServiceSid, Body: m.body });
    const res = await this.fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.cfg.accountSid)}/Messages.json`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${this.cfg.accountSid}:${this.cfg.authToken}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
    if (!res.ok || !json.sid) throw new Error(`Twilio send failed (${res.status} ${json.code ?? ''}): ${json.message ?? 'no sid'}`);
    return { providerRef: json.sid };
  }
}
