# BonLift AI: Requirements Draft

**Source:** Email from management on the proposed "AI" upselling platform
**Status:** Draft for discussion
**Last updated:** 2 November 2026

> Priorities (Must / Should / Could) are proposed, not confirmed. Management explicitly marked only the exclusion rules as "die-die-must-have". Requirement IDs are stable and can be referenced in discussion.
>
> **Status** covers this repository only, as audited and cross-checked against `docs/module-roadmap.md` on 2 November 2026. **Done** means fully met as written and usable in the ordering flow. **Partly done** states what exists, what is missing, and where the rest is planned. **Not started** means no work exists here; the brackets give the roadmap module or owning system, and progress in other systems has not been checked. **No roadmap module** means neither this engine's plan nor its list of external owners covers it.

---

## 0. Decisions Log

| # | Decision | Date | Impact |
|---|---|---|---|
| D-1 | Customer profiles are shared **across brands** (scope to be confirmed; see OQ-1) | 7 Oct 2026 | Section 7 (XB-*), PDPA risk G-3 |
| D-2 | In-scope channels are **TQR and kiosk** (all customer-facing) | 7 Oct 2026 | Section 8 (CH-*) |
| D-3 | Member profiles and non-member mobile-number profiles **merge** | 7 Oct 2026 | Section 9 (MG-*) |

---

## 1. Customer Identification & Consent

| ID | Requirement | Priority | Status |
|---|---|---|---|
| CI-1 | Diners enter a mobile number to receive an e-receipt. The mobile number is the unique customer identifier, including for non-members. | Must | Not started (CRM) |
| CI-2 | Purchase history, preferences, likes and dislikes are linked to the mobile number profile. | Must | Partly done: purchase history is linked to an opaque customer ID through order snapshots and customer item scores. No mobile number profile, preferences, likes or dislikes. Remaining: CRM. |
| CI-3 | Returning diners entering the same mobile number are recognised, and their profile is loaded for recommendations. | Must | Not started (CRM) |
| CI-4 | Promotional updates are sent primarily via email, which means an email address must also be collected (see G-2). | Must | Not started (CRM) |
| CI-5 | Explicit opt-in for personalisation, separate from marketing consent and from the e-receipt itself. | Must | Not started (CRM) |
| CI-6 | Diners can update preferences anytime and withdraw consent. | Must | Not started (CRM) |
| CI-7 | The mobile number is verified via OTP before a profile is loaded, linked, or merged (see G-1). | Must | Not started (CRM) |

## 2. Preference Survey & Incentive

| ID | Requirement | Priority | Status |
|---|---|---|---|
| PS-1 | Short questionnaire offered through TQR, with a $5 voucher on completion. | Must | Not started (CRM) |
| PS-2 | Questions cover eating preference, proteins, fibre, flavours, ordering interests, decision factors, desired recommendation types, dislikes, and allergies/exclusions (9 questions per the draft). | Must | Not started (CRM) |
| PS-3 | Selection limits are enforced per question: "up to three" for Q1–Q7, "all that apply" for Q8–Q9. | Must | Not started (CRM) |
| PS-4 | Free-text "Other" fields for eating preference, dislikes and allergies. | Should | Not started (CRM) |
| PS-5 | Completion takes under one minute on mobile. | Should | Not started (CRM) |
| PS-6 | The voucher is issued once per customer globally, with defined expiry and redemption rules. | Must | Not started (CRM) |
| PS-7 | Contradictory answers are prevented or resolved, with the most restrictive answer winning (see G-6). | Must | Not started (CRM) |

## 3. Menu Data Prerequisites

The hard exclusion rules cannot work unless menu items carry this data. All tags follow a **shared platform taxonomy** (see XB-5).

