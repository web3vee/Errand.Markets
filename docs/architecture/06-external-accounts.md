# 06 — External accounts you need to set up

Lead times matter: payment and KYC onboarding and SMS sender-ID registration can take **days to weeks**. Starting these now keeps them from blocking Stage 3 (OTP/KYC) and Stage 6 (payments). Until keys arrive, I build against sandbox/test modes and label them.

## Shared (both markets)

| Account | Needed for | Env vars | Notes |
|---|---|---|---|
| **Vercel** (Pro, team) | Hosting, preview deploys | — (set env in Vercel) | Functions region `lhr1`. |
| **Supabase** (Pro) | DB, Auth, Storage, Realtime | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL_EU_WEST_2`, `SUPABASE_AUTH_SMS_HOOK_SECRET` | Project in **eu-west-2**. Enable PostGIS. Enable phone auth + Send SMS hook (if Option A, see 01 §3). PITR backups recommended for a ledger. |
| **Inngest** | Background jobs | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Vercel integration. |
| **Google Cloud – OAuth client (Sign in with Google)** | "Continue with Google" via Supabase Auth | Client ID + secret go into Supabase (Auth → Providers → Google), not our env. `AUTH_GOOGLE_ENABLED=1` shows the button. | OAuth consent screen (app name, logo, privacy policy URL) must be published for public use. Authorised redirect URI = Supabase's callback URL. |
| **Google Cloud – Maps Platform** | Maps JS, Places (New) autocomplete, Geocoding | `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_MAPS_SERVER_KEY` | Two keys: browser key restricted by HTTP referrer + APIs; server key restricted by API. Set budget alerts. |
| **Domain / DNS** | errand.markets | `NEXT_PUBLIC_APP_URL` | Needed for webhook URLs and PWA scope. |
| Web Push (VAPID) | Push notifications | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | No account; I'll generate. |
| App secrets | Field encryption, hashing | `FIELD_ENCRYPTION_KEY`, `ID_HASH_PEPPER` | I'll generate; store in Vercel. |
| *Optional:* Sentry | Error monitoring | `SENTRY_DSN` | Needs your OK. |
| *Optional:* transactional email (e.g. Resend/Postmark) | Receipts, admin alerts | — | Not in the brief; phone-first. Ask before adding. |

## Nigeria (NG)

| Account | What to request / configure | Env vars |
|---|---|---|
| **Paystack** (registered business; go-live compliance) | Live + test keys. **Transfers enabled**, **Transfer OTP disabled** (for automated payouts). Settlement configuration that keeps a balance for Transfers (see 04 / Q2). Webhook URL `https://<domain>/api/webhooks/paystack/ng`. Channels: card, bank transfer, USSD. | `PAYSTACK_PUBLIC_KEY_NG`, `PAYSTACK_SECRET_KEY_NG` (also signs webhooks) |
| **Dojah** | App with NIN lookup + selfie liveness / face match (EasyOnboard widget). Sandbox + live. Webhook URL `…/api/webhooks/dojah/ng`. | `DOJAH_APP_ID_NG`, `DOJAH_SECRET_KEY_NG`, `DOJAH_PUBLIC_KEY_NG`, `DOJAH_WIDGET_ID_NG`, `DOJAH_WEBHOOK_SECRET_NG` |
| **Termii** | API key; **Sender ID registration** (brand name, approval takes days); DND route enabled for OTP; funded wallet. | `TERMII_API_KEY_NG`, `TERMII_SENDER_ID_NG` |
| Nigerian legal entity + NGN bank account | Required by Paystack live mode; settlement account. | — |

## Saint Vincent & the Grenadines (VC)

| Account | What to request / configure | Env vars |
|---|---|---|
| **Scotiabank merchant account + ECom+** | Hosted payment page credentials (test + live). **Ask Scotiabank for:** API/integration guide, sandbox, whether server-to-server notifications (webhooks) exist and how they are signed, status-query API, refund API (partial?), 3-D Secure, settlement timing, statement/report export for reconciliation. | `SCOTIA_ECOM_MERCHANT_ID_VC`, `SCOTIA_ECOM_KEY_VC`, `SCOTIA_ECOM_WEBHOOK_SECRET_VC`, `SCOTIA_ECOM_API_BASE_VC` |
| **Scotiabank business banking (bulk payments)** | The **bulk payment / payroll upload file specification** (format, field lengths, bank & branch codes for other ECCU banks, any checksum/header rows) and whether a sample file can be validated before go-live. | `PAYOUT_BATCH_FORMAT_VC` (e.g. `scotia_bulk_v1`), `PAYOUT_ORIGIN_ACCOUNT_VC` |
| **Sumsub** | Account with a verification **level** for SVG: national ID / passport / driver's licence + liveness. Sandbox + live. Webhook URL `…/api/webhooks/sumsub/vc`. | `SUMSUB_APP_TOKEN_VC`, `SUMSUB_SECRET_KEY_VC`, `SUMSUB_WEBHOOK_SECRET_VC`, `SUMSUB_LEVEL_NAME_VC` |
| **Twilio** | Account; geo permissions for Saint Vincent (+1 784); Messaging Service (Option A) **or** Verify service (Option B). | `TWILIO_ACCOUNT_SID_VC`, `TWILIO_AUTH_TOKEN_VC`, `TWILIO_MESSAGING_SERVICE_SID_VC` or `TWILIO_VERIFY_SERVICE_SID_VC` |
| SVG legal entity / registration + XCD bank account | Required for Scotiabank merchant account; source account for payout batches. | — |

## Per-market switches

| Var | Values |
|---|---|
| `PROVIDER_MODE_NG`, `PROVIDER_MODE_VC` | `sandbox` \| `live` |
