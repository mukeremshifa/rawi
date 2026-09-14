# Rawi: shortest path to v1

Updated 14 September 2026 following R03 delivery.

## Current state

R03 is complete as a local integration. GitHub and local `main` should be updated
to the R03 commit after this session. R03 delivers:

- Supabase schema, migrations, RLS and environment template
- Web Crypto JWT verification (no npm client)
- `/api/me` endpoint; invite enrollment gate
- Ownership-scoped durable session storage via Supabase REST API (fetch-based)
- Optimistic-concurrency `PATCH` with `version` guard
- Session list and resume UI (Continue + Review due) on the home screen
- Three R02B follow-ups: teach-before-check on convert, required `itemId` at
  check stage, `expectedStage` stale-navigation guard

Fresh checks: **55 tests passed; production build and typecheck passed.**
Answer keys absent from bundle. Lint, acceptance harness and browser checks were
not rerun in this session.

The durable auth path requires external Supabase credentials; see STATUS.md
for the exact setup steps. Until credentials are supplied, all routes fall back to
the in-memory fixture path. No deployment, hosted auth or paid AI call was made.

## What v1 means

An invited adult learner can sign in, open one supported lesson, get useful AI
help, answer a fresh independent check, leave, and return to saved progress and
a simple due-review action. The founder can cap AI spend and operate the app
without hosting charges.

Use the current original demo course during implementation. Real pilot content
still needs a selected shared course, permission and competent review before
learners rely on it. Start with English and the adult college cohort.

## Three implementation slices

| Order | Deliverable | Scope |
|---|---|---|
| 1 — done | Persistent learning app (R03 + R02 follow-ups) | Login, enrollment, ownership-scoped saved sessions/attempts/exposure, async transactional storage, resume UI. Teach before check, require item identity, reject stale navigation. |
| 2 — next | AI learning v1 (R04 + minimum R05/R06) | One provider, bounded teaching from the original source pack, server-side keys, configured spend cap and usage ledger, useful timeout/failure fallback. Continue and Review due, with distinct review items and saved outcomes. |
| 3 | Deployable private v1 (minimum R08/R09) | Free-plan/account verification, hosted end-to-end journey, focused release checks, essential privacy/delete/support flow and restricted adult enrollment. Then deploy under the session's actual authorization. |

## Lightweight verification policy

During implementation:
- Run the existing fast tests and build/typecheck once after meaningful changes.
- Demonstrate the new happy path. Check the directly affected critical invariant:
  ownership for storage/auth, independent evidence for learning changes, or the
  spending ceiling for AI changes.
- Add a focused regression only when it protects those invariants or fixes a
  reproduced serious defect. No coverage target or exhaustive test expansion.

Before deployment / real learner use:
- Verify two ordinary identities cannot read/write each other's progress, including
  direct permitted database access; keep check keys and API secrets server-side.
- Verify the AI cap including concurrent calls/retries, provider failure recovery,
  and correct accounting. Live evaluations need an explicit cost ceiling.
- Complete the main hosted journey, refresh/retry, keyboard and narrow-screen smoke
  checks; perform targeted accessibility/security/runtime checks appropriate to
  the release, plus a representative UAE connection check.
- Verify persistent progress and review behavior, basic delete/export and recovery,
  content permissions/review, eligibility/privacy and actual zero-hosting billing.
- Fix release-blocking findings before opening enrollment.

Deferral changes scheduling, not what is honestly described as verified.

## Supabase setup (required before durable mode is active)

1. Create a Supabase project (free plan). Note project URL, anon key, service key
   and JWT secret from Settings → API.
2. In the SQL editor, run `supabase/migrations/001_initial_schema.sql`.
3. Enable Google OAuth under Authentication → Providers. Add redirect URL for
   `http://localhost:5173` (dev) and your production domain.
4. Add to `wrangler.toml` `[vars]`: `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
5. Add secrets: `wrangler secret put SUPABASE_SERVICE_KEY` and
   `wrangler secret put SUPABASE_JWT_SECRET`.
6. For local dev, create `.dev.vars` (gitignored) with all four values.
7. Insert `invite_enrollments` rows for test identities.

Until these steps are complete, every route falls back to the in-memory fixture
path — no auth, no durability, existing tests pass unchanged.

## Paste into the next implementation session

```text
Build Rawi's AI tutor slice in D:\rawi.
Read AGENTS.md, docs/STATUS.md, docs/PRODUCT.md and docs/NEXT_STEPS.md.
Start from current main; preserve existing changes. Prioritize a working v1.

Implement R04 as one complete slice: one AI provider adapter (Claude or OpenAI),
bounded teaching response from the original source pack, server-side API key
(never in the browser bundle), atomic budget reservation before each call, a
usage ledger (log provider/model/tokens/cost per request), useful timeout and
failure fallback that leaves reviewed material readable.

Also add the minimum R05/R06 for a usable return/review experience: Continue
shows the last session's state; Review due presents the next due check as a
distinct review item (same check stage flow); evidence from review is saved
as 'retained-on-review'. The review queue uses the nextReviewDue dates already
stored in sessions.

Use synthetic data and test identities during development. Keep free hosting only.
If a provider key is unavailable, finish the adapter with fixture mode retained
and document the exact setup. Do not claim live AI works without a key and an
explicit monthly budget and evaluation cap.

Run existing tests and build. Add only directly necessary critical regressions:
spending ceiling invariant (concurrent calls cannot exceed configured cap),
server-side key absence from bundle. Do not add exhaustive AI evaluation suites.

Do not add uploads, a new framework, paid hosting or public launch.
End with working code, concise setup/handoff, updated status and remaining
external setup clearly separated from implemented functionality.
Next slice is deployment readiness (R08/R09).
```

The AI slice can be coded with fixture mode retained. Before live calls, supply
the API credentials and an explicit monthly budget and evaluation cap. Existing
chat subscriptions are not assumed to cover API use.
