/**
 * Provider adapter contracts (docs/architecture/05-adapters.md).
 * Domain modules depend on these types only — never on a concrete adapter.
 * Payment / payout / maps contracts are added in the stages that first use them.
 */
export type ProviderMode = 'live' | 'sandbox';

export interface ProviderContext {
  market: { id: string | null; code: string; currency: string; minorUnit: number; timezone: string; locale: string };
  mode: ProviderMode;
}

export type WebhookRequest = { rawBody: string; headers: Headers };
export type WebhookResult<E> =
  | { valid: true; eventId: string; eventType: string; events: E[] }
  | { valid: false; reason: string };

// ── SMS ──────────────────────────────────────────────────────────────────────
export interface SmsProvider {
  readonly key: string;
  readonly sandbox: boolean;
  send(ctx: ProviderContext, m: { toE164: string; body: string; purpose: 'otp' | 'transactional' }): Promise<{ providerRef: string }>;
}

// ── KYC ──────────────────────────────────────────────────────────────────────
export type KycLaunch =
  | { kind: 'url'; url: string }
  | { kind: 'sumsub_sdk'; token: string }
  | { kind: 'dojah_widget'; config: { appId: string; publicKey: string; widgetId: string; referenceId: string } };

export type KycCheck = { kind: 'id_document' | 'id_number' | 'liveness' | 'face_match'; passed: boolean };
export type KycDocumentType = 'nin' | 'passport' | 'drivers_licence' | 'national_id' | 'other';

export type NormalizedKycResult = {
  status: 'submitted' | 'approved' | 'rejected' | 'needs_resubmission';
  checks: KycCheck[];
  documentType?: KycDocumentType;
  /** Hashed immediately by the KYC service; never persisted raw. */
  idNumber?: string;
  nameOnDocument?: string;
  /** ISO date (YYYY-MM-DD); used once to compute age, not stored. */
  dateOfBirth?: string;
  reasons?: string[];
};

export type KycEvent = {
  /** Our kyc_verifications.id when the provider echoes it back, else null. */
  verificationId: string | null;
  /** Our user id (Sumsub externalUserId) when available. */
  userId: string | null;
  providerRef: string | null;
  result: NormalizedKycResult;
};

export interface KycProvider {
  readonly key: string;
  readonly sandbox: boolean;
  startSession(ctx: ProviderContext, u: { verificationId: string; userId: string; phoneE164: string; level: string; locale: string; returnUrl: string }):
    Promise<{ providerRef: string | null; launch: KycLaunch }>;
  verifyWebhook(req: WebhookRequest): Promise<WebhookResult<KycEvent>>;
}
