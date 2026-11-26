# 08 — Compliance flags (for a lawyer — not legal advice)

I'm flagging these, not deciding them. Each row is a question a qualified lawyer or accountant in that jurisdiction should confirm **before launch** (launch markets) or **before entry** (future regions).

## A. Holding customer funds (escrow) — launch markets

| # | Question | Why it's raised by our design |
|---|---|---|
| NG-1 | Does collecting customer funds and releasing them to Runners after completion make Errand.markets a **payment service provider / escrow operator** requiring a CBN licence (e.g. PSSP, or a switching/processing category), or is it covered because funds sit with Paystack, a licensed PSP, under its terms? | The ledger holds customer money as a liability for up to auto-release + dispute time. |
| NG-2 | Is it permitted for funds to sit in the **Paystack balance** for days pending release and transfer, and does Paystack's merchant agreement allow marketplace escrow use? (Confirm with Paystack too.) | Recommended Paystack model (04 §4). |
| NG-3 | Paying item-cost **advances** to Runners before purchase: is this a disbursement on the customer's behalf that needs separate treatment? | Q1 in 09. |
| NG-4 | Tax: **VAT 7.5%** likely applies to our service fee and commission; registration with FIRS / NRS; **Significant Economic Presence** if the contracting entity is non-Nigerian; **withholding tax** on Runner payments; e-invoicing obligations. | Brief sets tax rate 0 for launch; the tax step is ready to enable. |
| VC-1 | Does holding funds in our merchant account and paying Runners later count as **money services / money transmission** under SVG law (FSA-supervised **Money Services Business** regime) or need **ECCB** authorisation? | Funds held in platform account; release tracked in our ledger only. |
| VC-2 | Does Scotiabank's merchant agreement allow marketplace / escrow-style use and onward payment to third parties? | Same. |
| VC-3 | **VAT (16% standard rate in SVG)** on platform fees: registration threshold and whether it applies to our fees. | Tax rules at 0 for launch. |
| BOTH-1 | **AML/CFT:** Runners receive regular payouts. What KYC level, transaction monitoring and suspicious-activity reporting (NFIU in Nigeria; FIU in SVG) apply to us? | Payouts + KYC. |
| BOTH-2 | **Chargebacks after payout:** who bears the loss, and can we contractually claw back from Runner payables? | Card funding + payouts. |

## B. Data protection — launch markets

| # | Question |
|---|---|
| NG-5 | **Nigeria Data Protection Act 2023 / NDPC GAID 2025:** registration as a data controller "of major importance"; DPO; DPIA for KYC (biometric selfie = sensitive data); **cross-border transfer to the UK (eu-west-2)**: adequacy or another legal basis. |
| NG-6 | Processing **NIN** via Dojah: NIMC licensing / terms for verification partners; our retention of NIN-derived data (we store a hash only). |
| VC-4 | Current SVG **data-protection legislation** status and obligations (e.g. Data Protection Act 2019, if in force): consent, transfer to UK, breach notification. |
| BOTH-3 | Retention periods for: chat messages, proof photos (may show people/homes), receipts, KYC references, financial records (likely 5–7 years for tax/AML). Deletion requests vs. legally required retention. |
| BOTH-4 | Location data: Runners' live location sharing (if added) and pins of customers' homes. |

## C. Worker classification & consumer protection — launch markets

| # | Question |
|---|---|
| BOTH-5 | Are Runners **independent contractors** under Nigerian Labour Act / SVG Employment Protection Act given our controls (acceptance-rate penalties, pricing control, required hours)? **The more of `runner_rules` we switch on, the stronger an employment argument becomes.** |
| BOTH-6 | Consumer protection (Nigeria **FCCPA 2018**; SVG consumer law): cancellation-fee disclosure, refund rights, dispute handling SLAs, price display incl. fees upfront. |
| BOTH-7 | Prohibited items: legal lists per market (alcohol, tobacco, pharmaceuticals/prescriptions, cash/forex handling, firearms, documents requiring authorisation such as collecting someone else's passport). |
| BOTH-8 | Insurance: liability for goods in transit / Runner injury; platform terms. |
| BOTH-9 | SMS: NCC DND rules (NG) for transactional vs promotional messaging; consent for marketing SMS. |

## D. Future regions — what our design would trigger

| Area | Design element | Regions & regimes to check |
|---|---|---|
| **Money transmission / escrow** | We hold customer funds and pay third parties | **EU/UK:** PSD2/PSD3 & EMD (commercial-agent exemption is narrow for marketplaces; usually solved by Stripe Connect as licensed PSP). **US:** state money-transmitter licences (solve via Stripe Connect/payfac). **India:** RBI Payment Aggregator rules (nodal/escrow accounts). **Kenya:** CBK, NPS Act; M-Pesa merchant terms. **Canada:** FINTRAC MSB registration. |
| **Data privacy** | Phone, location, KYC biometrics, chat, photos; hosted in UK | **EU:** GDPR (Art. 9 biometrics, DPIA, SCCs, EU representative); **UK:** UK GDPR; **US:** CCPA/CPRA, BIPA (Illinois biometrics!); **India:** DPDP Act 2023; **Brazil:** LGPD; **South Africa:** POPIA; **Kenya:** DPA 2019 (registration). Residency pinning per 07. |
| **Worker classification** | `runner_rules` (penalties, required hours, pricing control) | **EU:** Platform Work Directive (presumption of employment; algorithmic-management transparency, by Dec 2026 transposition). **UK:** worker status (Uber v Aslam). **US:** California AB5/Prop 22, other states. **Spain:** Rider Law. Per-market `runner_rules` lets us switch controls off where they'd create employment status. |
| **Platform reporting & tax** | We pay Runners and earn fees | **EU:** DAC7 seller reporting; **OECD MRDP** adopters; **US:** 1099-K/1099-NEC; VAT/GST on digital marketplace services (EU deemed-supplier rules, UK, Australia, India TCS, Canada). `tax_rules.invoice_required` + invoice entity (designed, not built). |
| **Consumer protection / marketplace law** | Fees, cancellations, ratings, disputes | **EU:** DSA marketplace traceability (KYBC for business sellers), P2B Regulation (ranking transparency, account suspension notice), Omnibus Directive (fake-review rules), Consumer Rights Directive. **UK:** DMCC Act 2024 (drip pricing — total price upfront). **US:** FTC junk-fee rules. |
| **Accessibility** | Web app | **EU:** European Accessibility Act (in force June 2025); **US:** ADA. We target WCAG 2.2 AA from day one. |
| **KYC / identity** | Dojah/Sumsub, ID hash | eIDAS 2 / local ID schemes; biometric consent; minimum-age verification for Runners. |
| **Ride-hailing (Phase 2)** | Drivers, vehicles | Transport licensing per city (TfL, NYC TLC, Lagos LASG, SVG Road Traffic / taxi permits), insurance for hire-and-reward. |
