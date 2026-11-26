# 05 — Adapter interfaces

Interfaces live in `src/providers/types.ts`. Domain modules depend only on these types. Concrete adapters are picked at runtime by `registry.ts` from the market's adapter keys (`markets.payment_provider`, etc.). Below is the **proposed contract**. It will be written as real code in the stage that first needs each one.

## Shared types

```ts
type MarketCode = string;                // 'NG' | 'VC' | … (data, not a union in code)
type Money = { amountMinor: bigint; currency: string }; // ISO 4217; precision from market config

interface ProviderContext {
  market: { id: string; code: MarketCode; currency: string; minorUnit: number; timezone: string; locale: string };
  mode: 'live' | 'sandbox';              // from env; sandbox adapters are clearly labelled
  idempotencyKey?: string;
}

/** Every webhook-capable adapter implements this. */
interface WebhookVerifier<E> {
  /** Must use the raw request body. Throws/returns invalid on bad signature. Never trusts payload alone. */
  verifyAndParse(req: { rawBody: Buffer; headers: Headers; sourceIp?: string }): Promise<
    { valid: true; eventId: string; events: E[] } | { valid: false; reason: string }
  >;
}
```

## PaymentProvider (collection)

```ts
interface PaymentCapabilities {
  checkout: 'redirect' | 'inline' | 'both';
  webhooks: boolean;                 // false → rely on status query + polling
  partialRefunds: boolean;
  refundsViaApi: boolean;            // false → manual_required flow
  authHolds: boolean;                // card auth/capture (future)
  marketplaceSplits: boolean;        // Stripe Connect destination charges, etc.
  connectedAccounts: boolean;        // provider-side onboarding of sellers (Stripe Connect)
}

interface PaymentProvider extends WebhookVerifier<PaymentEvent> {
  readonly key: string;              // 'paystack' | 'scotia_ecom' | 'stripe_connect' | 'sandbox'
  readonly capabilities: PaymentCapabilities;

  createCheckout(ctx: ProviderContext, input: {
    intentId: string; amount: Money; customer: { id: string; phoneE164: string; email?: string };
    returnUrl: string; description: string;
    split?: { destinationAccountRef: string; applicationFee: Money }; // only if marketplaceSplits
  }): Promise<{ providerRef: string; checkoutUrl?: string; clientToken?: string; expiresAt?: Date }>;

  getPayment(ctx: ProviderContext, providerRefOrIntentId: string): Promise<NormalizedPayment>;

  refund(ctx: ProviderContext, input: { providerRef: string; amount: Money; refundId: string; reason: string }):
    Promise<{ status: 'pending' | 'succeeded' | 'manual_required'; providerRef?: string }>;

  listSettled?(ctx: ProviderContext, range: { from: Date; to: Date }): AsyncIterable<NormalizedPayment>; // reconciliation
}

type PaymentEvent =
  | { type: 'payment.succeeded'; intentId: string; providerRef: string; amount: Money; fee?: Money }
  | { type: 'payment.failed'; intentId: string; providerRef: string; reason?: string }
  | { type: 'refund.succeeded' | 'refund.failed'; refundId: string; providerRef: string; amount: Money }
  | { type: 'chargeback.opened' | 'chargeback.closed'; providerRef: string; amount: Money }
  | { type: 'ignored'; raw: string };
```

## PayoutProvider (Runner payouts)

```ts
interface PayoutCapabilities {
  mode: 'automated' | 'batch_file';  // NG: automated; VC: batch_file
  accountNameEnquiry: boolean;
  webhooks: boolean;
}

interface PayoutProvider extends Partial<WebhookVerifier<PayoutEvent>> {
  readonly key: string;              // 'paystack_transfers' | 'bank_batch' | 'stripe_connect' | 'sandbox'
  readonly capabilities: PayoutCapabilities;

  listBanks(ctx: ProviderContext): Promise<{ code: string; name: string }[]>;
  resolveAccount?(ctx: ProviderContext, a: { bankCode: string; accountNumber: string }): Promise<{ accountName: string }>;
  registerRecipient(ctx: ProviderContext, a: PayoutAccountInput): Promise<{ recipientRef: string | null }>;

  // automated mode
  initiate?(ctx: ProviderContext, p: { payoutId: string; recipientRef: string; amount: Money; narration: string }):
    Promise<{ providerRef: string; status: 'processing' | 'paid' | 'failed' }>;
  getPayout?(ctx: ProviderContext, providerRef: string): Promise<NormalizedPayout>;

  // batch_file mode
  buildBatchFile?(ctx: ProviderContext, b: { batchId: string; items: BatchItem[] }):
    Promise<{ filename: string; contentType: string; bytes: Uint8Array; sha256: string }>;
}

type PayoutEvent =
  | { type: 'payout.paid'; payoutId: string; providerRef: string }
  | { type: 'payout.failed' | 'payout.reversed'; payoutId: string; providerRef: string; reason?: string };
```

