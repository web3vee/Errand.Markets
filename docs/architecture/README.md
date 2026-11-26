# Errand.markets — Architecture (Stage 1)

> Status: **Draft for review.** No app code has been written. Everything here is a proposal until you approve it.

| # | Document | What it covers |
|---|---|---|
| 01 | [Stack & structure](./01-stack-and-structure.md) | Stack confirmation, notes against the decided stack, repo layout, module boundaries, request lifecycle |
| 02 | [Data model](./02-data-model.md) | ERD (markets, identity, errands, ledger, tax, payouts, Phase 2), table-by-table notes, RLS strategy |
| 03 | [Errand state machine](./03-errand-state-machine.md) | States, transitions, guards, side effects, timers |
| 04 | [Payments & ledger](./04-payments-and-ledger.md) | Fee & tax pipeline, double-entry chart of accounts, per-market flow diagrams (NG, VC) |
| 05 | [Adapter interfaces](./05-adapters.md) | `PaymentProvider`, `PayoutProvider`, `KycProvider`, `SmsProvider`, `MapsProvider` + registry and sandbox mode |
| 06 | [External accounts](./06-external-accounts.md) | What you need to set up, per market, and which env var each key goes to |
| 07 | [Data residency](./07-data-residency.md) | What regional pinning would require and what we do now to keep it possible |
| 08 | [Compliance flags](./08-compliance-flags.md) | Questions for a lawyer: launch markets and future regions |
| 09 | [Open questions](./09-open-questions.md) | Product decisions I need from you before Stages 3–6 |

Repo root also has [`.env.example`](../../.env.example) with every secret namespaced per market.

## Principles that every later stage follows

1. **Market is a first-class dimension.** Users, errands, offers, payment intents, ledger accounts, ledger transactions, payouts, disputes, and reports carry a `market_id`. Every service call runs inside a `MarketContext` built from the `markets` row; no code reads a currency, phone prefix, fee, tax rate, locale or provider from anywhere else.
2. **Money is `bigint` in minor units + ISO 4217 code.** The minor-unit precision comes from `markets.currency_minor_unit`. There is no FX. A ledger entry's currency must match its account's currency, which is enforced in the DB.
3. **Balances come from the ledger.** Nothing stores a mutable balance. Journal entries are append-only, and corrections are reversing entries.
4. **Providers are behind interfaces.** Domain code receives `ctx.providers.payment` and similar handles. Lint rules stop `src/modules/**` from importing `src/providers/**`.
5. **Provider truth drives money state.** Payment, refund, payout and KYC status change only on a verified webhook or a server-side status query. Client redirects only ever trigger a server-side re-check.
6. **Everything is idempotent.** Webhooks are deduplicated by `(provider, event_id)`. Ledger transactions have unique `idempotency_key`s. Mutating API routes accept an `Idempotency-Key`.
7. **Defense in depth.** Zod at the edge, RBAC + market scope in the service layer, RLS in Postgres, and DB constraints and triggers for invariants (balanced journals, legal state transitions, same-market offers).
8. **Phase 2 is additive.** Ride-hailing, drivers, corporate accounts, subscriptions, priority and inter-island are each new tables or nullable columns, never a rewrite.
