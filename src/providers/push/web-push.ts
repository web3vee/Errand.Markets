import { sendNotification } from 'web-push';
import type { PushProvider, PushTarget } from '../types';

/** Standard Web Push (VAPID). Works with any browser push service; no vendor account needed. */
export class WebPushProvider implements PushProvider {
  readonly key = 'web-push';
  readonly sandbox = false;
  constructor(private readonly vapid: { subject: string; publicKey: string; privateKey: string }) {}
  async send(target: PushTarget, payload: { title: string; body: string; url: string; tag?: string }) {
    try {
      await sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        { vapidDetails: this.vapid, TTL: 3600, urgency: 'normal' },
      );
      return { ok: true as const };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      return { ok: false as const, gone: status === 404 || status === 410, error: String((e as Error).message).slice(0, 200) };
    }
  }
}

/** SANDBOX PUSH — records instead of sending (used when VAPID keys are not configured). */
export class SandboxPush implements PushProvider {
  readonly key = 'sandbox';
  readonly sandbox = true;
  constructor(private readonly write: (m: { to: string; body: string }) => Promise<unknown>) {}
  async send(target: PushTarget, payload: { title: string; body: string; url: string }) {
    await this.write({ to: target.endpoint.slice(0, 120), body: `${payload.title} — ${payload.body} (${payload.url})` });
    return { ok: true as const };
  }
}