| ID | Requirement | Priority | Status |
|---|---|---|---|
| MD-1 | Each item is tagged with allergens, aligned to the Q9 list. | Must | Not started (POS) |
| MD-2 | Each item is tagged with dietary attributes: contains pork, contains beef, vegetarian, vegan, pescatarian-safe, halal-certified. | Must | Not started (POS) |
| MD-3 | Each item is tagged with key ingredients for dislike matching (coriander, garlic, onion, mushroom, etc.). | Must | Not started (POS) |
| MD-4 | Each item is tagged with its category/role: main, side, drink, dessert, add-on, sharing, set/bundle. | Must | Not started (POS) |
| MD-5 | Each item is tagged with portion type (individual / sharing) and daypart availability (breakfast / lunch / tea / dinner). | Must | Not started (POS) |
| MD-6 | Each item is tagged with flavour profile and protein/fibre type, to match Q2–Q4. | Should | Not started (POS) |
| MD-7 | Pairing rules can be configured manually (e.g. Burger → fries, drink, side). | Must | Not started (owner undecided) |
| MD-8 | Merchant-level attributes are available: margin, merchant priority flag, new/limited-time flag. | Should | Not started (no roadmap module) |

## 4. Recommendation Engine: Six-Stage Waterfall

### Stage 1: Remove ineligible items (hard filters)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| RE-1.1 | Exclude items marked unavailable in POS ("86") in real time. | Must | Not started (ordering API) |
| RE-1.2 | Exclude items not available at the outlet, for the current daypart, or for the current ordering channel. | Must | Not started (ordering API) |
| RE-1.3 | Exclude items that conflict with the customer's dietary or religious restrictions. | Must | Not started (ordering API) |
| RE-1.4 | Exclude items that contain the customer's declared allergens. | Must | Not started (ordering API) |
| RE-1.5 | Exclude items already in the cart or included as part of a set in the cart. | Must | Partly done: `POST /v1/recommendations` leaves out items already in the cart. Items included as part of a set in the cart need set data from POS. Remaining: ordering API. |
| RE-1.6 | Hard filters always override scoring signals. For example, "No Beef" means no beef is ever shown, even if beef is the top co-purchase. | Must | Not started (ordering API) |

### Stage 2: Understand cart intent

| ID | Requirement | Priority | Status |
|---|---|---|---|
| RE-2.1 | Classify cart contents into main items and add-ons. | Must | Not started (P5; P4 leaves addons out of pairs) |
| RE-2.2 | Determine the meal occasion from the daypart. | Must | Partly done: `POST /v1/recommendations` maps the order time (local, with offset) to the daypart in the published run's config. Not yet called from the ordering flow. Remaining: TQR and kiosk integration. |
| RE-2.3 | Capture dine-in or takeaway and the number of pax. | Must | Not started (P5, pax only; dine-in/takeaway has no roadmap module) |
| RE-2.4 | Identify missing meal components (e.g. a main with no drink). | Should | Not started (no roadmap module) |
| RE-2.5 | For single-pax orders, suppress sharing-size items. For group orders, allow platters, sharing dishes and bundles. | Must | Not started (no roadmap module) |

### Stage 3: Generate candidates

| ID | Requirement | Priority | Status |
|---|---|---|---|
| RE-3.1 | Generate "items purchased together" candidates for current cart items, computed per brand/outlet (see XB-3). | Must | Partly done: item affinity (confidence and lift) is calculated and published per brand. Not yet served for a cart. Remaining: P5. |
| RE-3.2 | Generate candidates from configured complementary pairing rules (MD-7). | Must | Not started (owner undecided) |
| RE-3.3 | Generate set, bundle and upgrade opportunities. | Should | Not started (no roadmap module) |
| RE-3.4 | Generate outlet-level popular add-ons, which also serve as the fallback for new or anonymous customers (see G-8). | Must | Partly done: outlet popularity is calculated, published and served per daypart by `POST /v1/recommendations`, which is the fallback for every cart today. It covers all items rather than only add-ons, which needs category tags from POS (MD-4). Remaining: MD-4 (POS). |

### Stage 4: Personalise ranking

