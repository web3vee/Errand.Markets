import { z } from 'zod';
import { hmacHex, safeEqual } from '../hmac';
import type { KycEvent, KycProvider, WebhookResult } from '../types';

/**
 * SANDBOX KYC — no real identity check. startSession sends the Runner to a local page where a
 * tester picks the outcome; that page posts a webhook signed with SANDBOX_WEBHOOK_SECRET to the
 * normal webhook route, so the full verify → store → process path is exercised.
 */
export const SandboxKycPayload = z.object({
  eventId: z.string().min(8),
  verificationId: z.string().uuid(),
  userId: z.string().uuid(),
  outcome: z.enum(['approved', 'rejected', 'needs_resubmission']),
  document: z.object({
    type: z.enum(['nin', 'passport', 'drivers_licence', 'national_id']),
    idNumber: z.string().min(4).max(32),
    name: z.string().min(1).max(120),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  livenessPassed: z.boolean(),
});
export type SandboxKycPayload = z.infer<typeof SandboxKycPayload>;
export const SANDBOX_SIGNATURE_HEADER = 'x-sandbox-signature';

export function signSandboxPayload(secret: string, rawBody: string) {
  return hmacHex('sha256', secret, rawBody);
}

export class SandboxKyc implements KycProvider {
  readonly key = 'sandbox';
  readonly sandbox = true;
  constructor(private readonly cfg: { secret: string; launchUrl: (verificationId: string) => string }) {}

  async startSession(_ctx: Parameters<KycProvider['startSession']>[0], u: Parameters<KycProvider['startSession']>[1]) {
    return { providerRef: `sandbox-${u.verificationId}`, launch: { kind: 'url' as const, url: this.cfg.launchUrl(u.verificationId) } };
  }

  async verifyWebhook(req: { rawBody: string; headers: Headers }): Promise<WebhookResult<KycEvent>> {
    const sig = req.headers.get(SANDBOX_SIGNATURE_HEADER);
    if (!sig || !safeEqual(sig, signSandboxPayload(this.cfg.secret, req.rawBody))) return { valid: false, reason: 'bad_signature' };
    const parsed = SandboxKycPayload.safeParse(JSON.parse(req.rawBody));
    if (!parsed.success) return { valid: false, reason: 'bad_payload' };
    const p = parsed.data;
    const result = {
      status: p.outcome,
      checks: [
        { kind: 'id_document' as const, passed: p.outcome !== 'rejected' },
        { kind: 'liveness' as const, passed: p.livenessPassed },
        { kind: 'face_match' as const, passed: p.livenessPassed && p.outcome === 'approved' },
      ],
      documentType: p.document.type,
      idNumber: p.document.idNumber,
      nameOnDocument: p.document.name,
      dateOfBirth: p.document.dateOfBirth,
      reasons: p.outcome === 'approved' ? [] : ['sandbox_outcome'],
    };
    return {
      valid: true, eventId: p.eventId, eventType: `sandbox.${p.outcome}`,
      events: [{ verificationId: p.verificationId, userId: p.userId, providerRef: `sandbox-${p.verificationId}`, result }],
    };
  }
}
