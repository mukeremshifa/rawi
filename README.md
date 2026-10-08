# Rawi

One account-based learning app. Google sign-in opens a personal workspace backed
by Neon and private R2 files. New accounts start empty. A connection is required.

Requires Node.js 22.12+ and npm.

```sh
npm install
npm run dev
```

Development starts Vite at http://localhost:5173 and the Hono Worker API at
127.0.0.1:8788. `npm run dev:backend` is an alias for the same app. Use the
designated backend in the ignored `.dev.vars`. Missing configuration produces
an unavailable screen. Startup and sign-in never seed a workspace.

## Stack and development

React and Vite, Cloudflare Workers Static Assets and Hono, Neon PostgreSQL,
Drizzle, Better Auth with Google sign-in, private R2 files, and Workers logs.
Keep credentials server-side. Infrastructure and deployment are separate work.
The public development origin is `http://localhost:5173`, with Google callback
`http://localhost:5173/api/auth/callback/google`. Existing bindings are described
in `.dev.vars.example`. Text-only work does not require original-file storage.

```sh
npm run typecheck
npm run build
npx wrangler deploy --dry-run
```

`npm run preview` serves the production build and proxies `/api` to the Worker.
Schema changes use `npm run db:generate` and `npm run db:migrate` against the
designated development database. Startup never migrates. Applied migrations
remain unchanged.

## Layout

- `src/client`: the React app. `app/` holds the shell, routing and sign-in,
  `features/` holds one folder per area of the product, `components/` holds
  shared UI and `lib/` holds the API client, account context and data hooks.
- `src/server`: the Hono Worker. `worker.ts` is the entry point, `app.ts`
  applies middleware and mounts `routes/`, which call `services/`. The
  database client, schema and migration runner live in `db/`.
  `api-types.ts` is the only server file the client may import, types only.
- `src/shared`: code used by both sides. `contracts/` holds request schemas
  and response shapes, `domain/` holds pure learning logic.
- `dev`: the development seed and its fictional fixtures.
- `drizzle`: generated migrations.

## Accounts and saving

Protected links preserve their path, query and fragment through Google sign-in.
New learners choose a display name and study defaults, then enter their empty
workspace. Account settings separate the Better Auth profile from study and
appearance preferences. Google manages the sign-in email.

Private screen state and unsaved edits stay in memory. Saved means acknowledged
by the server. Failed saves retain the current input and retry details while the
page stays open. Leaving, reloading or signing out warns about unsaved work.
Sign-out must reach the server and invalidates other open tabs. Connectivity
failures do not establish sign-out or open a cached account.

There is no offline workspace, device-storage screen or JSON import/export flow.
Original uploaded files remain available through authorized material downloads.
Temporary retirement code in `src/client/app/retire-storage.ts` and `public/sw.js`
removes the previous Rawi caches, offline database and known legacy keys without
clearing unrelated storage or session cookies. Open tabs are never forced to
reload. Remove both files and the `/sw.js` no-store header together once
returning-browser retirement has been checked and old installations are gone.

## Learning

Courses include syllabus outlines, versioned materials and passages, notes,
nine-format practice, resumable runs, immutable attempts, exam rehearsals and
tutor records. Planning, availability, check-ins, history, search and reminders
use the same authenticated workspace. Old `/online` links redirect to canonical
routes with their references intact.

The server enforces ownership, revisions, answer eligibility, section activation,
deadlines and submission. Exams show no feedback before whole-paper submission.
Pending written feedback does not lower graded totals.

Hosted AI execution and streaming remain unfinished. Blocked requests do not
mean questions were generated, a tutor replied or written work was graded.
PDF, DOCX and PPTX originals can be stored, but extraction is not implemented.
Text and Markdown are readable.

## Development seed

Fictional source fixtures live in `dev/fixtures`. Seed an explicit existing
development account after applying the reviewed migrations:

```sh
npm run db:seed -- --email mukerem.dev@gmail.com
```

PowerShell users should use `npm.cmd run db:seed -- --email mukerem.dev@gmail.com`
if the npm shim consumes the argument separator. `--target WORKSPACE_ID` is also
supported. Exactly one existing identity must resolve. Missing accounts must sign
in once, the seed never creates Google identities or sessions.

The current dataset is `rawi-account-v2`. Its persisted date anchor and learner
timezone keep repeat runs on the same timeline. A scoped manifest preserves edits,
archives and progress, and reports changed records. Legacy `rawi-fictional-v1`
imports remain intact. The new sample lab is distinctly named and does not replay
that import envelope. Untouched empty planner defaults can receive availability.

The seed uses domain services and atomic validated historical writes. Four small
originals use the designated R2 binding through the normal upload lifecycle.
Authored tutor replies and written feedback carry Sample labels with no provider
operations or charges. No fixtures or seed entry points ship in client or Worker
bundles. Nothing seeds during startup, migration, onboarding or sign-in.

## Remaining work

- Hosted AI: tutor replies, question generation, written feedback grading and
  streaming. Blocked operation records are not completed AI output.
- Text extraction from PDF, DOCX and PPTX originals.
- Drop the unused `courses.accent` column and the `accent` preference value.
  The interface no longer shows course or workspace colours.
- Latency: planner and progress reads run their queries one after another
  inside a socket transaction. Batching them would cut seconds per load.
- Browser check of the failed sign-out message. Sign-in, protected routes,
  cross-tab sign-out, autosave failure and retry, all nine answer controls,
  material-editor drafts and storage retirement were checked on 8 October 2026.
