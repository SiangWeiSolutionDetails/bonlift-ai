# Upselling Platform: Requirements Draft

**Source:** Email from management on the proposed "AI" upselling platform
**Status:** Draft for discussion
**Last updated:** 7 October 2026

> Priorities (Must / Should / Could) are proposed, not confirmed. Management explicitly marked only the exclusion rules as "die-die-must-have". Requirement IDs are stable and can be referenced in discussion.

---

## 0. Decisions Log

| # | Decision | Date | Impact |
|---|---|---|---|
| D-1 | Customer profiles are shared **across brands** (scope to be confirmed; see OQ-1) | 7 Oct 2026 | Section 7 (XB-*), PDPA risk G-3 |
| D-2 | In-scope channels are **TQR and kiosk** (all customer-facing) | 7 Oct 2026 | Section 8 (CH-*) |
| D-3 | Member profiles and non-member mobile-number profiles **merge** | 7 Oct 2026 | Section 9 (MG-*) |

---

## 1. Customer Identification & Consent

| ID | Requirement | Priority |
|---|---|---|
| CI-1 | Diners enter a mobile number to receive an e-receipt. The mobile number is the unique customer identifier, including for non-members. | Must |
| CI-2 | Purchase history, preferences, likes and dislikes are linked to the mobile number profile. | Must |
| CI-3 | Returning diners entering the same mobile number are recognised, and their profile is loaded for recommendations. | Must |
| CI-4 | Promotional updates are sent primarily via email, which means an email address must also be collected (see G-2). | Must |
| CI-5 | Explicit opt-in for personalisation, separate from marketing consent and from the e-receipt itself. | Must |
| CI-6 | Diners can update preferences anytime and withdraw consent. | Must |
| CI-7 | The mobile number is verified via OTP before a profile is loaded, linked, or merged (see G-1). | Must |

## 2. Preference Survey & Incentive

| ID | Requirement | Priority |
|---|---|---|
| PS-1 | Short questionnaire offered through TQR, with a $5 voucher on completion. | Must |
| PS-2 | Questions cover eating preference, proteins, fibre, flavours, ordering interests, decision factors, desired recommendation types, dislikes, and allergies/exclusions (9 questions per the draft). | Must |
| PS-3 | Selection limits are enforced per question: "up to three" for Q1–Q7, "all that apply" for Q8–Q9. | Must |
| PS-4 | Free-text "Other" fields for eating preference, dislikes and allergies. | Should |
| PS-5 | Completion takes under one minute on mobile. | Should |
| PS-6 | The voucher is issued once per customer globally, with defined expiry and redemption rules. | Must |
| PS-7 | Contradictory answers are prevented or resolved, with the most restrictive answer winning (see G-6). | Must |

## 3. Menu Data Prerequisites

The hard exclusion rules cannot work unless menu items carry this data. All tags follow a **shared platform taxonomy** (see XB-5).

| ID | Requirement | Priority |
|---|---|---|
| MD-1 | Each item is tagged with allergens, aligned to the Q9 list. | Must |
| MD-2 | Each item is tagged with dietary attributes: contains pork, contains beef, vegetarian, vegan, pescatarian-safe, halal-certified. | Must |
| MD-3 | Each item is tagged with key ingredients for dislike matching (coriander, garlic, onion, mushroom, etc.). | Must |
| MD-4 | Each item is tagged with its category/role: main, side, drink, dessert, add-on, sharing, set/bundle. | Must |
| MD-5 | Each item is tagged with portion type (individual / sharing) and daypart availability (breakfast / lunch / tea / dinner). | Must |
| MD-6 | Each item is tagged with flavour profile and protein/fibre type, to match Q2–Q4. | Should |
| MD-7 | Pairing rules can be configured manually (e.g. Burger → fries, drink, side). | Must |
| MD-8 | Merchant-level attributes are available: margin, merchant priority flag, new/limited-time flag. | Should |

