# Rawi status

Last updated: 13 September 2026.

## Confirmed constraints

- Real product with a small pilot, built by a solo developer with 20+ hours/week.
- Reachable users: UAE college students 17–24 across social sciences, business/economics, basic university subjects and sciences; UAE high-school students 13–19.
- English primary. Arabic is welcome later.
- No preferred stack. Hosting/deployment must cost zero; AI and development spend are acceptable.
- Existing Claude Pro, OpenAI Plus plus 1,500 credits, and Google subscription are development resources. Product API entitlement and AI spending ceiling are unverified.

## Recommended working decisions

- First private pilot: 10–20 UAE learners from the 18–24 college subset. Teen access remains on the roadmap.
- One shared course, selected by recruitment overlap, content permissions and reviewer availability.
- Original microeconomics content is a provisional demo fixture, not a final course commitment.
- React/TypeScript/Vite, lightweight Cloudflare Worker API, Supabase Free. Confirm live plan/runtime specifics during setup; no paid hosting default.
- Server owns learning state; reviewed checks measure independent and delayed performance.
- First local slice uses fixtures; real AI requires explicit configured credentials, usage accounting and a spending ceiling.

## Completed

- Research and planning documents covering competition, learning evidence, architecture, costs, UAE/minor considerations, product behavior and delivery workflow.
- No application code, hosted resources, purchases, user recruitment or deployment have been performed.

## Current work

R00: ready for founder discovery. R01: ready for first implementation session. R02–R10: waiting on their listed dependencies. Optional R07 may be deferred.

## Decisions to resolve

1. Which course is shared by at least five adults for prototype selection, with a competent reviewer and source permissions, and can recruitment reach at least eight shared-unit learners within the 10–20-person full pilot?
2. What is the product's monthly AI spending ceiling, and which existing credits, if any, cover API usage?
3. Before real learner data: operator/data-controller context, applicable UAE processing and transfer arrangements, eligible auth method and privacy notices.

These decisions do not block the local fixture demo. No production data or charges should be invented to fill gaps.

## Implementation handoff log

Append actual changes here after each completed ticket: ticket ID, change/commit reference, verification commands/results, unresolved issues, and next ticket. This log currently has no implementation entries.
