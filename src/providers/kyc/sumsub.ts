import { hmacHex, safeEqual } from '../hmac';
import type { KycDocumentType, KycEvent, KycProvider, NormalizedKycResult, WebhookResult } from '../types';

/**
 * Sumsub (St Vincent). UNVERIFIED against live docs (docs.sumsub.com was unreachable from the
 * build environment); written from Sumsub's documented API as I know it. Verify with sandbox keys:
 *  - Request signing: X-App-Token, X-App-Access-Ts (unix seconds), X-App-Access-Sig =
 *    hex(HMAC-SHA256(secretKey, ts + METHOD + pathWithQuery + body)).
 *  - WebSDK token: POST /resources/accessTokens/sdk { userId (= externalUserId), levelName, ttlInSecs } → { token }.
 *  - Webhooks: X-Payload-Digest = hex(HMAC(webhookSecret, rawBody)), algorithm named in
 *    X-Payload-Digest-Alg (HMAC_SHA1_HEX | HMAC_SHA256_HEX | HMAC_SHA512_HEX).
 *  - applicantReviewed: reviewResult.reviewAnswer GREEN | RED; reviewRejectType FINAL | RETRY.
 *  - Applicant data: GET /resources/applicants/-;externalUserId={id}/one.
 * We use our user id as externalUserId (one Sumsub applicant per user).
 */
type Cfg = { appToken: string; secretKey: string; webhookSecret: string; baseUrl: string; levelName: string };

export function sumsubSignature(secretKey: string, ts: string, method: string, pathWithQuery: string, body: string) {
  return hmacHex('sha256', secretKey, ts + method.toUpperCase() + pathWithQuery + body);
}

const DIGEST_ALG: Record<string, 'sha1' | 'sha256' | 'sha512'> = {
  HMAC_SHA1_HEX: 'sha1', HMAC_SHA256_HEX: 'sha256', HMAC_SHA512_HEX: 'sha512',
};

const DOC_TYPE: Record<string, KycDocumentType> = { ID_CARD: 'national_id', PASSPORT: 'passport', DRIVERS: 'drivers_licence' };

export class SumsubKyc implements KycProvider {
  readonly key = 'sumsub';
  readonly sandbox = false;
  constructor(private readonly cfg: Cfg, private readonly fetchImpl: typeof fetch = fetch, private readonly now = () => Date.now()) {}

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const raw = body === undefined ? '' : JSON.stringify(body);
    const ts = Math.floor(this.now() / 1000).toString();
    const res = await this.fetchImpl(this.cfg.baseUrl + path, {
      method,
      headers: {
        'content-type': 'application/json', accept: 'application/json',
        'X-App-Token': this.cfg.appToken, 'X-App-Access-Ts': ts,
        'X-App-Access-Sig': sumsubSignature(this.cfg.secretKey, ts, method, path, raw),
      },
      body: raw || undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Sumsub ${method} ${path} failed (${res.status})`);
    return (await res.json()) as T;
  }

  async startSession(_ctx: Parameters<KycProvider['startSession']>[0], u: Parameters<KycProvider['startSession']>[1]) {
    const r = await this.call<{ token: string }>('POST', '/resources/accessTokens/sdk', {
      userId: u.userId, levelName: this.cfg.levelName, ttlInSecs: 1800,
    });
    return { providerRef: null, launch: { kind: 'sumsub_sdk' as const, token: r.token } };
  }

  async verifyWebhook(req: { rawBody: string; headers: Headers }): Promise<WebhookResult<KycEvent>> {
    const digest = req.headers.get('x-payload-digest');
    const alg = DIGEST_ALG[req.headers.get('x-payload-digest-alg') ?? 'HMAC_SHA256_HEX'];
    if (!digest || !alg || !safeEqual(digest, hmacHex(alg, this.cfg.webhookSecret, req.rawBody))) return { valid: false, reason: 'bad_signature' };
    const p = JSON.parse(req.rawBody) as {
      type?: string; applicantId?: string; externalUserId?: string; correlationId?: string; createdAtMs?: string;
      reviewResult?: { reviewAnswer?: 'GREEN' | 'RED'; reviewRejectType?: 'FINAL' | 'RETRY'; rejectLabels?: string[] };
    };
    const eventType = p.type ?? 'unknown';
    const eventId = p.correlationId ? `${p.correlationId}:${eventType}` : `${p.applicantId}:${eventType}:${p.createdAtMs}`;
    let status: NormalizedKycResult['status'] | null = null;
    if (eventType === 'applicantPending') status = 'submitted';
    if (eventType === 'applicantReviewed') {
      status = p.reviewResult?.reviewAnswer === 'GREEN' ? 'approved' : p.reviewResult?.reviewRejectType === 'RETRY' ? 'needs_resubmission' : 'rejected';
    }
    if (!status) return { valid: true, eventId, eventType, events: [] };

    let details: Partial<NormalizedKycResult> = {};
    if (status === 'approved' && p.externalUserId) details = await this.applicantDetails(p.externalUserId).catch(() => ({}));
    return {
      valid: true, eventId, eventType,
      events: [{
        verificationId: null, userId: p.externalUserId ?? null, providerRef: p.applicantId ?? null,
        result: {
          status,
          checks: [
            { kind: 'id_document', passed: status === 'approved' },
            { kind: 'liveness', passed: status === 'approved' },
          ],
          reasons: p.reviewResult?.rejectLabels ?? [],
          ...details,
        },
      }],
    };
  }

  private async applicantDetails(externalUserId: string): Promise<Partial<NormalizedKycResult>> {
    const a = await this.call<{ info?: { firstName?: string; lastName?: string; dob?: string; idDocs?: { idDocType?: string; number?: string }[] } }>(
      'GET', `/resources/applicants/-;externalUserId=${encodeURIComponent(externalUserId)}/one`,
    );
    const doc = a.info?.idDocs?.[0];
    return {
      nameOnDocument: [a.info?.firstName, a.info?.lastName].filter(Boolean).join(' ') || undefined,
      dateOfBirth: a.info?.dob,
      documentType: doc?.idDocType ? DOC_TYPE[doc.idDocType] ?? 'other' : undefined,
      idNumber: doc?.number,
    };
  }
}
