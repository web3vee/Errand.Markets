# 02 — Data model

Conventions:
- PKs are **UUIDv7** (time-ordered, globally unique, so they're safe when a market moves to another regional DB later).
- Money columns: `*_minor bigint` + `currency char(3)`. No floats or `numeric` money anywhere.
- Percentages are stored as **basis points** (`int`, 1 bps = 0.01%).
- Timestamps are `timestamptz` (UTC). Display uses `markets.timezone` (or the user's locale/timezone).
- `market_id` is on every market-owned row. Composite FKs `(market_id, id)` are used where two rows must share a market (e.g. offer ↔ errand ↔ runner), so the DB itself rejects cross-market joins.
- Soft-delete (`deleted_at`) only on user-facing content. Financial and audit tables are append-only.
- Dashed boxes in the Phase 2 diagram are **designed, not built**.

## 1. Market configuration

```mermaid
erDiagram
  markets ||--o{ market_fee_schedules : "versioned fees"
  markets ||--o{ tax_rules : ""
  markets ||--o{ runner_rules : "versioned"
  markets ||--o{ service_areas : ""
  markets ||--o{ errand_categories : ""
  markets ||--o{ prohibited_items : ""
  markets ||--o{ market_locales : ""

  markets {
    uuid id PK
    char2 code UK "ISO 3166-1: NG, VC"
    text name_key "i18n key"
    enum status "draft|active|paused"
    char3 currency_code "NGN, XCD"
    smallint currency_minor_unit "2 (kobo / cents); never assumed"
    text timezone "Africa/Lagos, America/St_Vincent"
    char2 phone_region "libphonenumber region: NG, VC"
    text phone_country_code "+234, +1"
    text phone_national_prefix_pattern "e.g. ^784 for VC within NANP"
    text default_locale "en-NG, en-VC"
    text data_region "eu-west-2 (routing key, see 07)"
    text payment_provider "adapter key: paystack | scotia_ecom"
    text payout_provider "paystack_transfers | bank_batch"
    text kyc_provider "dojah | sumsub"
    text sms_provider "termii | twilio"
    text maps_provider "google"
    text rounding_mode "half_up | half_even"
    jsonb address_format "field order/labels for locale formatting"
    timestamptz created_at
  }
  market_fee_schedules {
    uuid id PK
    uuid market_id FK
    int commission_bps "taken from Runner errand fee"
    int service_fee_bps "charged to customer"
    bigint service_fee_fixed_minor
    bigint service_fee_min_minor
    bigint service_fee_max_minor "nullable"
    bigint cancellation_fee_minor "post-acceptance, to Runner"
    int cancellation_fee_bps "alternative to fixed; one is null"
    bigint min_errand_price_minor
    int auto_release_hours "24"
    int[] reminder_offsets_hours "{2,20}"
    int unfunded_offer_timeout_minutes "see 09"
    int errand_default_expiry_hours "see 09"
    timestamptz effective_from
    timestamptz effective_to "null = current"
    uuid created_by
  }
  tax_rules {
    uuid id PK
    uuid market_id FK
    text code "e.g. NG_VAT"
    text name_key
    enum applies_to "service_fee|commission|cancellation_fee|errand_fee"
    int rate_bps "0 at launch"
    bool inclusive "price already includes tax?"
    bool invoice_required
    text registration_number "nullable"
    timestamptz effective_from
    timestamptz effective_to
  }
  runner_rules {
    uuid id PK
    uuid market_id FK
    enum pricing_control "runner_offers|customer_fixed|both|platform_set"
    int max_concurrent_errands
    bool acceptance_penalty_enabled
    int acceptance_rate_threshold_bps
    int acceptance_window_days
    int required_hours_per_week "nullable; null = none"
    int min_age_years
    text required_kyc_level "provider level name"
    jsonb extra "validated by Zod per version"
    timestamptz effective_from
    timestamptz effective_to
  }
  service_areas {
    uuid id PK
    uuid market_id FK
    text slug "wuse-2, kingstown"
    text name_key
    geography geom "MultiPolygon, PostGIS"
    text island "nullable; Phase 2 inter-island"
    bool active
  }
  errand_categories {
    uuid id PK
    uuid market_id FK
    text key "shopping, pickup, documents, delivery, business"
    text name_key
    text icon
    bool purchase_allowed
    int sort
    bool active
  }
  prohibited_items {
    uuid id PK
    uuid market_id FK
    text key
    text label_key
    text[] keywords "screening hints (per locale)"
    enum action "block|flag_for_review"
    bool active
  }
  market_locales {
    uuid market_id FK
    text locale "en-NG; future: ha, yo, ig, fr..."
    bool enabled
  }
```

**Why fee schedules and runner rules are versioned rows** rather than columns on `markets`: when an admin edits a fee, errands already in flight must keep the fees the customer agreed to. At funding time an errand stores `fee_schedule_id` plus a `quote` snapshot, and the audit trail shows who changed what and when.

## 2. Identity, roles, profiles, trust

```mermaid
erDiagram
  users ||--o{ user_roles : ""
  users ||--o{ admin_grants : ""
  users ||--o| customer_profiles : ""
  users ||--o| runner_profiles : ""
  users ||--o{ kyc_verifications : ""
  users ||--o{ payout_accounts : ""
  users ||--o{ places : "saved"
  users ||--o{ push_subscriptions : ""
  users ||--o{ blocks : "blocker"
  users ||--o{ reports : "reporter"
  runner_profiles }o--o{ service_areas : "runner_service_areas"

  users {
    uuid id PK "= auth.users.id"
    uuid market_id FK "home market; Runner may only work here"
    text phone_e164 UK
    text display_name
    text email "nullable"
    text locale
    enum status "active|suspended|banned|deleted"
    timestamptz created_at
  }
  user_roles {
    uuid user_id FK
    enum role "customer|runner|admin|driver(reserved)|business_member(reserved)"
    enum status "active|revoked"
    timestamptz granted_at
    uuid granted_by
  }
  admin_grants {
    uuid id PK
    uuid user_id FK
    uuid market_id FK "NULL = all markets"
    text[] permissions "ops, finance, support, config, super"
    timestamptz granted_at
    uuid granted_by
  }
  customer_profiles {
    uuid user_id PK
    uuid default_place_id
  }
  runner_profiles {
    uuid user_id PK
    uuid market_id FK
    enum kyc_status "not_started|pending|approved|rejected|expired"
    timestamptz kyc_approved_at
    enum availability "offline|online"
    enum vehicle "none|bicycle|motorbike|car (Phase 2 reuse)"
    text bio
  }
  kyc_verifications {
    uuid id PK
    uuid user_id FK
    uuid market_id FK
    text provider "dojah | sumsub"
    text provider_ref
    text level
    enum status "created|submitted|provider_approved|provider_rejected|admin_approved|admin_rejected"
    jsonb result_summary "normalized, no raw ID numbers"
    text id_number_hash "HMAC, for duplicate-account detection"
    uuid reviewed_by
    text review_reason
    timestamptz created_at
  }
  payout_accounts {
    uuid id PK
    uuid user_id FK
    uuid market_id FK
    enum method "bank_transfer (mobile_money later)"
    text bank_code
    bytea account_number_enc "app-level encrypted"
    text account_last4
    text account_name "from name enquiry"
    text provider_recipient_ref "Paystack recipient_code"
    timestamptz verified_at
    bool is_default
  }
  places {
    uuid id PK
    uuid market_id FK
    uuid user_id FK "nullable (one-off errand stops)"
    text label
    geography point "map pin (required)"
    text landmark_note "free text, required-or-encouraged"
    text contact_name
    text contact_phone_e164
    text formatted_address "nullable"
    uuid service_area_id FK "computed by ST_Covers"
  }
  push_subscriptions {
    uuid id PK
    uuid user_id FK
    text endpoint
    jsonb keys
  }
  blocks {
    uuid blocker_id
    uuid blocked_id
  }
  reports {
    uuid id PK
    uuid market_id
    uuid reporter_id
    text subject_type "user|errand|message"
    uuid subject_id
    text reason_code
    enum status "open|actioned|dismissed"
    uuid assigned_to
  }
```

Notes:
- **One account, many roles.** A person is one `users` row. `customer` and `runner` are independent rows in `user_roles`. A Runner can't make an offer on their own errand (DB check).
- **Runner eligibility** to accept or offer = `runner` role active AND `runner_profiles.kyc_status = 'approved'` AND `users.market_id = errand.market_id` AND not blocked either way. This is checked in `policy.ts`, RLS and an `offers` insert trigger.
- **Admin scope**: `admin_grants.market_id IS NULL` means global. RLS helper `auth_admin_markets()` returns the set of markets the admin can see.
- The `kyc` storage bucket holds nothing by default. Document images stay with Dojah/Sumsub, and we store references plus a normalized summary (data-minimisation; see 08).

## 3. Errands, offers, messaging, ratings, disputes

```mermaid
erDiagram
  errands ||--o{ errand_stops : ""
  errands ||--o{ errand_items : ""
  errands ||--o{ errand_media : ""
  errands ||--o{ offers : ""
  errands ||--o{ errand_events : "audit / transitions"
  errands ||--o{ purchase_reconciliations : ""
  errands ||--o{ conversations : ""
  conversations ||--o{ messages : ""
  errands ||--o{ ratings : ""
  errands ||--o{ disputes : ""
  disputes ||--o{ dispute_events : ""
  errand_stops }o--|| places : ""
  errands }o--|| errand_categories : ""
  errands }o--|| market_fee_schedules : "snapshot at funding"

  errands {
    uuid id PK
    uuid market_id FK
    uuid customer_id FK
    uuid runner_id FK "null until offer accepted"
    uuid category_id FK
    text title
    text description
    enum status "see 03"
    int version "optimistic lock"
    enum pricing_mode "offers|fixed"
    char3 currency
    bigint customer_budget_minor "fixed price or budget hint"
    bigint errand_fee_minor "agreed, from accepted offer"
    bool requires_purchase
    bigint item_cost_estimate_minor
    uuid accepted_offer_id FK
    uuid fee_schedule_id FK
    jsonb quote "frozen line items incl. tax at acceptance"
    uuid origin_service_area_id FK
    timestamptz window_start
    timestamptz window_end
    timestamptz expires_at
    timestamptz funded_at
    timestamptz started_at
    timestamptz completed_at
    timestamptz auto_release_at
    timestamptz confirmed_at
    timestamptz paid_out_at
    timestamptz cancelled_at
    uuid cancelled_by
    text cancel_reason_code
    enum priority "standard (Phase 2: priority)"
    uuid business_account_id "nullable, Phase 2"
  }
  errand_stops {
    uuid id PK
    uuid errand_id FK
    smallint seq
    enum kind "pickup|purchase|collect|dropoff"
    uuid place_id FK
    text instructions
  }
  errand_items {
    uuid id PK
    uuid errand_id FK
    text name
    int qty
    bigint est_unit_price_minor
    text notes
  }
  errand_media {
    uuid id PK
    uuid errand_id FK
    enum kind "reference|proof|receipt"
    text storage_path
    uuid uploaded_by
    char64 sha256
    int bytes
    timestamptz created_at
  }
  offers {
    uuid id PK
    uuid market_id FK
    uuid errand_id FK
    uuid runner_id FK
    bigint amount_minor
    char3 currency
    text message
    int eta_minutes
    enum status "pending|withdrawn|accepted|declined|expired|superseded"
    timestamptz expires_at
  }
  errand_events {
    bigint id PK
    uuid errand_id FK
    text from_status
    text to_status
    text event "accept_offer, payment_confirmed, ..."
    enum actor_type "customer|runner|admin|system|provider"
    uuid actor_id
    jsonb data
    timestamptz at
  }
  purchase_reconciliations {
    uuid id PK
    uuid errand_id FK
    enum kind "topup_request|receipt"
    bigint estimate_minor
    bigint actual_minor
    bigint delta_minor
    uuid receipt_media_id
    enum status "pending_customer|approved|declined|funded|settled"
    uuid topup_payment_intent_id
  }
  conversations {
    uuid id PK
    uuid errand_id FK
    uuid customer_id
    uuid runner_id
    enum status "open|read_only"
  }
  messages {
    uuid id PK
    uuid conversation_id FK
    uuid sender_id
    text body
    uuid media_id "nullable"
    timestamptz created_at
    timestamptz read_at
  }
  ratings {
    uuid id PK
    uuid errand_id FK
    uuid rater_id
    uuid ratee_id
    enum ratee_role "customer|runner"
    smallint stars "1..5"
    text comment
  }
  disputes {
    uuid id PK
    uuid market_id FK
    uuid errand_id FK
    uuid opened_by
    text reason_code
    text description
    enum status "open|under_review|resolved"
    uuid assigned_to
    enum outcome "release_runner|refund_customer|split"
    bigint runner_amount_minor
    bigint refund_amount_minor
    uuid resolved_by
    timestamptz resolved_at
  }
  dispute_events {
    bigint id PK
    uuid dispute_id FK
    uuid actor_id
    text kind "note|evidence|assign|resolve"
    jsonb data
  }
```

Notes:
- **Conversations are per (errand, runner).** That supports pre-acceptance Q&A if you want it (see 09) and makes a conversation read-only once a different Runner is chosen.
- **Notifications**: `notifications (user_id, market_id, type, payload, read_at)` + `notification_deliveries (notification_id, channel push|sms|in_app, provider, provider_ref, status)`. Omitted from the diagram for space.
- **`errand_events`** is the single audit log of the state machine, written in the same transaction as the status change.

## 4. Money: payments, ledger, payouts

```mermaid
erDiagram
  payment_intents ||--o{ refunds : ""
  payment_intents }o--|| errands : ""
  provider_webhook_events }o--o| payment_intents : "resolves to"
  ledger_transactions ||--|{ ledger_entries : "≥2, balanced"
  ledger_entries }o--|| ledger_accounts : ""
  ledger_transactions }o--o| errands : ""
  ledger_transactions }o--o| payouts : ""
  payouts ||--o{ payout_items : ""
  payouts }o--o| payout_batches : ""
  payouts }o--|| payout_accounts : ""

  payment_intents {
    uuid id PK "also the provider 'reference'"
    uuid market_id FK
    uuid errand_id FK "nullable: one of errand_id / ride_id / subscription_id"
    enum purpose "escrow_funding|topup"
    text provider
    text provider_ref
    bigint amount_minor
    char3 currency
    enum status "created|pending|succeeded|failed|expired"
    bigint provider_fee_minor
    text checkout_url
    text idempotency_key UK
  }
  refunds {
    uuid id PK
    uuid payment_intent_id FK
    bigint amount_minor
    char3 currency
    text reason_code
    text provider_ref
    enum status "requested|pending|succeeded|failed|manual_required"
  }
  provider_webhook_events {
    uuid id PK
    text provider
    uuid market_id
    text event_id "UK with provider"
    text event_type
    bool signature_valid
    jsonb payload "redacted"
    enum status "received|processed|ignored|failed"
    int attempts
    text error
    timestamptz received_at
    timestamptz processed_at
  }
  ledger_accounts {
    uuid id PK
    uuid market_id FK
    char3 currency
    enum type "asset|liability|revenue|expense"
    text purpose "see 04 chart of accounts"
    text owner_type "platform|errand|user|tax_rule|provider"
    uuid owner_id "nullable for platform"
  }
  ledger_transactions {
    uuid id PK
    uuid market_id FK
    char3 currency
    text kind "escrow_funded, escrow_released, ..."
    text idempotency_key UK
    uuid errand_id FK
    uuid payout_id FK
    uuid payment_intent_id FK
    uuid refund_id FK
    uuid reverses_id FK "for corrections"
    uuid created_by "null = system"
    timestamptz created_at
  }
  ledger_entries {
    bigint id PK
    uuid transaction_id FK
    uuid account_id FK
    enum side "debit|credit"
    bigint amount_minor "> 0"
    char3 currency "must equal account currency"
  }
  payouts {
    uuid id PK
    uuid market_id FK
    uuid runner_id FK
    uuid payout_account_id FK
    bigint amount_minor
    char3 currency
    text provider
    text provider_ref
    uuid batch_id FK "VC"
    enum status "pending|in_batch|processing|paid|failed|reversed"
    text failure_reason
    text idempotency_key UK
  }
  payout_items {
    uuid payout_id FK
    uuid errand_id FK
    bigint amount_minor
  }
  payout_batches {
    uuid id PK
    uuid market_id FK
    enum status "draft|approved|exported|submitted|settled|partially_settled|cancelled"
    text export_format "bank file spec key"
    text export_path "private bucket"
    char64 export_sha256
    bigint total_minor
    int item_count
    uuid created_by
    uuid approved_by
    timestamptz settled_at
  }
```

Ledger invariants enforced **in Postgres**, not just in code:
1. `ledger_entries.amount_minor > 0`, and `side` decides the direction.
2. A **deferred constraint trigger** checks Σdebits = Σcredits per transaction at commit.
3. An entry's currency must equal its account's currency, and all entries in a transaction share one currency. This is how "no FX" is enforced.
4. `UPDATE`/`DELETE` on `ledger_*` is revoked from every role, so corrections must be reversing transactions.
5. `ledger_transactions.idempotency_key` is unique, so a replayed webhook can't double-post.

Balances come from the view `ledger_balances(account_id, debit_total, credit_total, balance)`. If volume needs it later, we can add a *derived* checkpoint table (rebuildable from entries). It would never be the source of truth.

## 5. Phase 2 (designed, not built)

```mermaid
erDiagram
  users ||--o| driver_profiles : "role=driver"
  driver_profiles ||--o{ vehicles : ""
  rides }o--|| markets : ""
  rides }o--|| places : "pickup/dropoff"
  rides ||--o{ payment_intents : "payment_intents.ride_id"
  rides ||--o{ ledger_transactions : "ledger_transactions.ride_id"
  business_accounts ||--o{ business_members : ""
  business_accounts ||--o{ errands : "errands.business_account_id"
  subscription_plans ||--o{ subscriptions : ""
  subscriptions }o--|| users : ""
  service_areas ||--o{ inter_area_routes : "from/to (inter-island)"

  driver_profiles {
    uuid user_id PK
    text licence_ref
    enum kyc_status
  }
  vehicles {
    uuid id PK
    text plate
    enum class
  }
  rides {
    uuid id PK
    uuid market_id
    enum status
  }
  business_accounts {
    uuid id PK
    uuid market_id
    enum billing "prepaid|invoice"
  }
  business_members {
    uuid business_id
    uuid user_id
    enum role
  }
  subscription_plans {
    uuid id PK
    uuid market_id
    bigint price_minor
  }
  subscriptions {
    uuid id PK
    uuid user_id
    enum status
  }
  inter_area_routes {
    uuid from_area_id
    uuid to_area_id
    bigint surcharge_minor
    jsonb ferry_schedule
  }
```

What we put in the MVP so these slot in without rewrites:

| Phase 2 feature | MVP hook already present |
|---|---|
| Ride-hailing | `places` is shared. `payment_intents` and `ledger_transactions` use "one-of nullable FKs" (`errand_id` now, `ride_id` added later with a CHECK). `MapsProvider` already has `route()`/`eta()`. `driver` is reserved in the role enum. |
| Driver accounts | Role enum value reserved. KYC tables are role-agnostic (`kyc_verifications.level`). |
| Corporate accounts | `errands.business_account_id` nullable. `admin_grants.permissions` style reused for `business_members.role`. |
| Subscriptions | Ledger and payment intent purposes are open enums (text + check), so adding `subscription_charge` is additive. |
| Priority fulfilment | `errands.priority` column (default `standard`). Fee schedule can gain `priority_fee_*` columns. |
| Inter-island (SVG) | `service_areas.island`. Multi-stop `errand_stops`, each with its own `place.service_area_id`. Errands aren't tied to one area. |
| New countries | New `markets` row + fee schedule + tax rules + runner rules + polygons + categories + translations. |

## 6. RLS strategy (summary)

Every table has RLS enabled with **default deny**. Helper SQL functions (`security definer`, `stable`):
`auth_user_market()`, `auth_has_role(role)`, `auth_admin_markets()`, `auth_is_participant(errand_id)`.

| Table group | Customer | Runner | Admin |
|---|---|---|---|
| `markets`, categories, service areas, prohibited items | read active | read active | read/write in scope |
| `errands` | own | `open` in own market (limited columns via view) + assigned | in scope |
| `offers` | on own errands | own | in scope |
| `messages` | participant | participant | in scope (support) |
| `payment_intents`, `refunds` | own errands (read) | — | in scope |
| `ledger_*` | via `my_transactions` view only | via `my_earnings` view only | finance permission in scope |
| `payouts`, `payout_accounts` | — | own | finance in scope |
| `kyc_verifications` | — | own (status only) | in scope |
| `provider_webhook_events` | — | — | finance/ops in scope |

All money and state-changing writes go through server use cases. Clients have no direct `insert`/`update` on errands, offers or money tables. RLS on those exists so that a leaked anon key or a buggy query can't read across users or markets.

Pre-acceptance privacy: Runners browsing open errands see a **view** that exposes the service area and an approximate location (rounded to around 500 m), not the exact pin, contact phone or landmark. They see full details after funding.
