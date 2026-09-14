# Rawi delivery plan

This is the implementation source of truth. Research informs decisions; this file defines work order. R01's local implementation is delivered, with browser acceptance still outstanding; R03 persistence and sign-in are implemented locally, with hosted provider acceptance open. R04 plus the minimum real return-review action is next. See STATUS.md and NEXT_STEPS.md for verified progress. One outcome per task, with small changes that can be demonstrated and reviewed.

## Current execution priority — 14 September 2026

The founder prioritizes getting to v1 quickly. Execute the three slices in
[NEXT_STEPS.md](NEXT_STEPS.md): persistent app (R03 plus small R02 fixes), bounded
AI with minimum sources/return-review (R04 and minimum R05/R06), then deployment
readiness (minimum R08/R09). The detailed backlog below remains scope context;
its broad testing requirements are scheduled for deployment readiness and do not
block each intermediate local feature slice. Run existing fast tests/build and
focused ownership/evidence/budget checks as relevant. No coverage expansion or
separate CI milestone is required before proceeding to R03.

R03 now addresses the reproduced cross-owner cached mutation, rejected durable
writes, learner-wide item exposure, common evidence projection and browser sign-in
states. Focused local regressions pass; actual Google OAuth, remote two-user/RLS
acceptance and Free-plan verification stay in deployment readiness. Continue with
R04 and a real delayed-review action using the prompt in NEXT_STEPS.md.

## Calendar and effort

Use a planning envelope of 8–12 weeks at 20+ founder hours/week for a credible private pilot and one iteration. This is an estimate with substantial uncertainty, not a delivery guarantee. Content review, access to learners, and seven-day follow-up cannot be accelerated simply by increasing agent count. Reforecast after the first complete local learning loop.

| Period      | Outcome                                                                        | Founder focus                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Week 1      | Recruit and select a shared course; first local fixture lesson                 | 8–12 discovery conversations, inspect real study materials, find reviewer                                                                                     |
| Weeks 2–3   | Working learning loop with test accounts and server-owned evidence             | Observe five adults in founder-operated demos using synthetic data; no learner accounts or retained learning records yet; review architecture and state rules |
| Weeks 4–5   | Real AI, curated sources, measured quality/cost, review queue                  | Review tutor failures and compare to existing tools                                                                                                           |
| Weeks 6–7   | Recovery, deletion, quotas, operational checks; limited uploads only if needed | Test from UAE networks, verify data plan, recruit 10–20 adult pilot learners                                                                                  |
| Weeks 8–9   | Pilot plus delayed checks                                                      | Observe learning, collect product issues, keep cohort small                                                                                                   |
| Weeks 10–12 | Improve the highest-impact failure; decide expansion                           | Evaluate return behavior, learning signal, cost and support burden                                                                                            |

Aim for 12 hours/week building and reviewing, 4 hours with learners/content, 2 hours on evaluation, and 2 hours on operations/documentation. Adjust from evidence. Agent-generated implementation still needs founder understanding.

## Backlog

Statuses: `ready`, `waiting on dependency`, `in progress`, `in review`, `done`. Each done ticket links to its change and validation evidence in [STATUS.md](STATUS.md).

