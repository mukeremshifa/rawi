# Rawi product specification

Status: recommended starting specification incorporating founder constraints. Research reviewed on 13 September 2026. This file defines the proposed product; it does not claim that the software exists.

## Product promise

Rawi helps a learner move from being stuck to solving a related problem independently, then checks whether that understanding lasts.

The first release is a responsive web application for an invitation-only cohort of UAE college learners aged 18–24 studying one shared introductory course. The founder can reach college learners aged 17–24 across social sciences, business/economics, general university courses, mathematics, physics, biology, and chemistry, plus high-school learners aged 13–19. Starting with the adult subset is a recommended rollout choice. English is primary; Arabic is a later addition.

Introductory microeconomics is the provisional demonstration subject: opportunity cost, supply/demand shifts, and simple elasticity. Choose the real pilot course by overlap among recruits, available source permissions, and access to a competent content reviewer. If introductory statistics or a different course has stronger overlap, use that instead. The application should support course-specific concepts without hardcoding an economics-only product.

The founder develops solo, can commit 20+ hours a week, and requires zero deployment/hosting charges while accepting AI and development costs. Use free deployment tiers and a provider subdomain for the pilot, with explicit limits. Do not introduce paid hosting as an unannounced prerequisite.

The eventual ambition includes teen learners and additional subjects. The initial release should establish a reliable learning loop, a maintainable system, and observable learning outcomes that make expansion worthwhile.

## Learner and job

A first-year student can follow an explanation but struggles to apply it to a fresh question. Before an assessment or practice session, the student wants to identify a gap, work through it with appropriate support, and know what to practice next. The immediate alternative is their existing combination of course notes, general AI, videos, and a friend or tutor.

The testable positioning is: **“Understand the concept. Solve the next problem yourself.”** Course alignment, helpful feedback, and a useful history of independent attempts must make this promise concrete. They are hypotheses to validate, not established competitive advantages.

## The smallest complete experience

1. **Start:** choose a supported unit and a concrete learning objective. An example lesson works without an upload.
2. **Diagnose:** attempt one short problem and optionally explain the answer. “I don't know yet” is a valid response. Avoid a long placement test.
3. **Learn:** explain the missing concept briefly, show a relevant source excerpt, and offer a worked example when helpful.
4. **Practice:** ask the learner to attempt a step. Give a targeted hint, then stronger support as needed. The learner can request an explanation instead of being trapped in repeated questions.
5. **Check:** present a fresh, reviewed problem without hints. An answer reveal or switch to tutoring records the attempt as assisted and offers a different check later.
6. **Review:** show evidence of progress and a next review date. Offer a delayed check in the app on return.

Example: a learner confuses an increase in demand with movement along the demand curve. Rawi asks what changed, gives a small reviewed example, and shows the relevant course excerpt. It then checks understanding with a different market scenario. A correct answer after hints is recorded as practice success; a correct fresh answer without help is independent evidence. For a calculation, record units, assumptions, and the accepted tolerance.

## Modes and state rules

| Mode | Assistance | What is recorded |
|---|---|---|
| Learn | Explanations and worked examples available immediately | Exposure and learner feedback |
| Practice | Hints, examples, corrections, reveal available | Attempt, hint count, reveal state, concept tags |
| Check | No hints before submission; learner can leave or switch mode | Independent result only if no assistance was used |
| Review | Fresh check followed by optional tutoring | Delayed evidence, next due date |

Application code owns these rules. Model text cannot change scores, access rights, due dates, or the assistance flag. An attempt becomes assisted monotonically: it cannot be reset by a refresh or a different chat tab. A revealed item cannot later be counted as an unseen check.

Use descriptive progress states: **not checked**, **practicing**, **independent once**, **retained on review**. Do not turn a model's confidence into a precise mastery percentage. If a misconception tag is inferred, present it as a possibility and let the learner correct it. Keep the original evidence separately from the inference.

## Scope by release

