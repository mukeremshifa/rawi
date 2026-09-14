# Rawi status

Last updated: 14 September 2026.

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
- R02A: reliable learning state, merged in PR #1. Within the fixture's single isolate,
  session mutations are atomic, stage transitions are
  declared and enforced, recorded attempts and their review dates are immutable, and
  overlapping requests can no longer overwrite recorded assistance.
- R03 added Supabase integration; its activation handoff records project setup and
  migration. Ownership-scoped confirmed saves and the browser sign-in interface are
  now implemented and covered by focused local synthetic regressions.
  No learner-facing deployment, paid AI use or learner observation is recorded.

## Current work

R00: ready for founder discovery; no completed interviews or selected course recorded.
R01: local implementation delivered (see handoff log), with browser acceptance still
outstanding. R02A: merged and independently reviewed (see handoff log). R02B:
delivered 14 September 2026 — follow-ups folded into R03. **R03: locally implemented** — project linking and migration are recorded; authoritative
owner-scoped saves, learner-wide exposure and browser OAuth/enrollment states are in
code. Hosted OAuth, remote two-user/RLS acceptance and Free-plan confirmation remain.
Next is **R04 — bounded AI tutor plus the minimum real return-review action**.
R04–R10 wait on their listed dependencies. See [NEXT_STEPS.md](NEXT_STEPS.md) for
the updated snapshot.

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

| Area                         | Files                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| Shared contract              | `src/shared/types.ts`                                                                 |
| Lesson content (replaceable) | `src/content/demo-lesson.ts`                                                          |
| Learning rules               | `src/server/learning.ts`                                                              |
| Storage and view projection  | `src/server/lesson-store.ts`                                                          |
| HTTP routes                  | `src/server/index.ts`                                                                 |
| Browser                      | `src/client/` (`App.tsx`, `EvidencePanel.tsx`, `api.ts`, `messages.ts`, `styles.css`) |

Learning state is server-owned. The browser holds no rules and never decides
correctness, assistance or evidence; each transition is a request and the response
replaces the view.

**Commands.** All run from the repository root on Node 24.19.0 / npm 12.0.2.

| Command             | Purpose                   | Result                                                                                                                                                                  |
| ------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm install`       | Install dependencies      | Completed. `esbuild` and `workerd` install scripts must be approved (`npm install-scripts approve esbuild`, `… approve workerd`) or Vite and Wrangler have no binaries. |
| `npm run typecheck` | `tsc --noEmit`            | Passed, no errors                                                                                                                                                       |
| `npm run lint`      | ESLint                    | Passed, no errors                                                                                                                                                       |
| `npm test`          | Vitest                    | **32 tests passed** (2 files)                                                                                                                                           |
| `npm run build`     | Typecheck + Vite build    | Passed; `dist/client`, 153.59 kB JS (49.53 kB gzip)                                                                                                                     |
| `npm run dev`       | Vite dev server (browser) | Proxies `/api` to port 8787                                                                                                                                             |
| `npm run dev:api`   | `wrangler dev` (API)      | Ready on `http://127.0.0.1:8787`                                                                                                                                        |

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

1. **Sessions are in-memory and per-isolate.** A Worker restart drops them. R03
   replaces this storage with durable transactions and an asynchronous boundary;
   route signatures and callers may also need adaptation.
2. **No authentication.** Session IDs are unguessable but are _not_ an authorization
   boundary. This API must not be deployed publicly as-is.
3. **No AI.** `RAWI_TUTOR_MODE` is `fixture`; no provider key is read anywhere in the
   codebase, and no paid service is contacted.
