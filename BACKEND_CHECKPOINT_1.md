# Checkpoint 1 handoff

Implemented code, with external integration verification still pending.

- `server/backend/`: Better Auth 1.7.7, Drizzle 0.45.3, Neon 1.2.0 and Hono
  routes. Authentication uses request-scoped WebSocket pools. Reads and ordinary
  revision-guarded updates use HTTP. Pools close in `finally`.
- `drizzle/0000_online_foundation.sql`: nine auth and application tables. The
  Better Auth fields were checked against the installed core schema. Workspace
  bootstrap, course creation and outline replacement use interactive transactions.
  Retained topics keep their IDs. Scoped foreign keys constrain links to one course.
- `src/shared/online.ts`: strict runtime validation and browser-safe contracts.
- `src/client/online/`: separate online account root, course library, settings,
  syllabus reader, outline editor, preferences, save failures and conflict review.
  Account guards reject stale responses and mutations after a session switch.
- `wrangler.jsonc`, `drizzle.config.ts`, `.dev.vars.example`, package scripts and
  Vite proxy configuration provide explicit online development. Local reducer,
  stored data, restoration, migration and export implementation remain unchanged.

The main tradeoff is a small separate online feature surface while the richer
learning UI still depends on local state. Shared UI primitives and the syllabus
reader are reused. No local state tree is uploaded. No uploads, hosted AI,
billing, organization tables, tests or CI were added.

## Configuration and migration

Copy `.dev.vars.example` to `.dev.vars`, fill the five placeholders, and use the
designated development Neon database. Required names: `DATABASE_URL`,
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
All five were missing during implementation. No values were printed.

Use `http://localhost:5173` for the public development origin and
`http://localhost:5173/api/auth/callback/google` for the Google callback.
Run `npm run db:generate` to generate a migration, review its SQL, then
`npm run db:migrate` to apply the committed history. No migration, provisioning
or deployment was performed against an external service.

## Verification

- `npm install`, `npm run typecheck` and `npm run build` passed.
- `npm run dev` started Vite and the existing local API. The public origin
  served the app and reported that online mode requires `npm run dev:backend`.
- The Worker started in Wrangler. `/api/status` reported the five missing
  configuration names. `/api/v1/me` returned a safe JSON 503 with a request ID.
- `npm run dev:backend` built the assets and started Worker and Vite together.
  Through `http://localhost:5173`, online status and auth configuration failures
  returned JSON with `Cache-Control: no-store`. Local and online deep links
  served the Vite SPA.
- Unknown API paths, including a nested course miss, returned JSON 404s.
  Application deep links returned the SPA HTML through Workers Static Assets.
- `wrangler deploy --dry-run` packaged the Worker and assets without deploying.
- The generated migration was reviewed for uniqueness, ownership, scoped foreign
  keys, topic links, revisions and indexes. It has not been applied to Neon.
- A second `npm run db:generate` found no schema drift. `npm run db:migrate`
  stopped with the expected missing `DATABASE_URL` message. An installed-schema
  comparison confirmed every Better Auth core field is present in Drizzle.
- One-off contract checks accepted valid courses and IANA timezones and rejected
  injected ownership fields, self-links, duplicate topics, out-of-outline links,
  invalid timezones and invalid preference counts. These are validation checks,
  not evidence of database isolation.
- A client bundle scan found no configured secret values or database transport
  code. API logs from the exercised requests contained request IDs, methods,
  status codes and durations, without credentials or private course text.

Browser interaction checks were blocked: Computer Use reported that Microsoft
Edge access was not approved. Local course navigation, export downloads and
visual rendering therefore still need browser verification. Google OAuth,
session reload, sign-out, two-account isolation, persistence across browser
sessions, concurrent bootstrap, duplicate creates and revision conflicts need
the designated Neon database and two development Google accounts. No fake
session bypass was added or used.

The production build reports a large client chunk. npm reports four moderate
development dependency advisories in Drizzle Kit's legacy esbuild loader chain.
The installed stable Drizzle Kit release is pinned. No forced downgrade or
prerelease substitution was made.

Before checkpoint 2, complete the blocked acceptance checks in
BACKEND_IMPLEMENTATION_BRIEF.md. Checkpoint 2 is private R2 material storage,
upload lifecycle and immutable material versions.
