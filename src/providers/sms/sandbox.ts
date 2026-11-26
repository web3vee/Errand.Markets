import type { SmsProvider } from '../types';

/**
 * SANDBOX SMS — sends nothing. Messages are written to the `sandbox_outbox` table
 * (viewable at /{locale}/dev/outbox when AUTH_MODE=local) and logged to the console.
 */
export class SandboxSms implements SmsProvider {
  readonly key = 'sandbox';
  readonly sandbox = true;
  constructor(private readonly write: (m: { to: string; body: string; marketCode: string }) => Promise<number>) {}
  async send(ctx: Parameters<SmsProvider['send']>[0], m: Parameters<SmsProvider['send']>[1]) {
    const id = await this.write({ to: m.toE164, body: m.body, marketCode: ctx.market.code });
    console.info(`[SANDBOX SMS ${ctx.market.code}] to ${m.toE164}: ${m.body}`);
    return { providerRef: `sandbox-${id}` };
  }
}
