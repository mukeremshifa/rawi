# Backend implementation brief: checkpoint 1

Updated 4 October 2026. Implement this checkpoint, not the entire roadmap at once. README.md locks the stack. Follow AGENTS.md and use BACKEND_PLAN.md as architectural context.

## Outcome

Deliver a selectable online foundation where a learner signs in with Google, gets one personal workspace, and creates, edits, archives, restores, and reopens courses and topics backed by Neon. Preferences persist. Another account cannot access these records. The local prototype and existing saved work remain usable.

Complete this slice before uploads, hosted AI, payments, and organization administration. Report actual verification and missing credentials. Do not describe unverified OAuth or Neon integration as complete.

## Fixed choices and scope

- Existing React/Vite frontend, Workers Static Assets deployment target.
- Hono on Cloudflare Workers.
- Neon PostgreSQL, Drizzle schema and migrations, Neon serverless driver.
- Better Auth in the API with its Drizzle adapter and Google sign-in.
- Workers logs and metrics.
- Neon HTTP for single queries and non-interactive batches. Request-scoped WebSocket clients for interactive transactions and initially for Better Auth.

Do not substitute the selected technologies. Hyperdrive, Workflows, queues, vectors, R2 resources, and parsing compute are outside this checkpoint. Do not add tests or CI unless separately requested, as required by AGENTS.md.

## Read first

Read README.md, AGENTS.md, BACKEND_PLAN.md, package.json, tsconfig.json, and vite.config.ts. Inspect server/index.ts, server/config.ts, src/shared/types.ts, src/client/main.tsx, routes.tsx, store/store.tsx, store/selectors.ts, store/course-context.tsx, and the courses, syllabus, and settings features.

Apply the Cloudflare, Workers, and Wrangler skills when working on their components. Consult current official documentation for the installed Better Auth, Drizzle, and Neon versions. Pin a compatible stable set in the lockfile. Do not choose prerelease packages simply because an example uses them.

## 1. Runtime and configuration

Add a Hono Worker entry point such as server/worker.ts, with focused auth, database, service, and route modules. Retain the existing Node API for local prototype mode. Shared client types must not import database modules or credentials.

