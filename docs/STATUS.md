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
- R01: local React/TypeScript/Vite application and Hono Worker API skeleton, with one
  original microeconomics demo lesson running the full diagnose → learn → practice →
  check → summary loop against locally verified fixtures. Git repository initialized.
- No hosted resources, purchases, user recruitment or deployment have been performed.
  Nothing has been shown to a learner.

## Current work

R00: ready for founder discovery; no completed interviews or selected course recorded.
R01: local implementation delivered (see handoff log), with browser acceptance still
outstanding. R02: partly implemented; next is **R02A — reliable learning state**,
then R02B help/recovery and browser verification. R03–R10 wait on their listed
dependencies. Optional R07 may be deferred. See [NEXT_STEPS.md](NEXT_STEPS.md) for
the GitHub snapshot, verified gaps and ready-to-use next session brief.

## Decisions to resolve

1. Which course is shared by at least five adults for prototype selection, with a competent reviewer and source permissions, and can recruitment reach at least eight shared-unit learners within the 10–20-person full pilot?
2. What is the product's monthly AI spending ceiling, and which existing credits, if any, cover API usage?
3. Before real learner data: operator/data-controller context, applicable UAE processing and transfer arrangements, eligible auth method and privacy notices.

These decisions do not block the local fixture demo. No production data or charges should be invented to fill gaps.

## Implementation handoff log

Append actual changes here after each completed ticket: ticket ID, change/commit reference, verification commands/results, unresolved issues, and next ticket.

### R01 — local app and Worker API skeleton (13 September 2026)

**What changed.** Git repository initialized; the existing documents were preserved in
the first commit before any code was added. Added a single TypeScript codebase:

| Area | Files |
|---|---|
| Shared contract | `src/shared/types.ts` |
| Lesson content (replaceable) | `src/content/demo-lesson.ts` |
| Learning rules | `src/server/learning.ts` |
| Storage and view projection | `src/server/lesson-store.ts` |
| HTTP routes | `src/server/index.ts` |
| Browser | `src/client/` (`App.tsx`, `EvidencePanel.tsx`, `api.ts`, `messages.ts`, `styles.css`) |

Learning state is server-owned. The browser holds no rules and never decides
correctness, assistance or evidence; each transition is a request and the response
replaces the view.

**Commands.** All run from the repository root on Node 24.19.0 / npm 12.0.2.

| Command | Purpose | Result |
|---|---|---|
| `npm install` | Install dependencies | Completed. `esbuild` and `workerd` install scripts must be approved (`npm install-scripts approve esbuild`, `… approve workerd`) or Vite and Wrangler have no binaries. |
| `npm run typecheck` | `tsc --noEmit` | Passed, no errors |
| `npm run lint` | ESLint | Passed, no errors |
| `npm test` | Vitest | **32 tests passed** (2 files) |
| `npm run build` | Typecheck + Vite build | Passed; `dist/client`, 153.59 kB JS (49.53 kB gzip) |
| `npm run dev` | Vite dev server (browser) | Proxies `/api` to port 8787 |
| `npm run dev:api` | `wrangler dev` (API) | Ready on `http://127.0.0.1:8787` |

**Verified behavior.** Beyond the unit tests, the full journey was driven against the
actual Workers runtime (`wrangler dev`, Miniflare) — 24 runtime assertions, all passing:

- An unaided correct check records `countsAsIndependent: true`, sets evidence to
  `independent-once`, and schedules a review date.
- Revealing the answer and then answering correctly records the attempt as **assisted**;
  evidence stays `practicing` and no review is scheduled.
- A revealed answer survives a page refresh (a fresh `GET` re-projects server state).
- A double-submitted answer records exactly one attempt.
- A hinted correct answer is not independent evidence.
- Rejected as bad requests: an unauthored option ID (400), a missing option ID (400),
  an unknown stage (400), an unknown session (404), a hint at a stage with no question (400).

**Answer confidentiality, checked against the build artifact rather than asserted.**
`grep` over `dist/client/assets/*.js` finds zero occurrences of `correctOptionId`, of
the check's answer explanation, and of the practice hints, while app text is present.
Unrequested hints are likewise absent from API payloads.

**Worker CPU.** No CPU-limit warnings during the runtime probe; request wall times were
11–13 ms locally. This is not a measurement of the Free-plan 10 ms CPU budget — local
wall time and production CPU time are different quantities. R04 must profile properly.

**Limitations, stated plainly.**

1. **Sessions are in-memory and per-isolate.** A Worker restart drops them. `lesson-store.ts`
   is the only file that must change when R03 moves storage to Supabase.
2. **No authentication.** Session IDs are unguessable but are *not* an authorization
   boundary. This API must not be deployed publicly as-is.
3. **No AI.** `RAWI_TUTOR_MODE` is `fixture`; no provider key is read anywhere in the
   codebase, and no paid service is contacted.
4. **Lesson content is provisional** original microeconomics, pending R00 course
   selection. `reviewedBy` on each question records that subject-reviewer sign-off is
   still outstanding — the content has *not* been reviewed by a competent reviewer.
5. **Accessibility and mobile are partially verified.** Confirmed by inspection: all
   interactive controls are real `<button>`/`<input>` elements (keyboard-reachable),
   inputs are label-associated, focus moves to the stage heading on each transition,
   focus rings are visible, touch targets are ≥ 2.75 rem, the layout is single-column
   until 52 rem, and styles use CSS logical properties with a reduced-motion rule.
   **Not yet done:** no browser-driven keyboard walkthrough, no screen-reader pass, and
   no test on a real device or UAE network. DELIVERY.md places the end-to-end suite
   later; these remain open for the readiness gates.

**Next ticket.** R02 — complete and strengthen the existing learning model and
assistance tracking. The functions and sequential tests already exist in
`src/server/learning.ts` and `learning.test.ts`. The status review below identifies
remaining concurrency, transition, evidence and recovery work. Multiple-concept
expansion is not required to close R02 and should follow R00 course selection.

### GitHub status review — 13 September 2026

GitHub `main` and the initially clean local checkout both matched
[`5a79f26`](https://github.com/mukeremshifa/rawi/commit/5a79f26bec7a3bdce8ab68d797fb48548671deda).
The repository has two commits, one branch, no PRs/open issues, no Actions workflows
or runs, and no commit checks. There are no releases or GitHub deployment records;
external hosting was not inspected.

Fresh local verification: `npm test` passed all 32 tests, `npm run lint` passed,
and `npm run build` passed typechecking and Vite production build. The prior 24
Workers-runtime assertions and browser/device claims were not rerun in this review.

Targeted in-memory API/function probes reproduced two gaps beyond the sequential
test coverage: a delayed submission can overwrite an overlapping answer reveal
and receive independent credit; the same recorded check's due date advances by
one day when read one day later. A direct diagnostic-to-check stage mutation was
also accepted without a declared transition policy. Code inspection found incorrect
assistance labels and the missing check-to-help recovery flow.

The earlier R01 assistance guarantee is therefore verified for sequential paths,
not conflicting requests. [NEXT_STEPS.md](NEXT_STEPS.md) separates reproduced
behavior from inspection findings and defines R02A/R02B. This review changed only
planning/status documentation; no application fixes or GitHub changes were made.