| ID | Requirement | Priority | Status |
|---|---|---|---|
| RE-4.1 | Boost candidates that match the customer's likes, favourites, and eating, protein and fibre preferences. | Must | Not started (no roadmap module) |
| RE-4.2 | Use frequently purchased items (last 6–8 orders) as a behavioural signal for preferred categories and habitual combinations. | Must | Partly done: recency-weighted customer item scores are calculated and published per brand. Not yet used in ranking, no category or combination signals, and a time window with half-life replaces "last 6–8 orders". Remaining: P5. |
| RE-4.3 | Frequent purchases must not override cart relevance. An item is not recommended just because it is a favourite if it doesn't complement the cart. | Must | Not started (P5) |
| RE-4.4 | Apply diversity so the same favourite isn't recommended every time, and introduce related or similar items. | Should | Not started (P5) |
| RE-4.5 | Demote items matching dislikes. Filter vs demotion is unresolved (see G-4). | Must | Not started (no roadmap module) |

### Stage 5: Commercial and contextual adjustments

| ID | Requirement | Priority | Status |
|---|---|---|---|
| RE-5.1 | Apply promotion and voucher eligibility, plus savings from upgrading or bundling. | Should | Not started (deferred to v2) |
| RE-5.2 | Nudge toward minimum-spend thresholds. | Should | Not started (deferred to v2) |
| RE-5.3 | Weight by margin, merchant priority, and stock level. | Should | Not started (deferred to v2) |
| RE-5.4 | Boost new or limited-time items. | Could | Not started (deferred to v2) |
| RE-5.5 | Use weather as a contextual signal. | Could | Not started (deferred to v2) |

### Stage 6: Present the recommendation

| ID | Requirement | Priority | Status |
|---|---|---|---|
| RE-6.1 | Show the top 1–3 recommendations. | Must | Partly done: `POST /v1/recommendations` returns a ranked list for the caller to show its top 1–3 after hard filters. No TQR or kiosk screen shows it yet. Remaining: TQR and kiosk integration. |
| RE-6.2 | Show a short, templated reason (e.g. "Goes well with your Grilled Chicken Rice"), subject to CH-2 on kiosk. | Should | Partly done: each item carries a reason code (`popular_at_outlet`), with no sensitive data. The display templates are not defined yet. Remaining: P5 and TQR. |
| RE-6.3 | Don't repeat recommendations the customer has rejected. | Must | Not started (H4, blocked by OQ-9) |
| RE-6.4 | Record the outcome of each recommendation: accepted, ignored, or rejected. | Must | Not started (H4) |

## 5. Non-Functional Requirements

| ID | Requirement | Status |
|---|---|---|
| NF-1 | The recommendation response must not slow the cart flow. Target to be agreed (e.g. p95 under 300ms). | Partly done: about 3–5 ms per call warm on a local machine (2 Nov 2026), from one indexed query. Target not agreed and no load test. Remaining: H8. |
| NF-2 | If the recommendation service fails or times out, ordering continues normally, with no recommendations or cached popular items. | Partly done: the engine returns `200` with an empty list on any database error, missing published run or unknown outlet. Callers still need a short timeout and to continue without recommendations. Remaining: TQR, POS and kiosk integration. |
| NF-3 | 86/availability status is near-real-time, so a sold-out item is never upsold. | Not started (no roadmap module) |
| NF-4 | Customer profiles, especially allergy and religious data, are encrypted at rest, access-controlled, and audit-logged. | Not started (H1) |
| NF-5 | Every recommendation is traceable to the rules and signals that produced it, for debugging and complaint handling. | Partly done: each score links to its run, config version and input window. Responses include the run ID. No request logs yet, and runs do not record which snapshots they used. Remaining: P5. |
| NF-6 | Metrics: recommendation acceptance rate, average order value uplift, and ideally A/B comparison against no recommendations. | Not started (H7) |

## 6. Approach Recommendation: Deterministic First

Almost everything described is deterministic: Stages 1–2 are rules, Stage 3 is market-basket analysis computable in SQL batch jobs, and Stages 4–5 are a weighted scoring function. The recommendation is:

