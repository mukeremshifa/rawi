# Architecture

Every decision below is settled. What follows is the reason, because a decision
without its reason gets re-litigated by the next person who finds it awkward.

## Runtime — Vite + React 19 + a Hono Worker + Supabase

One TypeScript codebase, one origin in production. The Worker serves the API
*and* the built client from the `ASSETS` binding, with SPA fallback configured
in `wrangler.jsonc`.

**The tradeoff:** two processes locally (Vite on 5173 with HMR, the Worker on
8787, `/api` proxied) against one origin in production. That asymmetry is
deliberate — it buys hot reload in development without a CORS surface, a second
deploy target, or a cookie-domain problem in production.

`nodejs_compat` stays on. Nothing in the Worker path needs it today, but
removing it is a change that fails at deploy rather than at build, and the flag
costs nothing.

## Google Cloud / Vertex AI — service-account JWT, no SDK

**Decision: a dependency-free Vertex REST client authenticating with a service
account, signing a JWT with Web Crypto.**

Concept Bridge called `new GoogleGenAI({ vertexai: true })`. That cannot work
here, and the reason matters more than the workaround:

- `@google/genai`'s Node build depends on `google-auth-library`, `protobufjs`
  and `ws`.
- Its Vertex path authenticates through **Application Default Credentials** —
  the developer's local `gcloud` login. There is no `gcloud` in a deployed
  Worker and there never will be.
- The web build is roughly a megabyte and is API-key oriented, which is the
  wrong credential shape for Vertex.

What the SDK does underneath is sign a JWT and exchange it for an access token.
That is about sixty lines of Web Crypto, available in the Workers runtime with
no dependency at all — `src/server/ai/google-auth.ts`.

**Everything that made the original call good is transport-independent and was
kept**: the system instruction, structured output, `temperature: 0`, the
abort-signal timeout, the error taxonomy, and validating the parsed result
before trusting any of it.

**The one difference that will bite you.** The SDK took `responseJsonSchema`, a
standard JSON Schema. The REST surface takes **`responseSchema`** in an
**OpenAPI 3.0 subset**: uppercase type names, `nullable: true` instead of an
`anyOf` null branch, and no `additionalProperties` at all. Those schemas live in
`src/server/assessment/schema.ts` written in that dialect, with a Zod schema
beside each one. **The response schema only steers the model; Zod is what
enforces the shape.** `tests/unit/vertex.test.ts` asserts the dialect.

**The tradeoff:** we own the transport. An API change at Google is our problem
rather than a dependency bump. In exchange, the Worker bundle carries no vendor
SDK, the auth path is sixty readable lines, and the thing deploys at all.

## Auth — Supabase magic link

Email one-time-password as the primary method. No password stored, no reset flow
to build, no SMTP beyond Supabase's defaults, and the smallest external setup
for the owner.

Google OAuth is implemented and flagged off (`RAWI_GOOGLE_OAUTH_ENABLED`). A
button that fails because a provider is not configured is worse than no button.

