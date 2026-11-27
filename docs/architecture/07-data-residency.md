# 07 — Data residency

**Today:** one Supabase project in eu-west-2 serves both markets. That's fine for launch, but it means Nigerian personal data is transferred to the UK, which is a compliance question (see 08).

**Goal:** be able to pin a market (e.g. a future EU or Nigerian market) to its own regional database **without touching business logic.**

## What we do in the MVP so it stays possible

| Decision | Why it matters later |
|---|---|
| `markets.data_region` column; `db/client.ts` exposes `dbFor(marketOrRegion)` and **every** repository call goes through `MarketContext.db` | Moving a market = changing its `data_region` + migrating its rows. No query changes. |
| UUIDv7 ids everywhere, no sequences in shared keys | Rows can move between databases without id collisions. |
| Every market-owned row has `market_id`; no FK crosses markets | A market's data is a clean, extractable partition. |
| Storage paths prefixed `/{market_code}/…`; bucket resolved via `storageFor(market)` | Objects can move to a regional bucket. |
| Inngest events carry `marketCode`; jobs resolve the DB from it | Jobs follow the data. |
| Webhook URLs include the market (`/api/webhooks/paystack/ng`) | Routing doesn't depend on looking up a global table first. |
| Admin cross-market views are built as **fan-out queries per region** behind one service function | Global admin still works after a split (slower, but correct). |
| Analytics read from a pseudonymised export, not the primary DB | An EU region can feed aggregates without exporting personal data. |

## What a real regional split would require (not now)

1. **A separate Supabase project per region.** Supabase Auth lives inside each project, so a user's identity is regional. We'd need a small **global directory** (`phone_hash → region`), with no personal data beyond a keyed hash, so the login screen knows which project to send the OTP through. Users changing markets across regions becomes a data-migration flow.
2. **Vercel function region per request.** Either deploy regional function groups or accept cross-region latency from London. Vercel supports per-route regions, and edge middleware can pick the route by market cookie.
3. **Realtime and Storage per region.** Clients connect to the region of their market (URL from a `/api/config` bootstrap, not a build-time env var). This is why `NEXT_PUBLIC_SUPABASE_URL` should eventually become per region.
4. **Backups, logs and processors in-region.** Sentry, Inngest, the email provider etc. need either regional data hosting or no personal data in payloads (we already keep PII out of job payloads: ids only).
5. **Migrations run against every region** (drizzle-kit per `DATABASE_URL_<REGION>`) in CI.
6. **Legal artefacts:** a DPA with each sub-processor, a record of processing per region, and transfer mechanisms for any data leaving the region.

Estimated effort when needed: moderate (infrastructure + auth directory + migration tooling). The domain code doesn't change.