- **v1:** rules- and score-based, with no LLM. This is predictable, testable, cheap, and has no hallucination risk.
- **Never** use an LLM for hard filters (allergens, dietary, availability).
- **Later phase:** AI may learn ranking weights from accept/reject data (RE-6.4).
- "Explain why" text comes from templates, not free LLM generation.

## 7. Cross-Brand Profiles (D-1)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| XB-1 | A single global customer identity (verified mobile number), with brand-level data linked underneath it. | Must | Not started (CRM) |
| XB-2 | Dietary restrictions, allergies, dislikes and survey preferences are global: declared once and applied at every brand. | Must | Not started (no roadmap module) |
| XB-3 | "Items purchased together" is computed per brand (or per outlet), because menus differ across brands. | Must | Partly done: "items purchased together" is calculated per brand. Not yet served for a cart. Remaining: P5. |
| XB-4 | Frequently purchased items stay brand-specific at the item level. At the category level (e.g. "likes cold coffee"), they can carry across brands as a weaker signal. | Should | Partly done: customer item scores are stored per brand at item level. No category-level signal across brands. Remaining: no roadmap module; excluded by H5 design. |
| XB-5 | All brands use a shared platform taxonomy for allergens, dietary attributes and key ingredients, so exclusions declared at one brand are enforceable at another. | Must | Not started (no roadmap module) |
| XB-6 | The survey is completed once across all brands. The voucher is claimable once per customer globally, with rules defining which brand(s) it can be redeemed at. | Must | Not started (CRM) |
| XB-7 | Consent withdrawal and preference updates propagate to all brands immediately. | Must | Not started (CRM) |
| XB-8 | Consent wording states that data is shared across brands, and names or describes those brands. | Must | Not started (CRM) |

## 8. Channels: TQR and Kiosk (D-2)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| CH-1 | Recommendations work on both TQR and kiosk, with channel availability enforced via RE-1.2. | Must | Not started (no roadmap module) |
| CH-2 | On the kiosk, recommendation reasons must not reveal sensitive data (no "Because you're halal", "Avoiding peanuts for you", or "Your usual order"). | Must | Not started (kiosk app) |
| CH-3 | Kiosk sessions auto-clear on order completion, on inactivity timeout, and on explicit sign-out. A loaded profile never carries over to the next person. | Must | Not started (kiosk app) |
| CH-4 | Mobile number entry on the kiosk is masked after input, and identification uses OTP sent to the diner's phone. | Must | Not started (kiosk app) |
| CH-5 | The full survey is offered on TQR only. The kiosk shows a QR code or link to complete it on the diner's phone. | Should | Not started (kiosk app) |
| CH-6 | Pax count capture is supported on both channels (needed for RE-2.5). | Must | Not started (kiosk app) |
| CH-7 | Recommendations load asynchronously on the kiosk and never block the ordering flow. | Must | Not started (kiosk app) |

## 9. Profile Merge: Member and Non-Member (D-3)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| MG-1 | Profiles merge only when they share the same OTP-verified mobile number. | Must | Not started (CRM) |
| MG-2 | Purchase history is merged as a union. | Must | Not started (CRM) |
| MG-3 | Allergies and dietary restrictions merge using the most restrictive rule (union of all declared exclusions). | Must | Not started (CRM) |
| MG-4 | For soft preferences (likes, flavours, interests), the most recently updated value wins. | Should | Not started (CRM) |
| MG-5 | Consent merges conservatively: if either profile opted out, the merged profile is opted out until the customer re-consents. | Must | Not started (CRM) |
| MG-6 | The survey voucher cannot be claimed twice through a merge. | Must | Not started (CRM) |
| MG-7 | Every merge is audit-logged, with a manual unmerge procedure for wrong merges, including recycled mobile numbers. | Must | Not started (CRM) |
| MG-8 | When a member changes their mobile number, the new number is re-verified and the profile is re-keyed. | Must | Not started (CRM) |