## 4. Recommendation Engine: Six-Stage Waterfall

### Stage 1: Remove ineligible items (hard filters)

| ID | Requirement | Priority |
|---|---|---|
| RE-1.1 | Exclude items marked unavailable in POS ("86") in real time. | Must |
| RE-1.2 | Exclude items not available at the outlet, for the current daypart, or for the current ordering channel. | Must |
| RE-1.3 | Exclude items that conflict with the customer's dietary or religious restrictions. | Must |
| RE-1.4 | Exclude items that contain the customer's declared allergens. | Must |
| RE-1.5 | Exclude items already in the cart or included as part of a set in the cart. | Must |
| RE-1.6 | Hard filters always override scoring signals. For example, "No Beef" means no beef is ever shown, even if beef is the top co-purchase. | Must |

### Stage 2: Understand cart intent

| ID | Requirement | Priority |
|---|---|---|
| RE-2.1 | Classify cart contents into main items and add-ons. | Must |
| RE-2.2 | Determine the meal occasion from the daypart. | Must |
| RE-2.3 | Capture dine-in or takeaway and the number of pax. | Must |
| RE-2.4 | Identify missing meal components (e.g. a main with no drink). | Should |
| RE-2.5 | For single-pax orders, suppress sharing-size items. For group orders, allow platters, sharing dishes and bundles. | Must |

### Stage 3: Generate candidates

| ID | Requirement | Priority |
|---|---|---|
| RE-3.1 | Generate "items purchased together" candidates for current cart items, computed per brand/outlet (see XB-3). | Must |
| RE-3.2 | Generate candidates from configured complementary pairing rules (MD-7). | Must |
| RE-3.3 | Generate set, bundle and upgrade opportunities. | Should |
| RE-3.4 | Generate outlet-level popular add-ons, which also serve as the fallback for new or anonymous customers (see G-8). | Must |

### Stage 4: Personalise ranking

| ID | Requirement | Priority |
|---|---|---|
| RE-4.1 | Boost candidates that match the customer's likes, favourites, and eating, protein and fibre preferences. | Must |
| RE-4.2 | Use frequently purchased items (last 6–8 orders) as a behavioural signal for preferred categories and habitual combinations. | Must |
| RE-4.3 | Frequent purchases must not override cart relevance. An item is not recommended just because it is a favourite if it doesn't complement the cart. | Must |
| RE-4.4 | Apply diversity so the same favourite isn't recommended every time, and introduce related or similar items. | Should |
| RE-4.5 | Demote items matching dislikes. Filter vs demotion is unresolved (see G-4). | Must |

### Stage 5: Commercial and contextual adjustments

| ID | Requirement | Priority |
|---|---|---|
| RE-5.1 | Apply promotion and voucher eligibility, plus savings from upgrading or bundling. | Should |
| RE-5.2 | Nudge toward minimum-spend thresholds. | Should |
| RE-5.3 | Weight by margin, merchant priority, and stock level. | Should |
| RE-5.4 | Boost new or limited-time items. | Could |
| RE-5.5 | Use weather as a contextual signal. | Could |

### Stage 6: Present the recommendation

| ID | Requirement | Priority |
|---|---|---|
| RE-6.1 | Show the top 1–3 recommendations. | Must |
| RE-6.2 | Show a short, templated reason (e.g. "Goes well with your Grilled Chicken Rice"), subject to CH-2 on kiosk. | Should |
| RE-6.3 | Don't repeat recommendations the customer has rejected. | Must |
| RE-6.4 | Record the outcome of each recommendation: accepted, ignored, or rejected. | Must |

## 5. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NF-1 | The recommendation response must not slow the cart flow. Target to be agreed (e.g. p95 under 300ms). |
| NF-2 | If the recommendation service fails or times out, ordering continues normally, with no recommendations or cached popular items. |
| NF-3 | 86/availability status is near-real-time, so a sold-out item is never upsold. |
| NF-4 | Customer profiles, especially allergy and religious data, are encrypted at rest, access-controlled, and audit-logged. |
| NF-5 | Every recommendation is traceable to the rules and signals that produced it, for debugging and complaint handling. |
| NF-6 | Metrics: recommendation acceptance rate, average order value uplift, and ideally A/B comparison against no recommendations. |