**Stripe Connect readiness:** a future `stripe_connect` adapter sets `marketplaceSplits`, `connectedAccounts`, `mode: 'automated'`. Runner onboarding becomes `registerRecipient` → Express account link, and release becomes `transfers.create` from the platform balance (separate charges & transfers), which matches our "collect, hold, release" ledger exactly. No domain change is needed. The KYC step for that market can be delegated to Stripe by using a `KycProvider` that reads Connect account requirements.

## KycProvider

```ts
interface KycProvider extends WebhookVerifier<KycEvent> {
  readonly key: string;              // 'dojah' | 'sumsub' | 'sandbox'
  startSession(ctx: ProviderContext, u: { userId: string; phoneE164: string; level: string; locale: string }):
    Promise<{ providerRef: string; launch: { kind: 'sdk_token'; token: string } | { kind: 'url'; url: string } }>;
  getResult(ctx: ProviderContext, providerRef: string): Promise<NormalizedKycResult>;
}
type NormalizedKycResult = {
  status: 'pending' | 'approved' | 'rejected' | 'needs_resubmission';
  checks: { kind: 'id_document' | 'id_number' | 'liveness' | 'face_match'; passed: boolean }[];
  documentType?: 'nin' | 'passport' | 'drivers_licence' | 'national_id';
  idNumberForHashing?: string;       // hashed immediately, never persisted raw
  nameOnDocument?: string; dateOfBirth?: string;
  reasons?: string[];
};
```
- NG/Dojah: NIN lookup + selfie liveness/face-match (Dojah EasyOnboard widget or API).
- VC/Sumsub: WebSDK with a level configured for national ID / passport / driver's licence + liveness.
- Provider approval moves `kyc_status` to `pending_admin`, and an admin approves or rejects (Stage 3 screen). Whether provider-approved can auto-approve is Q8.

## SmsProvider

```ts
interface SmsProvider {
  readonly key: string;              // 'termii' | 'twilio' | 'sandbox'
  send(ctx: ProviderContext, m: { toE164: string; body: string; purpose: 'otp' | 'transactional' }):
    Promise<{ providerRef: string }>;
  startVerification?(ctx: ProviderContext, toE164: string): Promise<{ providerRef: string }>;  // Twilio Verify / Termii Token
  checkVerification?(ctx: ProviderContext, toE164: string, code: string): Promise<{ valid: boolean }>;
}
```
Termii: use the DND-cleared route for OTP and register a Sender ID. Twilio: enable geo permissions for VC (+1 784).

## MapsProvider

```ts
interface MapsProvider {
  readonly key: string;              // 'google' | 'sandbox'
  autocomplete(ctx: ProviderContext, q: { input: string; sessionToken: string; bias?: LatLng }): Promise<PlaceSuggestion[]>;
  placeDetails(ctx: ProviderContext, placeId: string, sessionToken: string): Promise<{ point: LatLng; formatted: string }>;
  reverseGeocode(ctx: ProviderContext, p: LatLng): Promise<{ formatted?: string }>;
  route?(ctx: ProviderContext, stops: LatLng[]): Promise<{ distanceM: number; durationS: number; polyline?: string }>; // Phase 2 rides
  staticMapUrl?(ctx: ProviderContext, p: LatLng, opts: { w: number; h: number }): string;  // light previews on 3G
}
```
Geofencing (pin inside a service area) is done in **PostGIS**, never by the provider. Place autocomplete is restricted to the market's country (component restriction from `markets.code`) and biased to the service-area bounding box.

## Registry, credentials, sandbox

```ts
// src/providers/registry.ts
getProviders(market: MarketRow): { payment: PaymentProvider; payout: PayoutProvider; kyc: KycProvider; sms: SmsProvider; maps: MapsProvider }
```
- Credentials load from env as `<PROVIDER>_<NAME>_<MARKET>` (e.g. `PAYSTACK_SECRET_KEY_NG`). The registry validates required keys with Zod at boot and fails fast in `live` mode.
- `PROVIDER_MODE_<MARKET>=sandbox|live`. In sandbox mode with no keys, the registry returns the **`sandbox` adapter**. It simulates success/failure and signs its own webhooks with a local secret. Every response carries `sandbox: true`, and the UI shows a persistent "SANDBOX — no real money" banner. A sandbox adapter can't be selected when `NODE_ENV=production` and `VERCEL_ENV=production`.
- Where a provider *has* a test mode (Paystack test keys, Sumsub sandbox, Twilio test creds, Dojah sandbox), we use the real adapter with test keys rather than our simulator.
