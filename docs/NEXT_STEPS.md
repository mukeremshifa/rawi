# Rawi: next v1 session

Updated 14 September 2026. Keep the founder's fast-v1 policy: build features,
run existing quick checks, and defer broad test expansion to deployment.

## Checked now

The R03 persistence/sign-in completion slice is implemented locally on top of
`82a8843`. Configured mutations now resolve the authenticated owner's session
from Supabase, apply the learning command to that durable version, and return
success only after PostgREST confirms the conditional write. Configured mode
does not use shared isolate memory and a partial Supabase configuration fails
closed. Creation likewise confirms its write.

Focused synthetic regressions cover the reproduced cross-owner attempt, a
cold-cache owned mutation and resume, rejected and unavailable saves, learner-wide
item exposure, and common check-specific evidence projection. Fresh verification:
**68 tests passed; typecheck, lint and production build passed**. The browser now
implements Supabase Google OAuth PKCE initiation/callback handling, persisted
session restoration and refresh through the official client, local-device sign-out,
and distinct signed-out, setup-missing and not-enrolled states.

This is local implementation evidence, not hosted acceptance. No real provider
login, two-user remote journey, direct RLS check, Supabase plan verification,
deployment or learner use was performed. Google OAuth credentials and allowed
redirects are still required. Migration `002_atomic_session_creation.sql` was
applied to the linked Supabase project; live AI is not implemented.

## Foundation fix implemented; migration applied

A short offline probe used two synthetic, valid signed identities and mocked
Supabase responses. A created a session; B submitted a stage mutation naming A's
session. The API returned **200 with A's session**, changed the shared cached
state to learn, and ignored the database update's zero-row conflict. The stored
state remained diagnose. No real credentials, users or remote data were used.

Cause in src/server/index.ts: configuredAuthError verifies identity but mutations
then call memUpdateSession by session ID without resolving its owner.
persistOutcome starts a background write and ignores its result. Session creation
also returns 201 before its database write succeeds.

Consequences:
- An authenticated caller knowing another cached session ID can mutate its
  in-memory state and receive its projected view.
- A success response does not confirm progress was saved; failures and concurrent
  conflicts can silently lose changes.
- A mutation reaching a fresh isolate depends on a cache populated elsewhere.

The configured mutation path no longer uses the shared Map. Owner-scoped reads,
pure command application and confirmed conditional writes now form one request
path; zero-row conflicts return 409 and unavailable reads/writes return 503.

Related small corrections are also implemented: db.listSessions previously counted any independent
attempt, including diagnostic/practice, as independent check evidence; use the
same check-specific evidence rules as the session view. A newly created session
also resets item exposure; carry exposure across the learner's sessions so restart
cannot make a seen item fresh. Both now share the detail-view evidence projection,
and a transaction-scoped database function selects exposure during creation so
concurrent starts cannot claim the same authored item as fresh.

## Next session prompt

```text
Build Rawi's bounded AI and minimum return-review slice in D:\rawi.
Read AGENTS.md, docs/STATUS.md, docs/PRODUCT.md, docs/DELIVERY.md and
docs/NEXT_STEPS.md. Preserve existing changes and keep the session bounded.

Implement R04 with one provider adapter, bounded tutoring grounded in the
original provisional source pack, server-only credentials, durable atomic budget
reservation before calls, and an actual-usage ledger preserving provider, model,
prompt/curriculum versions and costs. Add timeouts and a useful deterministic
fallback that leaves reviewed material readable. Paid requests must remain
disabled unless both a provider key and explicit monthly budget are configured.
Keep active independent-check answers out of tutor context.

Add only the minimum R05/R06 needed for a real return action: Review due must
start a distinct delayed check item and save its evidence. Do not link back to an
old answered session and call that a review. Mark retained-on-review only after
a qualifying fresh, unaided correct check at the scheduled return.

Use deterministic fixtures until an API key, monthly spending ceiling and live
evaluation cap are supplied. Do not assume chat subscriptions cover API use.
Run existing tests/build once and add only focused budget-concurrency, answer
isolation and delayed-evidence regressions. No uploads, new platform, paid
hosting, broad coverage campaign, public deployment or fabricated evaluations.

Update docs/STATUS.md with implemented versus locally verified versus remotely
accepted outcomes. End with provider setup and live-evaluation prerequisites.
Next slice is deployment readiness.
```

## After that: AI v1, then deployment

**AI slice (R04 + minimum R05/R06):** one provider adapter, useful tutoring from
the original source pack, server-only credentials, durable atomic budget
reservations and usage ledger, timeout/failure fallback. Keep active independent
check answers out of tutor context. Add a real due-review action with a distinct
item and saved delayed evidence; a link back to an old answered session is not
a delayed check. Mark retained-on-review only after a qualifying fresh, unaided
correct check at the scheduled return, not merely because a learner revisits.

Implement against deterministic fixtures until an API key, explicit monthly
spending ceiling and live-evaluation cap are available. Do not assume existing
chat subscriptions cover API usage.

**Deployment slice:** complete provider setup, actual two-user isolation and
save/resume checks, Free-plan verification, targeted hosted/browser/accessibility
checks, AI-cap checks, essential privacy/delete/support and adult invite-only
enrollment. Broad edge cases, CI and performance work stay here.

No uploads, multiple subjects, Arabic, teens, voice, payments or advanced admin
work before v1. Keep the provisional original demo content until discovery
selects a shared course; subject review and permissions are required for pilot use.

## External setup still recorded as open

- Google OAuth client credentials and allowed redirects; ordinary test identities
  and their enrollment rows.
- Independent verification of Supabase Free in the account.
- Product AI provider key, monthly budget and evaluation ceiling.
- Pilot course, reviewer and content permissions.

These do not block writing the remaining code. Hosted acceptance and paid calls
must not be reported complete without their prerequisites.