Mount /api/auth/* to Better Auth using the raw Request. Use /api/v1 for application routes. Unknown API paths return JSON, while application deep links receive the SPA. Read configuration from Worker bindings. Enable required runtime compatibility, including Better Auth's AsyncLocalStorage support.

Preserve the current no-credentials npm install and npm run dev experience. Add npm run dev:backend for explicit online development with the Worker runtime and Vite proxy. Select online mode explicitly and make the mode visible. Missing online configuration produces a clear error rather than falling back to local data.

Document only the minimal required configuration with a committed placeholder example and ignored secret values. Required names are DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, GOOGLE_CLIENT_ID, and GOOGLE_CLIENT_SECRET. If Vite uses http://localhost:5173, use that public origin consistently and register http://localhost:5173/api/auth/callback/google. Production callbacks follow the configured application URL.

Add the minimal Worker and Drizzle configuration needed for this slice. Use an existing designated development Neon database when configured. Provisioning, production migration, and deployment are outside this checkpoint. Missing credentials do not prevent implementing code, migrations, error states, and available local checks. Report the exact missing inputs without printing secrets.

## 2. Schema and migrations

Generate or accurately reproduce Better Auth's schema for the installed version, including user, session, account, and verification records. Use one Drizzle migration history for auth and application tables. Never run migrations from request handlers.

| Table | Required fields and constraints |
| --- | --- |
| workspaces | UUID id, unique owner user ID referencing Better Auth, timestamps |
| workspace_preferences | Workspace primary/foreign key, validated existing preference fields, IANA timezone, revision, timestamps |
| courses | UUID id, workspace ID, existing name/description/goal/accent fields, archived flag, revision, timestamps, create fingerprint |
| topics | UUID id, workspace and course IDs, existing title/summary/priority/module/order fields, revision, timestamps |
| topic_links | Workspace/course scope, source and target IDs, unique pair, no self-link |

Validate JSON preference fields if using JSONB. Add composite uniqueness and foreign keys to prevent mismatched workspace/course references. Topic links stay within one course. Index course lists by workspace and topics by course and order. Do not create future billing or organization tables yet.

Use the Better Auth user ID directly as the owner reference. Bootstrap workspace and preferences together using conflict-safe inserts. Concurrent first requests must create one workspace. Bootstrap never resets existing preferences.

Provide scripts to generate and apply explicit migrations to the designated development database. Review generated SQL. Avoid schema push as the production migration strategy. Keep schema naming consistent.

## 3. Authentication and isolation

Use Better Auth's client and server APIs for Google sign-in and sign-out. Do not restrict school domains or request Google Drive permissions. Keep its origin and CSRF protections enabled and use secure production cookies.

Construct auth with the request's bindings and a compatible database transport. Close WebSocket resources after the handler finishes. Do not retain request-bound sockets in globals or rely on PostgreSQL session state across HTTP queries.

Use authenticated Hono context for user and workspace identity. Resolve sessions through Better Auth rather than trusting body fields. Clear online caches on sign-out and account change before showing another workspace.

Return 401 for unauthenticated requests, 404 for absent or foreign records, 400 for invalid input, and 409 for revision conflicts. Do not expose SQL errors, connection strings, tokens, or another user's record existence.

## 4. API contract

Use runtime input validation and a consistent error object with code, message, and requestId. Return canonical saved records and revisions from mutations. Allow a stable client-generated UUID for create retries, but never treat IDs as authorization.

| Method and path | Behavior |
| --- | --- |
| GET /api/v1/me | Validate session, bootstrap workspace idempotently, return public user, workspace, preferences |
| GET /api/v1/courses | Own courses, archived filter, cursor pagination, bounded page size |
| POST /api/v1/courses | Create own course and optional initial topics atomically, deduplicate create ID |
| GET /api/v1/courses/:id | Own course only |
| PATCH /api/v1/courses/:id | Editable fields and expectedRevision, includes archive/restore |
| GET /api/v1/courses/:id/topics | Own topics in stable order |
| PUT /api/v1/courses/:id/topics | Replace outline and links atomically with expected course revision |
| GET /api/v1/preferences | Own preferences |
| PATCH /api/v1/preferences | Allowed fields with expected revision |

Increment the course revision when replacing its outline so outline and course edits share a consistent conflict rule. Preserve retained topic IDs. Physical topic removal is allowed only without dependent learning records, which this checkpoint does not create. Permanent course deletion is deferred.

For create retries, save a fingerprint of the accepted initial payload. Same ID and fingerprint returns the existing result. Same ID with different payload returns 409. Compare against the saved fingerprint rather than mutable current fields, and verify ownership before returning anything. Concurrent duplicate creates must also converge on one record.

Use short interactive transactions for bootstrap, course plus topics creation, and outline replacement. Reads use HTTP. Ordinary edits can use one revision-guarded SQL update. Check affected rows. Do not replace transactional or conditional updates with unprotected read-then-write sequences.

## 5. Client integration and data preservation

Separate local and online modes at the composition root. Reuse existing UI where practical with online hooks and mutation services. Do not serialize the entire local reducer to the API.

Online mode supports sign-in, course library, course creation and settings, archive/restore, outline editing, and relevant preferences. Online Home can link to the course library. Until migrated, other online learning areas show a clear unavailable state instead of saving new activity locally under a cloud account.

Local mode retains existing routes and behavior. Preserve rawi.state.v1, restoration, migration, and export. Never run reset-demo as migration. Signing in must not upload local work. Explain that local work remains available in local mode until the later explicit import feature.

Show loading, saving, saved, failure, and conflict states. Preserve unsent text on save errors. Offer reload/review for conflicts instead of blind overwrite retries. Clear private cached data before displaying another account. Device theme may remain local with deliberate mapping if account preferences also store it.

## 6. Acceptance and handoff

Exercise affected behavior in the dev server using two development accounts where credentials are available. Record executed and blocked checks. No test or CI framework is requested.

1. npm install and npm run dev remain usable without backend credentials. Existing local work, course navigation, and export remain available.
2. Online mode reports missing configuration and never claims a local save reached Neon.
3. Google callback, session reload, sign-out, and subsequent sign-in work through the public development origin.
4. Concurrent bootstrap creates one workspace and preference record per user.
5. Courses and topics survive reload and a second browser session. Archive/restore and preferences work.
6. Another account cannot read or mutate copied course IDs, outlines, preferences, or nested topic links.
7. Two saves with one revision produce a success and conflict, preserving unsaved text.
8. Repeated create ID and fingerprint yields one course, while changed payload conflicts.
9. Sign-out and account switching never render the previous user's cached records.
10. API misses return JSON and SPA deep links load correctly.
11. Build and TypeScript checks cover client and Worker code. Client bundles and logs contain no secrets.

Commit coherent changes. Hand off changed files, migration commands, configuration names, actual verification, integration limitations, and the next checkpoint. If database or OAuth credentials were unavailable, distinguish implemented code from verified end-to-end completion. Do not create a fake session bypass to claim success.

## Agent kickoff prompt

Implement checkpoint 1 in BACKEND_IMPLEMENTATION_BRIEF.md. Treat README.md as the locked stack and BACKEND_PLAN.md as architecture context. Complete online accounts, courses, topics, and preferences while preserving the local prototype and browser data. Use designated development services if configured. Keep scope to this checkpoint, verify affected behavior in the dev server, commit coherent changes, and report actual results plus any external configuration that prevented integration verification.
