# 12 — Fulfilment (as built in Stage 5)

Stage 5 takes an errand from "a Runner accepted" to "confirmed", and adds disputes, free cancellation before payment and two-way ratings. **No money moves yet**: escrow, refunds, payouts and item reconciliation are Stage 6.

## Flow

```mermaid
sequenceDiagram
  actor C as Customer
  participant App as Errand.markets
  actor R as Runner
  Note over C,R: offer_accepted (Stage 4)
  C->>App: pay (SANDBOX ONLY until Stage 6)
  App-->>R: "Paid — you can start" (push + SMS); exact address + contact unlock (RLS)
  R->>App: Start errand
  App-->>C: "Your Runner is on it"
  R->>App: Mark as done (≥1 proof photo; shopping: receipt photo + amount spent)
  App->>App: auto_release_at = now + 24h; reminders at +2h and +20h
  App-->>C: "Errand done — please confirm" (push + SMS)
  alt customer confirms
    C->>App: Confirm it's done
  else no answer
    App->>App: sweeper confirms at auto_release_at
  else problem
    C->>App: Report a problem → disputed (auto-release frozen)
    App-->>R: "A problem was reported"
  end
  App-->>R: "Errand confirmed"
  C->>App: rate Runner (1–5 + comment)
  R->>App: rate customer
  Note over C,R: each sees the other's rating once both have rated, or after 7 days
```

## What each person can do

| Status | Customer | Assigned Runner | Admin (ops, own markets) |
|---|---|---|---|
| `draft` · `open` | Cancel (free) | — | — |
| `offer_accepted` | Pay (sandbox), Cancel (free) | Back out (errand reopens to other Runners) | — |
| `funded` | Report a problem | Start, Report a problem | — |
| `in_progress` | Report a problem | Mark as done, Report a problem | — |
| `completed_pending_confirmation` | Confirm, Report a problem | Report a problem | — |
| `disputed` | — | — | Release to Runner → `confirmed`, or Refund → `refunded` |
| `confirmed` · `paid_out` | Rate the Runner (7 days) | Rate the customer (7 days) | — |

No new transitions were added: everything above uses edges already in [03](./03-errand-state-machine.md), and the Postgres trigger still rejects anything else. Every step locks the errand row (`SELECT … FOR UPDATE`) and re-checks its status, so a customer confirming at the same moment as the auto-release job can't both succeed (there's a test for exactly that race).

## Decisions applied

- **Q1c — Runners front item money** (recommended default). On a shopping errand the Runner adds a receipt photo and the amount actually spent. The customer sees the difference from the estimate ("EC$2.00 more than the estimate. The difference is settled at payment."). The settlement itself (top-up or refund, Q17/Q18) is Stage 6.
- **Q11 — Ratings are two-way and blind for 7 days** (recommended default). A rating is visible to the person rated only once they've rated back or the window has closed (`app.rating_revealed`). Blind ratings don't count towards someone's public score. Ratings can't be edited or deleted.
- **Q15 timers** come from the fee schedule frozen on the errand: auto-release 24h, reminders at 2h and 20h (`reminder_offsets_hours`), each sent once (`errands.reminders_sent`).
- **Who resolves disputes:** admins with the `ops` permission in the errand's market (same as held-errand review). Split outcomes need money movement and arrive in Stage 6.

## The sandbox payment (until Stage 6)

Errands can only reach `funded` through payment. So that fulfilment can be built and tested now, a **sandbox-only** "Mark as paid" button appears for the customer, following the pattern of the sandbox identity check:

- shown only when `PROVIDER_MODE_<MARKET>=sandbox`, and refused on production deploys (`VERCEL_ENV=production`), in the page and again in the server action;
- recorded in the timeline as `payment_confirmed` by `provider` with `{ provider: 'sandbox' }`;
- in live mode the customer instead sees "Card payment arrives in the next release".

## Not in Stage 5 (needs money: Stage 6)

- Ledger postings for funded / released / refunded, payouts, and `confirmed → paid_out`.
- Cancelling after payment (cancellation fee, refund — Q5, Q6). The customer is told to report a problem instead.
- Item top-ups before purchase and surplus refunds (Q17, Q18).
- Split dispute outcomes.
- The 30-minute funding timeout (still off; see [11](./11-marketplace.md)).

## Data and security

| Piece | Where | Protection |
|---|---|---|
| Proof + receipt photos | `media` (`kind` = `proof` / `receipt`) | Uploaded by anyone, but attached only by the assigned Runner to their own errand, only while completing it; visible to participants and admins (RLS). EXIF/GPS stripped like all photos. |
| What was spent on items | `errands.item_actual_minor` | Non-negative (check constraint). |
| Disputes | `disputes` | One open dispute per errand (unique index). Only the customer or assigned Runner can raise one (trigger). Once resolved it's final; it can't be deleted. Readable by participants and the market's admins. |
| Ratings | `ratings` | 1–5 stars, comment ≤ 500 chars. Only after confirmation, inside the 7-day window, customer ↔ Runner only (trigger). Append-only. Blind via RLS. |

Migrations: `0006_fulfilment.sql` (tables and columns, generated) and `0007_fulfilment_security.sql` (privileges, RLS, triggers, constraints).

## Notifications

| Type | To | Channels |
|---|---|---|
| `errand_paid` | Runner | push + SMS |
| `errand_started` | customer | push |
| `errand_completed`, `confirm_reminder` | customer | push + SMS |
| `errand_confirmed` | Runner | push + SMS |
| `errand_auto_confirmed` | both | push |
| `errand_cancelled` (after acceptance) | Runner | push + SMS |
| `runner_withdrew` | customer | push + SMS (and other Runners are told it's open again) |
| `errand_disputed` | the other party | push + SMS |
| `dispute_resolved` | both | push + SMS |
| `rating_received` | the person rated | push |

The sweeper (Inngest cron every 5 minutes, plus `/api/cron/sweep`) now expires errands, auto-confirms, and sends reminders.

## Tests

- Unit: completion rules, reminder timing, rating window and reveal (`tests/unit/fulfilment-domain.test.ts`).
- Integration (real Postgres): the full flow in both markets, out-of-order steps, reminders and auto-release, the confirm/auto-release race, disputes (scope, freeze, finality, DB trigger), blind ratings and the window, cancel and back-out (`tests/integration/fulfilment.test.ts`).
- E2E (browser, phone size): pay → start → proof → confirm → ratings in NG (delivery) and VC (shopping, with receipt); a dispute refunded by an admin; a Runner backing out (`tests/e2e/fulfilment.spec.ts`).