## 6. Approach Recommendation: Deterministic First

Almost everything described is deterministic: Stages 1–2 are rules, Stage 3 is market-basket analysis computable in SQL batch jobs, and Stages 4–5 are a weighted scoring function. The recommendation is:

- **v1:** rules- and score-based, with no LLM. This is predictable, testable, cheap, and has no hallucination risk.
- **Never** use an LLM for hard filters (allergens, dietary, availability).
- **Later phase:** AI may learn ranking weights from accept/reject data (RE-6.4).
- "Explain why" text comes from templates, not free LLM generation.

## 7. Cross-Brand Profiles (D-1)

| ID | Requirement | Priority |
|---|---|---|
| XB-1 | A single global customer identity (verified mobile number), with brand-level data linked underneath it. | Must |
| XB-2 | Dietary restrictions, allergies, dislikes and survey preferences are global: declared once and applied at every brand. | Must |
| XB-3 | "Items purchased together" is computed per brand (or per outlet), because menus differ across brands. | Must |
| XB-4 | Frequently purchased items stay brand-specific at the item level. At the category level (e.g. "likes cold coffee"), they can carry across brands as a weaker signal. | Should |
| XB-5 | All brands use a shared platform taxonomy for allergens, dietary attributes and key ingredients, so exclusions declared at one brand are enforceable at another. | Must |
| XB-6 | The survey is completed once across all brands. The voucher is claimable once per customer globally, with rules defining which brand(s) it can be redeemed at. | Must |
| XB-7 | Consent withdrawal and preference updates propagate to all brands immediately. | Must |
| XB-8 | Consent wording states that data is shared across brands, and names or describes those brands. | Must |

## 8. Channels: TQR and Kiosk (D-2)

| ID | Requirement | Priority |
|---|---|---|
| CH-1 | Recommendations work on both TQR and kiosk, with channel availability enforced via RE-1.2. | Must |
| CH-2 | On the kiosk, recommendation reasons must not reveal sensitive data (no "Because you're halal", "Avoiding peanuts for you", or "Your usual order"). | Must |
| CH-3 | Kiosk sessions auto-clear on order completion, on inactivity timeout, and on explicit sign-out. A loaded profile never carries over to the next person. | Must |
| CH-4 | Mobile number entry on the kiosk is masked after input, and identification uses OTP sent to the diner's phone. | Must |
| CH-5 | The full survey is offered on TQR only. The kiosk shows a QR code or link to complete it on the diner's phone. | Should |
| CH-6 | Pax count capture is supported on both channels (needed for RE-2.5). | Must |
| CH-7 | Recommendations load asynchronously on the kiosk and never block the ordering flow. | Must |

## 9. Profile Merge: Member and Non-Member (D-3)

| ID | Requirement | Priority |
|---|---|---|
| MG-1 | Profiles merge only when they share the same OTP-verified mobile number. | Must |
| MG-2 | Purchase history is merged as a union. | Must |
| MG-3 | Allergies and dietary restrictions merge using the most restrictive rule (union of all declared exclusions). | Must |
| MG-4 | For soft preferences (likes, flavours, interests), the most recently updated value wins. | Should |
| MG-5 | Consent merges conservatively: if either profile opted out, the merged profile is opted out until the customer re-consents. | Must |
| MG-6 | The survey voucher cannot be claimed twice through a merge. | Must |
| MG-7 | Every merge is audit-logged, with a manual unmerge procedure for wrong merges, including recycled mobile numbers. | Must |
| MG-8 | When a member changes their mobile number, the new number is re-verified and the profile is re-keyed. | Must |

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
