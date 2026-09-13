# Rawi GitHub status and next steps

Draft checked on 13 September 2026 at approximately 18:28–18:32 UTC. This is a local planning update, not a GitHub issue, pull request, or implementation change.

## Verified repository state

Repository: [mukeremshifa/rawi](https://github.com/mukeremshifa/rawi). Default branch: `main`. GitHub and the clean local checkout matched commit [`5a79f26bec7a3bdce8ab68d797fb48548671deda`](https://github.com/mukeremshifa/rawi/commit/5a79f26bec7a3bdce8ab68d797fb48548671deda) before this documentation draft.

| Area | Verified status |
|---|---|
| History | Two commits: research/planning, followed by R01 local app and Worker API skeleton |
| Branches | `main` only; branch response reports `protected: false` |
| Pull requests | None returned, including closed PRs |
| Open issues | None |
| GitHub Actions | No workflows and no workflow runs |
| Commit validation on GitHub | No check runs or commit statuses; this is absence of CI evidence, not a failing/running pipeline |
| Releases/deployments | No releases or GitHub deployment records; external hosting was not independently inspected |
| Working implementation | React/Vite browser, Hono API, one original microeconomics fixture, server-owned in-memory learning state |
| Not implemented | Authentication, durable learner storage, model provider integration, complete review queue, personal uploads |

Sources: [commit history](https://github.com/mukeremshifa/rawi/commits/main/), [branches API](https://api.github.com/repos/mukeremshifa/rawi/branches), [pull requests API](https://api.github.com/repos/mukeremshifa/rawi/pulls?state=all), [open issues API](https://api.github.com/repos/mukeremshifa/rawi/issues?state=open), [workflows API](https://api.github.com/repos/mukeremshifa/rawi/actions/workflows), [runs API](https://api.github.com/repos/mukeremshifa/rawi/actions/runs), [check runs API](https://api.github.com/repos/mukeremshifa/rawi/commits/5a79f26bec7a3bdce8ab68d797fb48548671deda/check-runs), [commit status API](https://api.github.com/repos/mukeremshifa/rawi/commits/5a79f26bec7a3bdce8ab68d797fb48548671deda/status), [releases API](https://api.github.com/repos/mukeremshifa/rawi/releases), [deployment records API](https://api.github.com/repos/mukeremshifa/rawi/deployments).

## Verification performed for this draft

On the exact GitHub commit, existing dependencies were used; no upgrades or paid calls were made.

| Check | Result |
|---|---|
| `npm test` | 32 passed across two files: 21 learning tests, 11 API tests |
| `npm run lint` | Passed |
| `npm run build` | Typecheck and Vite build passed |
| Controlled API overlap probe | Reproduced assistance loss and incorrect independent credit |
| Review-date probe | Reproduced due-date drift on later reads |

The targeted probes bundled existing TypeScript into memory with esbuild and exercised the Hono app/pure functions in Node. They did not add committed tests, exercise a deployed Worker, or measure Free-plan CPU. The previous R01 handoff reports 24 local Workers-runtime assertions; that probe was not rerun here. Browser, screen-reader and UAE-network verification remain outstanding.

## Milestone assessment

**R01 is delivered as a local fixture implementation, with browser acceptance still outstanding.** The repository now contains a real end-to-end lesson rather than only planning documents. It is not ready for public deployment or real learner accounts.

**R02 is partly implemented.** Shared types, learning functions, server projection, sequential assistance tracking and duplicate-submit protection already exist. The next work should strengthen these paths rather than rebuild them or immediately expand to several concepts.

**R00 has no recorded discovery outcome.** Course overlap, source permissions and subject-reviewer sign-off remain open. The fixture's review metadata explicitly says subject review is pending. **R03–R10 remain future work.**

## Gaps that determine the next work

### 1. Serialize conflicting changes and enforce active state

Mutation handlers read the session before awaiting request-body parsing, then replace the stored state. Two overlapping requests can therefore act on the same old state. In a controlled probe, an attempt request waited for its body while a reveal completed; when the attempt resumed, assistance changed from `revealed` back to `none` and the correct answer received independent credit.

The handlers also select the target question from the client-supplied stage, and `setStage` accepts any declared stage. A direct diagnostic-to-check transition returned 200 in the probe. Allowing a learner to test out can be a valid product choice, but it needs an explicit rule; actions must not silently operate on a different item from the active one.

Implement an atomic session update contract and explicit commands/allowed transitions. Validate the current item and state inside the update. Use a state version or equivalent conflict handling, and distinguish an idempotent replay from a new attempt. Carry that contract into database transactions in R03.

Evidence: [mutation handlers](https://github.com/mukeremshifa/rawi/blob/5a79f26bec7a3bdce8ab68d797fb48548671deda/src/server/index.ts#L131), [stage mutation](https://github.com/mukeremshifa/rawi/blob/5a79f26bec7a3bdce8ab68d797fb48548671deda/src/server/learning.ts#L205).

### 2. Make evidence stable over time

The review date is calculated from the time of projection. An independent check recorded on September 13 displays September 20 when read that day, then September 21 when read on September 14. Anchor this initial due date to the qualifying recorded attempt. R06 can continue to own the full review queue and subsequent scheduling policy.

Keep an attempt's original result and assistance snapshot immutable. Current replay logic combines the old correctness/independence with the question's current assistance, which can produce inconsistent explanations of the same result.

Evidence: [review-date calculation](https://github.com/mukeremshifa/rawi/blob/5a79f26bec7a3bdce8ab68d797fb48548671deda/src/server/learning.ts#L240), [replayed result](https://github.com/mukeremshifa/rawi/blob/5a79f26bec7a3bdce8ab68d797fb48548671deda/src/server/learning.ts#L166).

### 3. Finish the learner's help and recovery path

The UI labels every result that does not count as independent as assisted, including an incorrect answer given without help. Render correctness and assistance as separate facts. During an independent check, provide the specified way to switch to help; record that conversion and offer a distinct fresh check afterward. Restarting the same revealed fixture must not masquerade as an unseen assessment within the tracked learning context.

Evidence: [feedback display](https://github.com/mukeremshifa/rawi/blob/5a79f26bec7a3bdce8ab68d797fb48548671deda/src/client/App.tsx#L335), [practice-only help controls](https://github.com/mukeremshifa/rawi/blob/5a79f26bec7a3bdce8ab68d797fb48548671deda/src/client/App.tsx#L245). These interface gaps were established by code inspection; a browser walkthrough still needs to be performed.

## Recommended session order

| Order | Session | Observable outcome |
|---|---|---|
| Next | **R02A — reliable learning state** | Atomic updates, valid/stale command handling, immutable replay results, stable initial review date, controlled concurrent-request tests |
| Alongside R02A | **Repository verification** | Reproducible documented Node/npm setup and offline CI for lint, tests and build; browser test skeleton if isolated from R02 changes |
| After R02A | **R02B — help and recovery** | Correct assistance labels, explicit check-to-help conversion, distinct replacement check, keyboard/narrow-screen/browser recovery verification |
| Throughout | **R00 — founder discovery** | Shared course selected from actual interviews, source permissions and reviewer identified |
| After R02 completion | **R03 — identity and durable data** | Supabase Free, working OAuth for two ordinary test identities, ownership isolation, transactional persistence and recorded exposure |
| After identity/data foundations | **R04 — bounded real AI** | One model adapter, actual budget reservations/usage, reviewed evals, timeout handling and Free-runtime CPU profiling |

R02A and R02B are a proposed split of the existing R02 ticket, not added product breadth. Completion of both closes the remaining learning-loop requirements and R01 browser-verification gap. Keep one integration owner; a CI worker owns workflow/setup files and coordinates any package/lockfile changes. Add reliable runtime and browser checks to CI when those harnesses exist. Use no paid runners or services.

Use branches and small pull requests from the next change. Once checks exist and pass, consider requiring them on `main`. This draft does not change repository settings or create issues/PRs.

## Ready-to-use next session brief

```text
Implement Rawi R02A: reliable learning state on the existing fixture lesson.
Read AGENTS.md, docs/STATUS.md, docs/PRODUCT.md, docs/DELIVERY.md,
and docs/NEXT_STEPS.md. Inspect current code before changing it; R01 already
implements the typed model, pure rules and full happy path.

Keep scope to the current lesson and server/shared contracts, with minimal
client adaptation if the command contract requires it. Add an atomic session
update abstraction suitable for a later transactional store. Enforce explicit
allowed transitions and validate active item/stage within each update.
Handle stale/conflicting requests without overwriting newer evidence.
Keep original submitted results immutable, preserve monotonic assistance,
and anchor the initial review date to the qualifying recorded attempt.

Add deterministic regression tests with controlled overlapping reveal/submit
and stage/submit requests, sequential/concurrent replay, invalid/stale commands,
and the same attempt read on subsequent dates. Preserve the existing 32 tests
unless a documented product-contract correction requires updating an assertion.

Run lint, tests and build. Keep deterministic fixtures, zero hosting spend,
and no real learner data or AI calls. Do not expand the course, deploy, or
add authentication in this session. Update STATUS.md with exact evidence
and remaining R02B work. Explain why sequential idempotency is insufficient
when requests overlap, and how the chosen contract carries into R03.
```

The founder can proceed with this brief immediately. Selecting the pilot course and setting the product AI spending ceiling can happen in parallel; neither is needed to fix the local state rules.
