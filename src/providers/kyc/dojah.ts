import { hmacHex, safeEqual } from '../hmac';
import type { KycEvent, KycProvider, NormalizedKycResult, WebhookResult } from '../types';

/**
 * Dojah (Nigeria: NIN + selfie liveness via the EasyOnboard widget).
 * UNVERIFIED against live docs (docs.dojah.io was unreachable from the build environment).
 * Treat every field name below as an assumption to confirm with Dojah sandbox keys:
 *  - Widget config: app_id, p_key (public key), widget_id, reference_id (we pass our verification id).
 *  - Webhook signature: header `x-dojah-signature`, HMAC of the raw body with the secret key;
 *    algorithm configurable via DOJAH_WEBHOOK_ALG (default sha256) until confirmed.
 *  - Payload: reference_id, verification_status ('Completed' | 'Failed' | 'Pending' | …),
 *    data.government_data / data.id / data.selfie / data.user_data.
 */
type Cfg = { appId: string; publicKey: string; secretKey: string; widgetId: string; webhookAlg: 'sha256' | 'sha512' };

export class DojahKyc implements KycProvider {
  readonly key = 'dojah';
  readonly sandbox = false;
  constructor(private readonly cfg: Cfg) {}

  async startSession(_ctx: Parameters<KycProvider['startSession']>[0], u: Parameters<KycProvider['startSession']>[1]) {
    return {
      providerRef: u.verificationId,
      launch: { kind: 'dojah_widget' as const, config: { appId: this.cfg.appId, publicKey: this.cfg.publicKey, widgetId: this.cfg.widgetId, referenceId: u.verificationId } },
    };
  }

  async verifyWebhook(req: { rawBody: string; headers: Headers }): Promise<WebhookResult<KycEvent>> {
    const sig = req.headers.get('x-dojah-signature');
    if (!sig || !safeEqual(sig, hmacHex(this.cfg.webhookAlg, this.cfg.secretKey, req.rawBody))) return { valid: false, reason: 'bad_signature' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = JSON.parse(req.rawBody) as any;
    const ref: string | undefined = p?.reference_id ?? p?.metadata?.reference_id;
    const vs = String(p?.verification_status ?? p?.status ?? '').toLowerCase();
    const status: NormalizedKycResult['status'] | null =
      vs === 'completed' || vs === 'approved' || vs === 'true' ? 'approved'
      : vs === 'failed' || vs === 'rejected' || vs === 'false' ? 'rejected'
      : vs === 'pending' || vs === 'ongoing' ? 'submitted' : null;
    const eventId = `${ref ?? 'unknown'}:${vs}:${p?.verification_id ?? p?.id ?? ''}`;
    if (!ref || !status) return { valid: true, eventId, eventType: `dojah.${vs || 'unknown'}`, events: [] };
    const nin = p?.data?.government_data?.data?.nin?.entity ?? p?.data?.id?.data?.id_data ?? {};
    const selfie = p?.data?.selfie?.data ?? {};
    return {
      valid: true, eventId, eventType: `dojah.${vs}`,
      events: [{
        verificationId: ref, userId: null, providerRef: ref,
        result: {
          status,
          checks: [
            { kind: 'id_number', passed: Boolean(nin?.nin ?? nin?.id_number) && status !== 'rejected' },
            { kind: 'liveness', passed: selfie?.liveness ?? status === 'approved' },
            { kind: 'face_match', passed: selfie?.match ?? status === 'approved' },
          ],
          documentType: 'nin',
          idNumber: nin?.nin ?? nin?.id_number,
          nameOnDocument: [nin?.first_name ?? nin?.firstname, nin?.last_name ?? nin?.surname].filter(Boolean).join(' ') || undefined,
          dateOfBirth: nin?.date_of_birth ?? nin?.dob,
          reasons: status === 'approved' ? [] : [String(p?.message ?? 'provider_rejected')],
        },
      }],
    };
  }
}