The Worker verifies the Supabase JWT on every request (ES256, against the
project's JWKS) and derives `user_id` from it. `RequestContext` has no field a
client could put a user id in — invariant 7, made structural.

`invite_enrollments` is kept but the gate is now a flag (`RAWI_INVITE_ONLY`,
default `false`). Rawi is no longer invite-only; the mechanism stays available.

## Database — Supabase Postgres

Migrations 001–003 are applied to the live project and are **immutable**. 004+
are additive.

- **RLS on every table, `user_id` on every owned row, ownership enforced in
  both RLS and the handler.** The Worker uses the service-role key and therefore
  bypasses RLS, so the defence that actually runs in production is the one in
  `src/server/db/`. RLS stays enabled as the second lock, and as what protects
  the project from anything connecting with an anon key.
- **Optimistic concurrency via `version`.** Two tabs are not hypothetical in a
  learning app — the one you left open yesterday will submit against a session
  that has moved on, and that has to be a rejection rather than an overwrite.
- **`attempts` is append-only**, enforced by a trigger that raises on UPDATE and
  DELETE. Invariant 4 in application code holds until someone writes a migration
  script, which is exactly when it matters most.
- **Uploads** go to a private `sources` bucket, RLS-scoped to the owner by the
  first path segment. v1 accepts `.txt` and `.md`; extraction is a plain-text
  read. No PDF, no OCR.

## Retrieval — Postgres full-text search, no embeddings in v1

Chunks carry a generated `tsvector`; retrieval is `websearch_to_tsquery` +
`ts_rank_cd`, inside a `search_chunks` function that takes the user id and
workspace id and filters on them in SQL.

**Why not embeddings.** They double the AI cost surface and add an ingestion
dependency — a source could not become searchable without a successful model
call — for a corpus that is one learner's own course material: small, and
lexically very close to the questions asked of it. Someone studying price
elasticity asks about price elasticity. Semantic search earns its keep across a
large heterogeneous corpus, which this is not.

**The tradeoff:** a learner who asks about "how responsive buyers are" when the
source says "elasticity" gets nothing. That is a real miss, and it is the
lexical gap pgvector closes. It is behind a `Retriever` interface so closing it
later is a new implementation rather than a rewrite of every caller.

Scoping lives inside the SQL function rather than in the caller, because a
retrieval helper that trusts its caller to add the ownership predicate is one
refactor away from leaking one learner's notes into another's answer.

## Jobs — Postgres rows, stepped, client-polled

Source ingestion and concept extraction are jobs. Each Worker invocation
advances **one bounded step** and returns; the client polls `getJob`, and the
poll is what advances it.

**No Queues and no Durable Objects.** Both add cost or a second runtime to
reason about, and what this workload needs is a row with a cursor in it — which
Postgres already is.

**Bound every step by CPU, not by convenience.** The Workers free plan allows
roughly 10ms of CPU per invocation. Chunking a large document in one loop
exceeds it, and the failure is a Worker killed mid-loop with half a source
indexed. A step processes at most **32 chunks** or **64KB of text**, whichever
comes first, then yields.

**Time spent waiting on Vertex or Supabase is I/O, not CPU**, and does not count
against that limit. Long model calls are fine. Long loops are not. That
asymmetry is why `chunk.ts` bounds its loop and nothing bounds the fetches.

**The tradeoff:** a learner who closes the tab pauses their own ingestion. It
resumes on the next poll rather than needing a restart, and the alternative is
a background runtime with its own failure modes and its own bill.

## Deployment — Cloudflare Workers, free plan

One origin, no CORS, no separate static host.

**CI runs `verify` and does not deploy.** A CI deploy that fails on a secret the
owner has not created yet is worse than no CI deploy. Deployment is
`npm run deploy`, run by the owner after a green gate.

Secrets reach production through `wrangler secret put`, never through
`wrangler.jsonc` `vars`. `SUPABASE_ANON_KEY` used to be committed there; it is a
publishable key so that was not an incident, but config belongs in one place and
that place is the table in `docs/OPERATIONS.md`.

## Cost control

Reserve-then-settle accounting wraps **every** live call
(`src/server/ai/budget.ts`).

- Paid AI fails closed: unavailable unless a provider credential **and both
  caps** are present. A missing cap is not a licence to spend; it is a sign
  nobody has decided what this may cost.
- **A call whose outcome is unknown is recorded `ambiguous`, never assumed
  free**, and keeps its full reservation charged against the cap. A request that
  times out may still have been billed, and treating that as zero is the cheap
  assumption that silently overruns a ceiling.
- The cap check and the reservation insert are one SQL statement, because two
  Workers reserving concurrently against the same cap is not hypothetical.
- `fixture` mode is the default. CI and local development never spend money.
  Live evaluation is `npm run eval:live`, behind an explicit ceiling.

## The contract, and the three-way drift it prevents

`src/shared/contract.ts` declares one interface of named methods. Two
implementations satisfy it — the fake and the real client — and TypeScript
enforces both, so that drift is a compile error.

What TypeScript cannot see is the Worker: `client.ts` builds a URL string and
`routes/index.ts` registers a path, and nothing type-checks the relationship. So
the route table is a **data structure** carrying an `op` per row, and
`scripts/check-routes.mjs` compares that set against the interface's method
names. A contract method with no route is caught on the commit that creates it
rather than at runtime — and it would otherwise be caught *in production*,
because the fake answers it happily in development.

## The single biggest tradeoff in the whole build

**The fake is a full second implementation of the API, and it is maintained.**

That is real, ongoing cost: every contract change is two implementations, and
the fake has its own tests. What it buys is that the entire gate — lint,
typecheck, unit tests, invariant tests, build, bundle scan, contrast, route
parity, deploy dry-run, and a full Playwright drive of the learning loop — runs
on any machine with no credentials, no database and a bill of exactly zero.

The rule that keeps it from becoming a liability is that **the fake may not have
capabilities a real API could not have**. `addSource` returns a job there too,
and that job takes three polls. It would be one line to return a ready source.
It would also be the lie that makes `GeneratingState` untested and lets the UI
be designed against a server nobody can build.