| ID   | Outcome and scope                                                                                                                     | Depends on                                              | Acceptance evidence                                                                                                                                                                                                                                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R00  | Choose one shared UAE course; identify adult recruits and content reviewer                                                            | Founder interviews; can run beside R01                  | Course decision, learner problems, source permissions, reviewer and baseline task recorded                                                                                                                                                                                                                                                                            |
| R01  | Local React/TypeScript/Vite app and lightweight Worker API skeleton; one original demo lesson                                         | Local implementation delivered; browser acceptance open | Setup, unit/API tests and build verified; complete mobile/keyboard browser walkthrough before deployment                                                                                                                                                                                                                                                                    |
| R02A | Atomic session updates, declared stage transitions, immutable recorded evidence                                                       | R01 implementation; **merged PR #1**                    | 40 tests, lint and build pass; separate clock-controlled later-read probe verified in STATUS.md; navigation retry follow-up assigned to R02B                                                                                                                                                                                                                          |
| R02B | Correct assistance labels, explicit check-to-help conversion, fresh replacement and exhaustion, reliable recovery, browser acceptance | R02A; **implemented; follow-ups in R03** | Recorded conversion without invented grading; active-item validation; delayed retries cannot rewind; truthful reload failure; browser refresh/retry/keyboard/narrow-screen journey; full checklist in NEXT_STEPS.md. 55 tests + lint + build pass; 8/8 fetch acceptance paths pass; answer-key absence confirmed. Open: keyboard-only, screen-reader, narrow-screen, UAE-network not verified. |
| R03  | Supabase schema, auth, enrollment, private progress; repository migrations                                                            | R02A and R02B                                           | Two ordinary non-team test identities complete Google OAuth or another verified no-paid-email flow; access isolation through API and direct permitted DB access; durable learner-wide item exposure; transactional writes through an asynchronous store boundary; body-size limits before parsing; server-only check answers; Free plans verified; no exposed secrets |
| R04  | One model adapter, validated tutor response, atomic budget reservation, usage ledger                                                  | R02A and R02B; R03 before hosted usage                  | Reviewed eval cases, cost/latency report, synthetic-data restricted Free-runtime smoke/profile including auth, validation and streaming within Worker CPU limits; malformed/refusal/timeout handling; paid requests disabled without configured budget/key                                                                                                            |
| R05  | Reviewed course pack and source navigation; scoped retrieval with a lexical baseline                                                  | R00, R03, R04                                           | Each explanation resolves to authorized source/version; missing evidence path; held-out retrieval checks                                                                                                                                                                                                                                                              |
| R06  | Deterministic review queue and evidence-based progress                                                                                | R03, R05                                                | Repeated submissions don't duplicate reviews; assisted work doesn't promote independent status; timezone-boundary tests                                                                                                                                                                                                                                               |
| R07  | Small text/PDF ingestion only if discovery requires it                                                                                | R03, R05; optional for pilot                            | Extraction quality screen, private source access, deduplicated bounded jobs, deletion race and retry verification                                                                                                                                                                                                                                                     |
| R08  | Product reporting, export/delete, redacted support view, controlled free deployment                                                   | R03–R06                                                 | Data plan, supported auth onboarding, quota behavior, restricted admin routes, export/delete tested                                                                                                                                                                                                                                                                   |
| R09  | Pilot readiness: outages, quotas, restore, rollback, accessibility and representative load                                            | R08; R07 if enabled                                     | Written evidence for each gate below; known limitations shown to pilot owner                                                                                                                                                                                                                                                                                          |
| R10  | 10–20-person UAE adult pilot and prioritized findings                                                                                 | R00, R09                                                | Activation/return counts, immediate and delayed checks, costs, failure samples, next decision                                                                                                                                                                                                                                                                         |

R01 can use a small original microeconomics fixture while R00 chooses the actual course. This does not authorize building a large economics curriculum. R04 and content preparation for R05 can run in parallel once contracts are stable; hosted tutor integration requires R03. R07 may be deferred without blocking a pilot using a curated source pack.

Use the same recruitment funnel across documents: 8–12 discovery conversations; at least five adults sharing a course/aligned unit plus a reviewer and source permissions to choose the prototype; then at least eight shared-unit learners within the 10–20-person full pilot. Early interviews follow the minimal consent/notes protocol in DISCOVERY.md. Real learner accounts, uploads and retained learning records begin only after the relevant data requirements are satisfied. R03/R04 runtime profiling uses synthetic data and controlled test identities; any deployment still follows the session's actual authorization.

## Pilot readiness gates

**Learning:** every published check has a reviewed answer/rubric; learning/practice/check states behave correctly; no unresolved critical correctness or fabricated-source failure in the release set; reviewer inspects full sessions. Report the reviewed sample size.

**Application:** access isolation, idempotency, retry recovery, usage reservations, deletion and restore work; the critical path survives a disconnect. An unavailable model leaves reviewed material readable where the hosting platform is still available. No claim of availability when the free platform itself is exhausted.

**Operations:** zero hosting charges verified in the selected account/plan configuration; no paid-tier upgrade or metered hosting add-on; free-tier limits monitored; a documented stop-enrollment policy; local backups encrypted and restore rehearsed; support hours and ownership written down.

**Experience:** run on UAE mobile and home connections, including a slower connection; complete a lesson with keyboard only; check small screen layout and readable equations. Proposed performance targets are visible acknowledgement within 1 second and a useful tutor response within 10 seconds at p95 on the measured pilot setup. Measure actual end-to-end behavior and revise routing or interaction when targets fail.

**Data:** record UAE processing/transfer decisions, sources' permission basis, retention, export/delete behavior, and the adult cohort eligibility process. Test reports and incident handling. Public expansion is a separate decision.

## Validation commands

R01 must define actual commands for install, dev, lint, typecheck, unit tests, build and the critical browser journey. R04 adds an explicit paid AI evaluation command with a documented cost ceiling. Do not list commands as passing before they exist or have been run.

Use unit tests for learning rules; integration tests for authorization, persistence and budgets; a small end-to-end suite for the full lesson and recovery; reviewed AI evaluations for model behavior. Run live AI tests when prompts, retrieval, models, grading or curriculum change, not after unrelated styling changes. CI runs offline fixtures by default.

## After the pilot

Expand a second unit in the same course before expanding several subjects. Add personal uploads only when useful and dependable. Test Arabic terminology/explanations with bilingual reviewers before full RTL rollout. Add teens only after age-specific legal, safety, product, and support requirements are addressed. Monetization follows demonstrated repeat value and measured cost; price experiments are not authorization to add checkout or charge users now.