---

## 10. Gaps, Conflicts and Risks

**G-1. Unverified mobile number is a privacy breach risk.** Without OTP, anyone can enter another person's number and load that person's history, preferences and allergies, and can farm vouchers with fake numbers. OTP adds per-SMS cost and checkout friction. *(Addressed by CI-7, CH-4, MG-1.)*

**G-2. Identifier versus channel mismatch.** The mobile number is the identifier, but promotions go primarily via email, which means also collecting an email address. If SMS or WhatsApp marketing is used instead, Singapore DNC Registry rules apply.

**G-3. PDPA exposure.** A mobile number required for an e-receipt cannot be reused for profiling and marketing unless each purpose has its own consent. Allergy and religious data is sensitive. A retention policy and an access/correction/withdrawal process are required. Cross-brand sharing (D-1) increases the exposure, especially if the brands are separate merchants, in which case Solution Details may become an organisation collecting personal data in its own right rather than a data intermediary. **Requires compliance review.**

**G-4. Dislikes are treated inconsistently.** The proposal lists dislikes both as a hard exclusion and as a Stage 4 ranking signal. The proposed resolution: hard exclusion for allergies and dietary/religious restrictions; strong demotion for dislikes.

**G-5. Allergen liability.** Exclusions are only as good as the menu tagging. This needs a defined data owner, a validation process, and a disclaimer that recommendations are not an allergen guarantee.

**G-6. Contradictory survey answers.** Q1 allows "I eat everything" plus "Vegan". A pescatarian can also declare a fish allergy. The survey needs mutually exclusive options and a most-restrictive-wins rule.

**G-7. "AI" scope is undefined.** See Section 6.

**G-8. Cold start.** New customers, non-respondents, and new outlets/brands have no history. Proposed fallback order: pairing rules, then outlet popularity, then category defaults.

**G-9. Undefined behaviours.** These need definitions: what counts as "rejected" (explicit dismiss vs not added) and how long suppression lasts; whether "last 6–8 purchases" means orders or items; the source and cost of weather data.

**G-10. Cross-brand commercial conflict.** If brands are separate merchants, they may object to their customers' behaviour informing another merchant's upsells.

---

## 11. Open Questions

| ID | Question | Owner | Status |
|---|---|---|---|
| OQ-1 | Does "across brands" mean brands under **one client group**, or **all merchants on the Solution Details platform**? This determines whether G-3 is a consent-wording exercise or a fundamental design issue. | Management | Open |
| OQ-2 | Who maintains menu tagging (allergens, dietary, ingredients): merchant, ops team, or onboarding? Critical given XB-5. | Management | Open |
| OQ-3 | Who funds the $5 voucher (merchant or platform), and what are the anti-abuse rules? | Management | Open |
| OQ-4 | What is the success metric and target (e.g. +X% average order value)? | Management | Open |
| OQ-5 | What is the v1 scope? Proposed: v1 = Stages 1–3 + 6 with outlet-level data; v2 = personalisation (Stage 4) + commercial logic (Stage 5). | Management | Open |
| OQ-6 | Is OTP verification approved, given per-SMS cost and checkout friction (G-1)? | Management | Open |
| OQ-7 | Is email collection acceptable at checkout, or should marketing use another channel (G-2)? | Management | Open |
| OQ-8 | Are dislikes a hard exclusion or a demotion (G-4)? | Management | Open |
| OQ-9 | What counts as a "rejected" recommendation, and for how long is it suppressed (G-9)? | Product | Open |
| OQ-10 | Who performs the PDPA / compliance review (G-3)? | Management | Open |
| ~~OQ-A~~ | ~~Is the customer profile scoped per merchant/brand or shared?~~ | — | Resolved: D-1 |
| ~~OQ-B~~ | ~~Which channels are in scope for v1?~~ | — | Resolved: D-2 |
| ~~OQ-C~~ | ~~Do member and mobile-number profiles merge?~~ | — | Resolved: D-3 |
