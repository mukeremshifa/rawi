# Rawi

English-first AI learning workspace. Takes material a learner does not
understand, teaches it, verifies they can use it unaided, and re-verifies later.

## Read AGENTS.md first

[AGENTS.md](AGENTS.md) is the operating contract — the eleven invariants, the
engineering boundaries, the honesty doctrine. It is short and it governs. This
file is orientation and does not restate it.

## What this repo is right now

**A working application.** Vite + React 19 client, a Hono Worker on Cloudflare
serving both the API and the built client from one origin, Supabase for auth,
Postgres and private storage, Vertex AI over REST for assessment and grounded
answering.

It is not deployed. `VITE_API_MODE` defaults to `fake` and `RAWI_AI_MODE`
defaults to `fixture`, so everything runs locally with no credentials and no
spend — including the whole of `npm run verify`. Going live is the owner's
checklist in `docs/OPERATIONS.md`.

`docs/STATUS.md` is the single source of truth for what is genuinely done.
Update it with verified outcomes; do not mark planned work as completed.

## Where things are

```
src/shared/      contract.ts (the API interface), content.ts, messages.ts
src/client/      api/ (fake + real + queries), components/, features/, styles/
src/server/      index.ts (wiring), routes/, learning/ (THE INVARIANTS),
                 pedagogy/, assessment/, ai/, retrieval/, scheduling/, db/,
                 jobs/, analytics/
tests/           invariants/ (one file per rule group), unit/, e2e/
scripts/         check-contrast, check-bundle-secrets, check-routes, live-ai-eval
supabase/        migrations 001–003 applied and immutable; 004+ additive
```

## Doc map

| Question | File |
| --- | --- |
| What is verified working, what is next | `docs/STATUS.md` |
| Why the architecture is shaped this way | `docs/ARCHITECTURE.md` |
| The design system, with computed ratios | `docs/DESIGN.md` |
| Secrets, external setup, deployment | `docs/OPERATIONS.md` |
| Untrusted input, minors, deletion, export | `docs/SAFETY.md` |

Read the one file the task needs.

## Starting work

`src/shared/contract.ts` is the map. Every method on `ApiClient` is a route the
Worker serves and a method the fake implements; drift between the three is a
compile error or a `check:routes` failure, never a runtime surprise. Start
there, then read the module the task touches.

Explain the main engineering tradeoff in what you build. The owner is learning
the system, and a decision left unexplained is half-delivered.