4. **Lesson content is provisional** original microeconomics, pending R00 course
   selection. `reviewedBy` on each question records that subject-reviewer sign-off is
   still outstanding — the content has _not_ been reviewed by a competent reviewer.
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
not conflicting requests. The [original review draft](https://github.com/mukeremshifa/rawi/blob/87e59b7/docs/NEXT_STEPS.md) separates reproduced
behavior from inspection findings and defines R02A/R02B. This review changed only
planning/status documentation; no application fixes or GitHub changes were made.

### R02A — reliable learning state (13 September 2026)

**Delivered.** The three defects reproduced in [NEXT_STEPS.md](NEXT_STEPS.md) gaps 1
and 2 are fixed, with regression tests that fail against the previous code.

**Atomic session updates.** `updateSession()` in `src/server/lesson-store.ts` is now
the only supported way to change a session. It reads, applies a _synchronous_
command and writes, with no `await` in between. Every mutating handler in
`src/server/index.ts` was reordered to finish reading and validating its request body
_before_ it touches session state. This is the actual fix for the overlap defect: R01
read the session first and awaited the body afterwards, so a reveal landing in that
window was overwritten by an attempt that had already decided it was unassisted.
`SessionState.version` is bumped on every committed write and checked before commit;
in the R01 memory map that check cannot currently fail, but it is the contract R03
carries into a transactional `UPDATE ... WHERE version = $n`.

**Explicit transitions and active-item validation.** `ALLOWED_TRANSITIONS` in
`src/server/learning.ts` declares the legal stage moves. A diagnostic-to-check jump is
now refused with 409 instead of the 200 R01 returned. Commands additionally require
that the stage they name is the stage the session is actually on, so a request built
against a screen the learner has left cannot act on the question now in front of them.
Re-navigating to the current stage stays a 200 no-op, so a retried navigation is not
an error. Testing out remains a possible product choice; it would be an explicit
command, not an unguarded client-supplied stage.

**Immutable evidence.** A replayed submission now reports the recorded attempt
exactly, instead of combining the old correctness with the question's current
assistance — a combination that described no real event. `RecordedAttempt.reviewDue`
is anchored at the moment of the qualifying attempt, and `toSessionView()` no longer
takes a clock at all, so the same evidence projects to the same date on any later day.

**Client.** A 409 now shows a plain recovery message and re-reads authoritative state
rather than surfacing a raw error code. Correct/assisted label separation and the
check-to-help conversion flow remain R02B.

**Verification, run on this checkout.**

| Check              | Result                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`     | Passed                                                                                                                                         |
| `npm test`         | 40 passed (21 learning, 19 API); was 32                                                                                                        |
| `npm run build`    | Typecheck and Vite build passed                                                                                                                |
| Answer-key leakage | `correctOptionId` absent from client source and built bundle                                                                                   |
| Sabotage check     | Restoring R01's read-before-await ordering fails the overlap test with the reported defect (`countsAsIndependent` true where it must be false) |

The eight new tests construct overlapping requests deterministically rather than by
timing luck: a request is given a body stream that resolves only when the test
releases it, which places a second request exactly in the window where the handler is
suspended. The 32 existing tests were kept, with every assertion preserved; the only
changes were signature updates and test setup that now walks the legal stage path
instead of jumping.

**Not done here.** Browser, screen-reader, keyboard, narrow-screen and UAE-network
verification remain outstanding, as does the Workers-runtime probe. No deployment,
authentication, durable storage or AI call was added, and no hosting spend occurred.

**Next ticket.** R02B — help and recovery: separate correctness from assistance in the
interface, the explicit check-to-help conversion with a distinct replacement check,
and the browser walkthrough that closes R01 acceptance.

### R02A merged review and R02B handoff — 13 September 2026

**GitHub.** [PR #1](https://github.com/mukeremshifa/rawi/pull/1) merged at
18:57:59 UTC as `c7e7222a25a4c70e5dd49c7d28e511b306a282d3`. After
`git fetch origin`, merged main and local `734a9b7` have identical file trees
(`294193ab3b6de0d3568b25bb05c17146af985bac`). The local branch is still
`r02a-reliable-learning-state`; GitHub lists only unprotected `main`.
There are zero workflows, runs, check runs, commit statuses and open issues.
No releases or GitHub deployment records were returned; external hosting was
not inspected. A combined status of pending with zero statuses is not evidence
of a running pipeline.

**Fresh verification.** On Node 24.19.0 / npm 12.0.2, `npm test` passed all
40 tests (21 learning, 19 API), `npm run lint` passed, and `npm run build`
passed typechecking and Vite build. A separate in-memory API probe set the
submission clock to September 13 at 23:59 UTC, then read on September 14 and
September 21: all three views retained September 20 as the due date. The
committed reread test does not advance the clock; R02B should make this probe
a permanent regression case. Browser and Workers-runtime checks were not rerun.

**Review conclusion.** The original assistance-loss, invalid-jump and unstable
evidence defects are addressed within the documented single-isolate fixture
scope. No new evidence-corruption blocker was found. Two remaining recovery
issues are included in R02B:

- A controlled delayed-navigation probe held an original request to learn,
  retried successfully, advanced to practice and then released the original.
  The original returned 200 and moved the session back to learn. Evidence was
  preserved, but stage legality alone does not identify stale commands.
- Conflict handling claims the latest state is displayed before a reload
  succeeds, and suppresses reload failures. Distinguish confirmed refresh,
  unavailable refresh and missing-session recovery.

**Scope correction for R03.** The synchronous memory update is useful for this
fixture; its version field does not by itself implement a database transaction.
R03 must adapt storage and callers for asynchronous, ownership-scoped atomic
writes and preserve exposure across sessions. Bound request bodies before JSON
parsing before exposing the API.

**Handoff.** NEXT_STEPS.md now contains the R02B behavior, acceptance checklist,
implementation prompt and a separate CI brief. README, DELIVERY and the playbook
point to the same next step. This review changed documentation only; no GitHub
write, deployment, paid AI call or hosted resource change was performed.

### R02B — help and recovery (14 September 2026)

**What changed.** All five R02A recovery follow-ups addressed. New files and
modifications:

| Area | Files changed |
| ---- | ------------- |
| Shared contract | `src/shared/types.ts` — `ItemRef`, `activeCheckId`, `checkConverted`, `checkBankExhausted` in `SessionView` |
| Lesson content | `src/content/demo-lesson.ts` — `checkBank` interface and 3 original replacement items |
| Learning rules | `src/server/learning.ts` — `convertCheck`, `isCheckBankExhausted`, item-identity fields in `SessionState`, `check→practice` transition, multi-item `evidenceState`/`nextReviewDue` |
| Storage/projection | `src/server/lesson-store.ts` — `questionForStage` uses `activeCheckId`, view exposes check state flags |
| HTTP routes | `src/server/index.ts` — `POST /convert` route, item-identity guard in `activeQuestion` |
| Browser | `src/client/` — Get help button, honest reload errors, item-change focus reset, 3-badge evidence, new messages, new CSS classes |
| Tests | `src/server/r02b.test.ts` (15 new), `learning.test.ts` updated for array signatures |
| Acceptance | `src/acceptance/harness.ts` — 8 fetch-based paths; `npm run acceptance` added |

**Verification, run on this checkout (Node 24.19.0 / npm 12.0.2).**

| Check | Result |
| ----- | ------ |
| `npm test` | **55 passed** (21 learning, 19 API, 15 R02B); was 40 |
| `npm run lint` | Passed |
| `npm run build` | Typecheck and Vite build passed; 156.90 kB JS (50.35 kB gzip) |
| `npm run acceptance` | 8/8 fetch-based paths passed |
| Answer-key leakage | `correctOptionId` and `answerExplanation` field name absent from `dist/client/assets/*.js`; confirmed with `Select-String` on built bundle |

**How attempted items, assisted items and fresh checks are kept distinct.**

The server holds `activeCheckId` and `exposedCheckIds` in `SessionState`. Creating
a session always starts with `activeCheckId = lesson.check.id`. When the learner
converts, `convertCheck()` marks the item `assistance: 'revealed'` (permanently
retiring it from independent credit) and selects the next unexposed bank item as
`activeCheckId`. Commands that target the check stage carry an `itemId`; the
`activeQuestion()` guard rejects the request with `item_replaced` (409) if
`itemId !== state.activeCheckId`. This prevents a delayed request built against
the old item from acting on its replacement, even though both are at stage "check".
A converted item's `assistance: 'revealed'` means any belated submission on it will
never be graded as independent. Exhaustion is an honest terminal state: once all
bank items are exposed and the active one is already converted, further convert
requests return `check_bank_exhausted` (409) rather than silently recycling a used item.

**Not done here.** Keyboard-only walkthrough, screen-reader pass, narrow-screen and
UAE-network verification remain open. Workers-runtime probe was not rerun. No
deployment, authentication, durable storage or AI call was added.

**Next ticket.** R03 — identity and durable data: Supabase schema, Google OAuth
(or verified no-paid-email flow), per-learner ownership, transactional writes,
body-size limits, durable exposure tracking.

### Fast v1 review — 14 September 2026

GitHub and clean local main both matched `55149934403a6a3317058d1c86b5717220c014cf`
after fetch. R02B is committed on main; no Actions runs were returned.
Fresh `npm test`: 55 passed. Fresh `npm run build`: typecheck and Vite passed.
Lint, the acceptance harness and browser checks were not rerun in this review.

Two short in-memory API probes qualify the R02B completion claim: conversion
returned a new check in check mode, checkConverted=false, with no answer/help
shown; replaying learn after advancing to practice returned 200 and moved back
to learn. Inspection also found item identity optional on question commands.
These are functional follow-ups for the next feature slice, not a new review phase.

Founder direction: reach v1 quickly and defer detailed tests to deployment.
NEXT_STEPS.md now defines three slices: persistent app, bounded AI with minimal
sources/review, then deployment readiness. Existing fast tests/build and focused
ownership, evidence and AI-cost checks stay with their affected features. Broader
browser/accessibility/runtime and release verification happen before deployment.
No new test suite or application changes were added in this review. Planning
updates are local; no push, deployment or paid AI call was made.

### R03 — identity and durable data (14 September 2026)

**What changed.** R03 was implemented as a local integration. At this original
handoff Supabase was not yet connected; the activation follow-up below records the
subsequent project configuration. The fixture path (no env vars) continues to work.

Also folded in: the three R02B functional follow-ups identified in the fast review.

| Area | Files changed |
| ---- | ------------- |
| Learning rules | `src/server/learning.ts` — check→learn added to ALLOWED_TRANSITIONS; `setStage` accepts optional `expectedCurrentStage` guard |
| HTTP routes | `src/server/index.ts` — rewritten with Env extended, auth middleware, `/api/me`, `GET /api/sessions` list, all session routes wired to db with `waitUntil` background writes and in-memory fallback |
| Async storage | `src/server/db.ts` — fetch-based Supabase REST client; ownership-scoped CRUD; optimistic-concurrency PATCH with version guard; session list; enrollment check |
| Auth | `src/server/auth.ts` — originally implemented with Web Crypto HS256 verification; replaced by ES256 JWKS verification in the activation follow-up below |
| Schema | `supabase/migrations/001_initial_schema.sql` — `invite_enrollments`, `sessions` tables, RLS, indexes |
| Environment | `.env.example`, `wrangler.toml` — all required vars documented; secrets listed separately |
| Shared contract | `src/shared/types.ts` — `SessionSummary`, `MeResponse` added |
| Client | `src/client/api.ts` — `loadMe()`, `listSessions()`, `storeToken/clearToken`, `authHeaders()` |
| Client | `src/client/App.tsx` — `HomeScreen` component with Continue and Review due sections; session list loaded on mount; `expectedStage` passed on all navigations |
| Client | `src/client/messages.ts` — `resume` section |
| Client | `src/client/styles.css` — resume/review-due CSS |
| Tests | `src/server/api.test.ts`, `src/server/r02b.test.ts` — all check-stage submissions updated with `itemId`; stale-navigation test updated for `expectedStage` guard; two tests updated to accept `not_at_check_stage` as valid 409 after teach-before-check |
| Acceptance | `src/acceptance/harness.ts` — updated for teach-before-check flow and `itemId` requirement |

**R02B follow-ups addressed:**

1. **Teach before check.** `POST /api/sessions/:id/convert` now transitions the
   session to `learn` after converting, so the learner sees the explanation
   before the replacement item. `check→learn` added to `ALLOWED_TRANSITIONS`.
2. **itemId required at check stage.** `activeQuestion()` rejects hint/reveal/attempt
   commands at stage `check` that do not supply an `itemId`, returning 400
   `item_id_required`.
3. **Stale-navigation guard.** `stageCommandSchema` accepts `expectedStage`; `setStage`
   in learning.ts rejects the transition when the session's actual stage differs from
   `expectedCurrentStage`. Client passes current stage on every navigation.

**Verification, run on this checkout (Node 24.19.0 / npm 12.0.2).**

| Check | Result |
| ----- | ------ |
| `npm test` | **55 passed** (21 learning, 19 API, 15 R02B); unchanged count |
| `npm run build` | Typecheck and Vite build passed; 158.95 kB JS (50.84 kB gzip) |
| Answer-key leakage | `correctOptionId` and `answerExplanation` absent from built bundle (`Select-String` returned `False`) |

**Activation status.** Project creation, linking, migration, public configuration
and ignored local secrets are complete; see the activation follow-up below. Google
OAuth credentials, test identities and their `invite_enrollments` rows remain.

**Not done here.** Keyboard-only walkthrough, screen-reader pass, narrow-screen and
UAE-network verification remain open. Workers-runtime CPU profile not run. No
deployment, paid AI call or hosted resource change was made.

**Next ticket.** R04 — one AI provider adapter, bounded teaching from the source pack,
server-side API key, configured spend cap and usage ledger. Can be coded against
fixtures; live calls require a key and explicit monthly budget.

### R03 Supabase activation follow-up (14 September 2026)

**Remote project.** Linked this checkout to project `gxbexwtopazokvmpfyzj`
(`rawi`, `ap-southeast-1`, `ACTIVE_HEALTHY`). Applied
`supabase/migrations/001_initial_schema.sql`; a subsequent `supabase db push
--linked --dry-run --include-all` reported the database already up to date. The
server key returned HTTP 200 from both `sessions` and `invite_enrollments`; both
tables currently contain zero rows. The publishable key can query `sessions` but
receives zero rows under RLS.

**Environment and auth compatibility.** Added `.env` and `supabase/.temp/` to
`.gitignore`; the management access token remains only in ignored `.env`. Created
ignored `.dev.vars` with the project URL, publishable key, secret key and fixture
tutor mode. Added only the safe URL and publishable key to `wrangler.toml`.
The project signs learner tokens with ES256, so `src/server/auth.ts` now verifies
the project JWKS instead of requiring the unavailable legacy shared JWT secret.
The REST client uses the current server-key `apikey` header. When durable mode is
configured, session creation, reads and mutations now fail closed with 401 if no
valid learner token is supplied instead of falling through to fixture memory.

**Verification.** `npm run typecheck`, `npm run lint` and `npm run build` passed.
`npm test` passed **61 tests** across four files, including five ES256 verification
tests and a configured-mode authorization regression. A local Wrangler smoke test
loaded `.dev.vars`, returned `dbConfigured: true` from `/api/health`, and returned
401 for unauthenticated `POST /api/sessions`. The remote JWKS exposes one ES256 key.
The actual `src/server/db.ts` client also completed a read-only remote session-list
request with the configured server key.

**Still required before a learner pilot.** Google OAuth is disabled because no
Google client ID/secret was provided. There are no Auth users or enrollment rows,
so the required two-identity isolation journey is not yet testable. The browser
currently has token-storage/API helpers but no complete OAuth initiation and
callback interface; that must be wired when the provider credentials are supplied.
Cloudflare deployment secrets were not changed and nothing was deployed. The
access token can administer the project but lacks permission to read the
organization plan, so the Supabase Free-plan requirement could not be independently
verified; no plan, add-on or billing setting was changed in this work.

**Tradeoff.** JWKS verification removes a long-lived shared JWT secret from the
Worker and supports key rotation. It adds a small public-key lookup; Supabase serves
that endpoint through an edge cache, and the real Worker CPU/latency check remains
part of deployment readiness.

### R03 fast v1 review — 14 September 2026

GitHub and initially clean local main match `82a884366126d40bdcb0d0223ad3b631d07327bb`.
Fresh `npm test`: 61 passed. Fresh `npm run build`: typecheck and build passed.
No Actions runs returned. No remote Supabase, browser or lint checks were rerun.

A no-file, offline API probe generated two synthetic ES256 learner identities and
mocked database responses. A created a session; B mutated A's cached session using
its ID. The response was 200 with A's session, cached stage changed to learn,
and the database stage remained diagnose after a zero-row update conflict.
Configured authentication checks identity but mutations do not resolve ownership
before using shared memory. Required writes run in the background and their
results do not affect the success response. Creation has the same save-ack issue.
This is a reproduced functional/authorization gap, not deferred test polish.

Inspection also found the session-list summary promotes diagnostic/practice
independent attempts as check evidence, new-session exposure resets, and browser
OAuth initiation/callback remains unimplemented. NEXT_STEPS.md scopes these into
one persistence/sign-in completion slice, followed by bounded AI and deployment.
Only directly necessary ownership/save regressions are requested; broad testing
remains deferred under the founder's fast-v1 instruction.

No application changes, real learner data, remote writes, paid calls or deployment
were performed. Planning changes are local and uncommitted.

### R03 persistence and sign-in completion — 14 September 2026

**Implemented locally.** Configured session commands now load the authenticated
owner's row from Supabase, apply the shared pure learning update, and await a
version- and owner-guarded PostgREST commit before returning success. A zero-row
write returns `409 session_conflict`; unavailable reads or writes return
`503 persistence_unavailable`. Creation confirms the returned row. Configured
mode never uses isolate memory, and `RAWI_STORAGE_MODE = "supabase"` prevents a
missing service secret from silently enabling the local fixture store.

Migration `002_atomic_session_creation.sql` selects and records learner-wide
exposure inside one database transaction, serialized per learner and lesson.
Starting again therefore cannot make a previously exposed item fresh—even during
concurrent starts—and an exhausted reviewed bank stays exhausted. Session list and detail
views use the same check-specific evidence projection, so independent diagnostic
or practice attempts no longer promote the list summary.

The browser now uses the official Supabase client for Google OAuth with PKCE,
callback exchange, persisted session restoration/refresh and local-device sign-out.
It renders distinct restoring, signed-out, setup-incomplete, not-enrolled and ready
states. Only the public project URL/publishable key are returned by
`/api/auth/config`; the configured service key was checked absent from the built
JavaScript. `@supabase/supabase-js` is the only new runtime dependency.

**Focused verification.** Run from the repository root on the existing local
toolchain:

| Command | Result |
| --- | --- |
| `npm test` | **68 tests passed** across five files, including seven configured persistence regressions |
| `npm run lint` | Passed |
| `npm run build` | Passed; 390.96 kB JavaScript (110.96 kB gzip) |
| `npm audit --omit=dev` | Zero production vulnerabilities reported |
| built-bundle checks | `correctOptionId` and the configured service key absent |
| `npx --yes supabase@latest db push` | Applied `002_atomic_session_creation.sql` to the linked project |

The regressions demonstrate cross-owner mutation denial, an owned mutation from a
cold isolate followed by resume, confirmed normal saves, conflict and unavailable
save responses, partial-configuration fail-closed behavior, learner-wide exposure,
and common evidence projection. They use synthetic identities and a mocked
Supabase REST boundary; no real user data was read or written. `npx --yes
supabase@latest db push` successfully applied migration 002 to the linked remote
project; this confirms schema application, not the learner journey.

**Not remotely accepted.** Google provider credentials/redirects, ordinary test
identities and enrollment rows are still absent, so no real OAuth callback or
remote two-user API/RLS journey was run. Supabase Free was not independently
verified, no Worker secret was changed, and nothing was deployed. The fixture
lesson remains provisional and unreviewed for pilot use. No live AI exists.

**Tradeoff.** Awaiting every required database commit adds one network round trip
to each learner action, but the response now means the state was durably accepted.
Optimistic version guards make concurrent commands explicit conflicts instead of
silently losing work; the browser already reloads the authoritative row on 409.

**Next ticket.** R04 bounded AI plus the minimum R05/R06 return-review experience,
using deterministic fixtures until a provider key, monthly budget and live-eval
ceiling are explicitly supplied.
