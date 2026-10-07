# Rawi

One full-stack learning workspace with bounded offline reading and draft recovery.
The authenticated account is the source of truth. New accounts start empty.

Requires Node.js 22.12+ and npm.

```sh
npm install
npm run dev
```

Development starts Vite at http://localhost:5173 and the Hono Worker API at
127.0.0.1:8788. `npm run dev:backend` is an alias for the same app. The designated
backend is configured in the ignored `.dev.vars`. Missing configuration shows an
unavailable screen. There is no local application, demo fallback or Node AI server.

## Stack

React and Vite, Cloudflare Workers Static Assets and Hono, Neon PostgreSQL,
Drizzle, Better Auth with Google sign-in, private R2 files, and Workers logs.
Keep credentials server-side. Use the existing designated development database
and bucket. Infrastructure provisioning and deployment are separate work.

The public development origin is `http://localhost:5173`, with Google callback
`http://localhost:5173/api/auth/callback/google`. `.dev.vars.example` documents the
existing bindings. File actions require the existing private R2 development
binding and scoped credentials. Text-only work does not require original files.

```sh
npm run db:generate
npm run db:migrate
npm run typecheck
npm run build
npx wrangler deploy --dry-run
```

Migration commands target the designated development database. No request handler
or app startup migrates or seeds. Applied migrations remain unchanged.
`npm run preview` serves the production build and proxies `/api` to the Worker.
For offline-shell checks, run the Worker and preview on the same public origin.
The service worker is installed only by production builds, not Vite development.

## Learning

Courses include reviewed syllabus outlines, materials with immutable versions and
passages, notes, nine-format practice, resumable runs, immutable attempts, exam
rehearsals, tutor records and summaries. The workspace includes planning,
availability, check-ins, progress, history filters, search, reminders and settings.

Canonical routes include `/courses`, `/course/:id`, `/planner`, `/history`,
`/materials/:id`, `/sets/:id`, `/runs/:id`, `/attempts/:id` and `/tutor/:id`.
Old `/online` links redirect with IDs, query parameters and fragments intact.

Server rules own answer eligibility, section activation, exam deadlines and
submission. No exam feedback appears before whole-paper submission. Pending
written feedback does not lower graded totals. Feedback revisions retain their
recorded model and rubric feedback.

Hosted AI execution and streaming are unfinished. Saved blocked requests do not
mean a tutor replied, questions were generated or written work was graded.
The existing prompts, validators and provider reference code remain available
for integration. PDF, DOCX and PPTX originals can be stored, but extraction is
not implemented. Text and Markdown are readable.

## Offline and device recovery

After an online visit, the production app can reopen cached deep links. It uses
versioned Cache Storage for public assets and IndexedDB for selected account views
and eligible material, note, answer and tutor-message drafts. It never caches API
requests wholesale, authentication, bearer URLs or account exports.

Private reading requires a successful session check within 24 hours. Viewed
snapshots expire after seven days and have a 50 MiB budget with recent-view
eviction. Individual snapshots and drafts are limited to 2 MiB. Protected drafts
have a separate 10 MiB budget and are never evicted for reading space. Cached
history is limited to 100 entries and planner sessions to 200. Original files
need a connection. No originals are downloaded automatically.

Mutations require the backend. Recovered drafts require explicit saving, with
review when the captured revision differs. A device recovery message does not
mean submitted or graded. A storage failure offers an export instead of claiming
recovery. `/storage` shows usage and lets you clear snapshots without losing drafts.
Sign-out offers a draft recovery download and clears private device storage across
tabs. Offline sign-out locks immediately and finishes server sign-out on reconnect.

Updates wait until existing tabs close. Save or export drafts before closing tabs
to install an available update. A first visit cannot work without a connection.
Remote session revocation cannot be detected while disconnected.

## Development seed and legacy recovery

Fictional course bodies exist only in `dev/fixtures`. Manually seed an explicit
existing development workspace, whose ID is returned by `/api/v1/me`:

```sh
npm run db:seed -- --target EXISTING_DEVELOPMENT_WORKSPACE_ID
```

In Windows PowerShell, use `npm.cmd` for this command if the npm PowerShell shim
consumes the argument separator. The command checks the designated `.dev.vars`
development target and uses the validated import transaction. Stable fixture
content and seed provenance make repeats idempotent. It neither replaces edited
records nor resets history. Fictional activity is labelled and contains no fake
completed provider replies. Startup, sign-in and migrations never seed.

`/data` offers explicit recovery of `rawi.state.v1`, reviewed legacy state-version-2
imports and reviewed account-archive restoration. It preserves originals and
remaps references. Exact readable archive versions and feedback revisions are
restored. Unfinished practice becomes validated account practice. Active archived
exams cannot establish a new server timer. Review lists unsupported records,
including source-file bytes and provider execution records. Older state-version-1
browser data remains downloadable for manual recovery. No browser original is
removed without an explicit discard action.

See [FULLSTACK_HANDOFF.md](FULLSTACK_HANDOFF.md) for actual verification,
remaining application limits and external dependencies.