| Release | Included | Deferred |
|---|---|---|
| First local slice | One reviewed lesson; deterministic tutor fixture; complete learn/practice/check flow; keyboard and mobile use | Accounts, uploads, payments, external services |
| Adult private pilot | Managed login, saved progress, real bounded AI tutoring, source-linked curriculum, review queue, reporting, export/delete, cost limits, support view | Public signup, teen accounts, native apps, voice, social features |
| Pilot extension | Limited text PDFs and pasted notes, only when recruitment demonstrates demand; reliable ingestion and retrieval | Scans, handwriting, unrestricted web browsing, audio/video imports |
| Public beta | Validated workflow, operational checks, chosen launch market, transparent plans and enforced entitlements if charging | Institutional grading, proctoring, under-13 support |

Uploads are not required to prove the first tutoring loop. A course can begin with a rights-cleared, reviewed source pack. If uploads are offered, unsupported or poorly parsed files must fail clearly; the app must not silently teach from damaged extraction.

## Content quality

Start with a small original or permissibly licensed curriculum. For each concept, provide a reviewed explanation, worked example, common mistakes, practice items, and distinct immediate and delayed check items. Record authorship, license or permission, reviewer, source version, and answer rubric.

Reviewed checks and their answers stay server-side until submission in the pilot. The local fixture demo is explicitly non-secure demonstration data. The tutoring context must not contain the answer to the active independent check. Runtime generation may personalize explanations or practice after evaluation; it must not silently replace the reviewed check bank.

An instructor or subject-competent reviewer must check both content and the criteria used to grade it. Unit tests are useful for fixed numeric answers. Free-text explanations can be assessed against a rubric, but uncertain or disputed grading should not change independent progress automatically. A fresh equivalent item can resolve an ambiguous result. Do not assume lecture notes or openly readable textbooks permit AI ingestion; record the applicable permission or license.

## Interface

The principal screen is a learning workspace with a problem, an editable answer area, and contextual tutoring. Sources open beside the explanation on wide screens and in a readable panel on mobile. A simple home screen offers “Continue” and “Review due”; the course screen shows concepts and their evidence states.

Use calm typography, readable equations and charts, explicit loading and retry states, and a visible end to each session. Avoid an endless feed, public rankings, punitive streaks, or a companion persona that encourages dependence. Aim for WCAG 2.2 AA; include keyboard-only completion, focus management, screen-reader labels, accessible diagram alternatives, and reduced motion. These are implementation targets, not a certification claim. Keep text in message files and use CSS logical properties so later Arabic/RTL work is feasible; translation quality needs its own review.

## Pilot measurement

All numerical targets below are provisional product gates, not research benchmarks or forecasts. Report counts alongside percentages.

| Question | Measurement | Initial decision rule |
|---|---|---|
| Can people get value? | Invited learners who finish one full loop without founder intervention | At least 7 of the first 10; investigate each failure |
| Do they return? | Activated learners who complete a meaningful learning/review event on a second day within 7 days | At least half as an early signal; examine course/exam timing |
| Does help transfer? | Correct fresh unaided checks before/after practice, and delayed checks 7 days later | Inspect each learner and concept; require credible positive signal before widening scope |
| Do they prefer it? | Observed comparison with their existing tool and their explanation of the tradeoff | At least 5 learners voluntarily choose another Rawi session |
| Can it run affordably? | Total AI and job cost per completed loop, including failed calls and retries | Start with a $0.20 p95 investigation threshold; actual model tests may change this |

A 10–20-person pilot establishes usability and preliminary learning signals. It cannot establish general educational efficacy. Do not publish causal improvement claims from an uncontrolled before/after comparison.

## Open decisions

The exact shared course, reviewer, AI monthly spending cap, and whether the founder's existing credits apply to product API usage remain unknown. UAE, English-first, 20+ hours/week, free hosting, and a real small pilot are confirmed. The defaults above support local progress. Handling real learner data requires the UAE data-handling plan in [SAFETY.md](SAFETY.md). Public enrollment, teen expansion, and charging are later milestones.

Supporting evidence: [research report](../research/REPORT.md), [learning evidence](../research/learning.md), [competitive landscape](../research/market.md).
