# Rawi GitHub status and next steps

Checked on 14 September 2026. R02B delivered on main. This is the latest local
review and handoff; historical review evidence remains in STATUS.md and Git history.

## Verified repository state

[R02A PR #1](https://github.com/mukeremshifa/rawi/pull/1) merged at
18:57:59 UTC. GitHub `main` is
[`c7e7222`](https://github.com/mukeremshifa/rawi/commit/c7e7222a25a4c70e5dd49c7d28e511b306a282d3).
After `git fetch origin`, its tree exactly matches local `734a9b7`
(tree `294193ab3b6de0d3568b25bb05c17146af985bac`). The local checkout is still
on `r02a-reliable-learning-state`; GitHub now lists only `main`.
It was clean before this documentation update.

| Area | Current evidence |
|---|---|
| Delivered | R01 local fixture app; R02A state-integrity changes merged |
| Next | R02B help and recovery, including outstanding R01 browser acceptance |
| GitHub automation | Zero workflows, runs, check runs and commit statuses |
| Repository tracking | No open issues; main branch reports unprotected |
| Releases/deployments | No releases or GitHub deployment records; external hosting not inspected |
| Still absent | Authentication, durable storage, live AI, full review queue, uploads |
| Founder discovery | No recorded interviews, selected course or subject-reviewer sign-off |

GitHub's combined commit status says `pending` with zero statuses. That means
there is no CI evidence here; it does not establish a running job.

Read-only sources: [branches](https://api.github.com/repos/mukeremshifa/rawi/branches),
[workflows](https://api.github.com/repos/mukeremshifa/rawi/actions/workflows),
[runs](https://api.github.com/repos/mukeremshifa/rawi/actions/runs),
[check runs](https://api.github.com/repos/mukeremshifa/rawi/commits/c7e7222a25a4c70e5dd49c7d28e511b306a282d3/check-runs),
[statuses](https://api.github.com/repos/mukeremshifa/rawi/commits/c7e7222a25a4c70e5dd49c7d28e511b306a282d3/status),
[open issues](https://api.github.com/repos/mukeremshifa/rawi/issues?state=open),
[releases](https://api.github.com/repos/mukeremshifa/rawi/releases),
[deployment records](https://api.github.com/repos/mukeremshifa/rawi/deployments).

## Fresh verification

Using existing dependencies on Node 24.19.0 / npm 12.0.2, against the same file
tree as merged main:

| Check | Result |
|---|---|
| `npm test` | 40 passed: 21 learning tests, 19 API tests |
| `npm run lint` | Passed |
| `npm run build` | Typecheck and production Vite build passed |
| Controlled later-read probe | A September 13 qualifying attempt stays due September 20 when read September 14 and September 21 |
| Independent code review | Original R02A evidence defects addressed; recovery follow-ups below |
| Controlled delayed-navigation probe | Reproduced a late duplicate moving practice back to learn |

The probes bundled the existing TypeScript into memory and called the Hono API
in Node. No application files were changed. These are not browser or deployed
Workers checks. The earlier 24 Workers-runtime assertions were not rerun.
Keyboard, narrow-screen, screen-reader and UAE-network verification remain open.

The committed due-date test rereads immediately; it does not advance the clock.
The separate probe above does. Add the clock-controlled case to the permanent
suite during R02B so future date regressions are caught automatically.

## R02A assessment

### Gap 1 — conflicting changes and active state: original defect fixed

Handlers now finish parsing the request before reading the session, then apply
one synchronous read/decide/write operation. The overlap regression covers a
reveal completing while submission input is still arriving. Assistance is
preserved, and the answer cannot gain independent credit from the old state.
Illegal stage jumps and question commands naming an inactive stage are rejected.

This guarantee is limited to the current single-isolate memory store. A version
field alone is not database concurrency control. R03 needs an asynchronous
storage boundary plus database transactions or compare-and-swap with defined
retry behavior; HTTP handlers may need adaptation. Do not assume changing only
the storage file makes this production-ready.

### Gap 2 — evidence stability: original defects fixed

Replay uses the recorded correctness and assistance snapshot. The initial due
date is recorded with the qualifying attempt, so it remains fixed on later reads.
R06 still owns the actual delayed-review experience and subsequent scheduling.

### Remaining recovery work

| Finding | Evidence and learner impact | Next action |
|---|---|---|
| Delayed navigation can rewind the session | Hold a request to learn, retry it successfully, advance to practice, then release the original: it returns 200 and moves back to learn. Recorded evidence survives. | Bind commands to the expected state/item and define retry identity; include this in R02B. |
| Conflict refresh can claim success after failure | App.tsx sets the “latest state” message before reload and suppresses reload errors. | Show successful refresh, unavailable refresh and expired-session recovery accurately. |
| Incorrect unaided work is labeled assisted | App.tsx and EvidencePanel.tsx derive assistance text from `countsAsIndependent`, which also depends on correctness. | Render correctness, help used and qualifying evidence separately. |
| Check has no usable switch to help | The UI offers help only in practice; one fixed check cannot supply a fresh replacement. | Add the explicit conversion and a small distinct check bank. |
| Restart forgets exposure | A new fixture session repeats the same check without prior exposure. | Keep normal retry/help within the tracked session; make an explicit demo reset clear. Durable learner-wide exposure belongs to R03. |

Code references at the reviewed merge: [stage command](https://github.com/mukeremshifa/rawi/blob/c7e7222a25a4c70e5dd49c7d28e511b306a282d3/src/server/index.ts#L95),
[conflict recovery](https://github.com/mukeremshifa/rawi/blob/c7e7222a25a4c70e5dd49c7d28e511b306a282d3/src/client/App.tsx#L41),
[feedback](https://github.com/mukeremshifa/rawi/blob/c7e7222a25a4c70e5dd49c7d28e511b306a282d3/src/client/App.tsx#L350),
[attempt badges](https://github.com/mukeremshifa/rawi/blob/c7e7222a25a4c70e5dd49c7d28e511b306a282d3/src/client/EvidencePanel.tsx).

No new evidence-corruption blocker was found within R02A's documented fixture
scope. These follow-ups belong in R02B before adding replacement checks.

## R02B — delivered 14 September 2026

All nine acceptance criteria met within the fixture scope.

| Check | Result |
| ----- | ------ |
| `npm test` | 55 passed (21 learning, 19 API, 15 R02B) |
| `npm run lint` | Passed |
| `npm run build` | Passed; 156.90 kB JS / 50.35 kB gzip |
| `npm run acceptance` | 8/8 fetch-based paths passed |
| Answer-key absence | `correctOptionId` and `answerExplanation` absent from built bundle |

**What was delivered.**

- Explicit `POST /api/sessions/:id/convert` route with item-identity guard.
  Body carries `itemId`; server atomically retires the item and selects the next
  unexposed bank item. Exhaustion returns `check_bank_exhausted` (409).
- Three original replacement check questions in `demo-lesson.ts checkBank`.
- Item-identity guard in `activeQuestion()` for hint, reveal and attempt at the
  check stage. A stale `itemId` returns `item_replaced` (409).
- `convertCheck()` in `learning.ts` marks the item `assistance: 'revealed'`
  without inventing a graded answer. Duplicate/idempotent behavior defined.
- Correct labels: `independent` / `helpUsed` / `incorrectUnaided` rendered
  separately in Result and EvidencePanel (3-badge system).
- Honest reload in App.tsx: 409 tries to reload; shows one of
  `staleRefreshed`, `staleRefreshFailed`, `staleSessionGone`, or
  `itemReplacedRefreshFailed` — never claims the view is current before reload succeeds.
- `previousCheckId` ref resets selection and moves focus when `activeCheckId`
  changes, including same-stage item replacement.

**Open limitations (carried to R03 and beyond).**

- Keyboard-only walkthrough not run in a real browser.
- Screen-reader pass not performed.
- Narrow-screen (< 52 rem) layout not tested on a real device.
- UAE device and network conditions not tested.
- Workers-runtime probe not rerun after R02B changes.

## Next implementation: R03 — identity and durable data

**Outcome:** two test identities can authenticate (Google OAuth or verified
no-paid-email flow), complete a lesson, and have their progress survive a Worker
restart. Access isolation: neither identity can read the other's session.

Key requirements before any learner-facing deployment:

1. Supabase Free — verify plan limits; no paid upgrade.
2. Body-size limits before JSON parsing (see `NEXT_STEPS.md` note).
3. Transactional writes with `UPDATE ... WHERE version = $n` replacing the
   in-memory Map.
4. Per-learner ownership scoping on all session endpoints.
5. Durable `exposedCheckIds` so a bank item conversion is not lost on a Worker restart.
6. No exposed secrets in the bundle or version control.

## Parallel and subsequent sessions

| Order | Owner/session | Outcome |
|---|---|---|
| Now | R03 identity and durable data | Authorized ownership, durable exposure, transactional writes and isolated test identities on verified free plans |
| In parallel | Repository verification owner | Reproducible install and offline CI for lint/tests/build + acceptance |
| In parallel | Founder R00 discovery | Select shared course, reviewer and permitted materials from actual conversations |
| After R03 | R04 bounded AI | One adapter, configured cost ceiling, usage accounting, evaluated tutoring and failure handling |
| After foundations | R05–R10 | Per roadmap in DELIVERY.md |

**Demonstrable outcome:** a learner gets stuck on a check, explicitly switches to
help, practices that item, and then attempts a distinct unexposed check. The
summary accurately distinguishes correct work, help used and independent evidence.
Refreshes, duplicate requests and temporary failures preserve that meaning.

Keep one concept and deterministic fixture content. A small bank of original
replacement questions is enough; retain honest “subject review pending” metadata.

Acceptance:

1. Both feedback and attempt history distinguish an incorrect unaided response
   from assisted work. Only a qualifying correct independent check promotes
   concept evidence.
2. “Get help” atomically makes the active check ineligible for independent credit
   before exposing assistance and changes it into practice. Record the conversion
   without inventing a graded answer or retroactively rewriting a submitted result.
3. The next check has a distinct server-selected item ID and has not been assisted,
   answered or otherwise retired from independent use within the tracked session.
   Exhausting the bank produces an honest end state, never recycled “fresh” evidence.
4. Item commands identify the intended item as well as relevant state/revision.
   A stale request cannot act on its replacement even when both use stage “check.”
   Duplicate conversion/submission/navigation requests have explicit replay or
   rejection behavior; delayed navigation cannot rewind newer progress.
5. Failed reloads do not claim that the view is current or a write is confirmed.
   Provide retry/reconciliation, handle missing sessions, and preserve unsent input
   where meaningful. Reset selection and focus when the active item changes,
   including when its stage stays the same.
6. Help and retries retain exposure in the session. Label any full fixture reset
   as a demo reset that clears history; it is not a new assessment of retention.
   Do not claim protection across cleared storage, new identities or Worker restarts.
7. Cover conversion/submit overlap, duplicate help, stale item actions, fresh-item
   exhaustion, wrong-without-help labels and due-date reads across a changed clock.
   Preserve the existing 40 regression cases, adapting setup only for documented
   contract changes.
8. Run a real browser journey: independent completion, check → help → replacement,
   refresh, retry, expired session, keyboard-only completion and narrow layout.
   Add a small repeatable browser harness for the critical paths and report what
   was actually exercised. Do not equate browser emulation with a real UAE device
   or network test.
9. Run lint, tests and build; verify unrevealed answers and unrequested help stay out
   of public payloads and the production browser bundle, including new bank items.

### Ready-to-use session prompt

```text
Implement Rawi R02B — help and recovery in D:\rawi.
Read AGENTS.md, docs/STATUS.md, docs/PRODUCT.md, docs/DELIVERY.md
and the R02B acceptance list in docs/NEXT_STEPS.md.

R02A is merged as c7e7222. Inspect current Git state and preserve local
documentation changes. Start from the merged implementation; do not rebuild R02A.

Own the learning rules, session projection, shared command/view contracts,
client feedback/recovery and the smallest original replacement-check bank.
Provide explicit check-to-help conversion, a distinct unexposed replacement,
honest correctness/help labels and an exhaustion state. Keep evidence immutable.
Fix delayed navigation retries and failed conflict-refresh messaging.
Validate active item identity inside atomic updates, including overlapping help,
submission and replacement requests. Keep ordinary recovery in the same session.

Add focused regression coverage and a small repeatable browser journey.
Run the checks and browser acceptance listed in NEXT_STEPS.md, recording exact
results and limitations. Preserve existing regression coverage. Keep fixtures,
one concept, zero hosting costs, no real learner data and no paid AI calls.
Coordinate any package/lockfile changes with a parallel CI owner.

Update STATUS.md, DELIVERY.md and the next-session pointers to reflect verified
completion. End with a demonstrable local flow and explain how attempted items,
assisted items and fresh checks are kept distinct by the server.
```

## Parallel and subsequent sessions

| Order | Owner/session | Outcome |
|---|---|---|
| Now | R02B implementation owner | Complete help/recovery and browser acceptance above |
| In parallel | Repository verification owner | Reproducible install and offline CI for lint/tests/build |
| In parallel | Founder R00 discovery | Select shared course, reviewer and permitted materials from actual conversations |
| After R02B review | R03 identity and durable data | Authorized ownership, durable exposure, transactional writes and isolated test identities on verified free plans |
| After foundations | R04 bounded AI | One adapter, configured cost ceiling, usage accounting, evaluated tutoring and failure handling |

Give a parallel CI session this bounded brief:

```text
Add deterministic repository verification for Rawi. Own workflow/setup files;
coordinate package.json and lockfile changes with the R02B owner.
Use a pinned, verified Node/npm setup and npm ci; document lifecycle-script
requirements so a clean runner works. Run lint, tests and production build on
pull requests and main. Use offline fixtures and standard free-eligible runners,
read-only job permissions and no deployment/provider credentials.
Do not introduce paid runners, hosting or model calls. Record clean-install
results locally; describe GitHub execution as unverified until a run exists.
Add the browser command once the R02B harness is integrated.
```

Keep one integration owner and separate branches for parallel implementation.
Once a workflow has passed on GitHub, required checks can be considered separately.
No repository settings were changed by this review.

Before R03 exposes any API, bound request-body bytes before JSON parsing;
Zod field-length limits run after parsing and do not cap incoming memory use.
Current [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/#stream-request-and-response-bodies)
explicitly call for this limit. This is existing pre-hosting work, not a reason
to expand R02B into an infrastructure migration.

The founder can run R02B now. Course selection and the monthly AI cap remain the
two useful parallel decisions; the cap is needed before live model evaluations.
