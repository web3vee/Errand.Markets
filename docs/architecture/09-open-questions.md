# 09 — Open questions (product decisions I need from you)

## Decisions log

| Date | Decision |
|---|---|
| 2026-11-26 | All recommended defaults accepted. **Q0 = Option A** (Supabase Auth + Send-SMS hook; Termii NG, Twilio Messaging VC). **Q2 = yes** (Paystack: collect to platform balance, release via Transfers). |
| 2026-11-26 | **Visual direction A (Ledger)**. Direction B removed. |
| 2026-11-26 | **Q4/Q7 pricing:** the customer sets the price for each errand and can edit it while no Runner has accepted. The **first eligible Runner to accept** gets the errand. Runner offers are off. **No commission at launch.** Price can't change after acceptance (default). |
| 2026-11-26 | **Q1 items:** Runners buy items with their own money and are **reimbursed on delivery**. This replaces the brief's "Runners never front their own money". |
| 2026-11-26 | **Q4b:** no minimum errand price — customers set any price per errand. **Q22:** customer pays **after a Runner accepts** (brief's order). **Q4a:** **5% service fee**, paid by the customer, applied to the errand price (not to item costs — confirm if items should also carry it). **Q1a:** customer pays the **estimated item cost upfront** (held, settled against the receipt). Applied as fee-schedule version 2 (migration 0005); errands keep the version they were posted under. |
| 2026-11-26 | **Stage 4 built with:** min price / item cap **unset** (nothing enforced until decided); brief's payment order kept (accept → pay, Q22 still open); prohibited-items list **empty** until legal input; accepted defaults: expiry 48h, max 3 active errands per Runner, Q10 questions before acceptance, Q14 hold for review. |

## Still open (blocking the stage shown)

| # | Question | Recommended default | Blocks |
|---|---|---|---|
| Q1b | St. Vincent payouts are admin-approved bank batches, so a Runner could wait **several days** to be repaid for items. Acceptable? Or weekly vs twice-weekly batches? | Accept; twice-weekly batches. | Stage 6 |
| Q1c | Who fronts the money: the **Runners**, or Errand.markets itself? | Runners (that's how the docs are written now). | Stage 5 |
| Q1d | Limit on item cost per errand (protects Runners and limits fraud)? | Per-market cap, set by admin. | Stage 4 |
| Q23 | **Business contact email** shown on the homepage. | Please provide the address. | Homepage |

## Blocking Stage 3 (auth)

| # | Question | Recommended default |
|---|---|---|
| Q0 | **OTP path.** Option A: Supabase Auth + Send-SMS hook (Termii NG / Twilio *Messaging* VC). Option B: provider-verified OTP (Termii Token / Twilio *Verify*) + custom session minting. See 01 §3. | **A** |
| Q8 | **KYC approval.** Provider "approved" → auto-approve the Runner, or always require admin approval too? | Admin approval required at launch (the brief asks for an approve/reject screen); make auto-approve a per-market toggle. |
| Q13 | Minimum Runner age? Required profile fields (photo, emergency contact)? | 18; profile photo required, emergency contact optional. |

## Blocking Stage 4–5 (marketplace, fulfilment)

| # | Question | Recommended default |
|---|---|---|
| Q7 | **Fixed-price errands:** when a Runner "accepts" a fixed price, is it auto-assigned (first come), or does the customer still pick among accepters? | Runner's acceptance = an offer at the fixed price; customer picks. Per-market option for auto-assign later. |
| Q10 | Can Runners **message the customer before acceptance** (questions on an open errand)? | Yes, one thread per Runner per errand; no phone numbers or exact address shown until funded. |
| Q11 | **Ratings:** two-way (customer ↔ Runner)? Blind until both rate or 7 days pass? | Two-way, blind, 7-day window. |
| Q14 | **Prohibited-item "flag for review"** matches: block outright, or publish and queue for admin? | Hold in `draft` with "under review" until an admin clears it. Hard-block list for clear cases. |
| Q15 | Default **errand expiry** when no offer is accepted, and **funding timeout** after accepting an offer. | 48h expiry; 30 min funding timeout. Both per-market config. |
| Q16 | Limit on concurrent active errands per Runner? | 3 (per-market `runner_rules`). |

## Blocking Stage 6 (payments)

| # | Question | Recommended default |
|---|---|---|
| **Q1** | **Item-cost advance.** "Runners never front their own money", but escrowed money isn't in the Runner's hands at the shop. How do Runners pay for items? (a) Platform transfers the item estimate to the Runner when they start (NG: instant via Paystack Transfers; VC: no automated rail, so it would need a manual admin transfer or would be unavailable). (b) Disallow purchase errands in VC at launch. (c) Runner fronts and is reimbursed (contradicts the brief). (d) Other (prepaid/virtual cards, pay-at-merchant). | **NG: (a).** **VC: your call.** Realistic options are (b), or (a) with an admin-approved advance and a cap. Advances are capped per market and only for Runners with N completed errands. |
| **Q2** | **Paystack escrow model.** Paystack has no hold feature, and subaccount splits settle automatically. OK to collect into the platform balance and release via Transfers? | Yes (04 §4). |
| Q3 | **SVG cash economy.** Card-only at launch, or also "bank transfer with reference, confirmed by admin" as a funding method? | Card-only at launch; design permits a `manual_bank_transfer` payment adapter later. |
| Q4 | **Fee bases.** Service fee = % of errand fee only, or of errand fee + item cost? Flat component? Min/max? Commission = % of errand fee only (never items)? Actual numbers per market? | Service fee on errand fee only, % + min; commission on errand fee only. **Numbers: please provide.** |
| Q5 | **Cancellation after funding.** Is the cancellation fee fixed or a %? Is the service fee refunded on cancellation? Does the platform take commission on the cancellation fee? | Fixed per market; service fee refunded; no commission on cancellation fee. |
| Q6 | **Runner-initiated cancellation after funding.** Full refund to customer, any penalty to the Runner (counts against acceptance rate), errand re-opened to other Runners? | Full refund **or** re-open (customer chooses); strike recorded; no money penalty. |
| Q9 | **Payout cadence & controls.** NG: pay out per errand immediately on confirm, or daily batch? Minimum payout? VC: batch schedule (daily/weekly)? Must the approver differ from the creator (four-eyes)? | NG: per errand on confirm. VC: twice weekly, four-eyes approval. |
| Q12 | **Processing fees & chargebacks.** Who absorbs Paystack/Scotia fees (platform from service fee, or passed on)? Chargeback after payout: recover from future Runner earnings? | Platform absorbs; chargebacks recoverable from Runner payable only if the dispute is resolved against the Runner. |
| Q17 | **Top-up tolerance.** If the actual item cost is slightly above the estimate (e.g. ≤5%), auto-approve, or always ask the customer? | Always ask at launch; per-market tolerance config set to 0. |
| Q18 | **Top-up declined.** If the customer declines a top-up: Runner buys what fits the budget, or errand cancelled (with/without fee)? | Runner buys within budget after customer confirms in chat; otherwise cancel without fee to either side. |

## Brand & homepage (Stage 2)

| # | Question | Recommended default |
|---|---|---|
| Q19 | Font: Inter, Geist, or Satoshi? (Satoshi is licensed via Fontshare: free, but check terms.) | Show both directions; Geist in one, Inter in the other. |
| Q20 | Accent colour preference, or should I propose? The logo is monochrome. | I'll propose two in Stage 2. |
| Q21 | Market detection: IP geolocation (Vercel `x-vercel-ip-country`) with manual switch, remembered in a cookie? Users outside NG/VC see the picker. | Yes. |
