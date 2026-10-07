# Rawi

One account-based learning app. Google sign-in opens a personal workspace backed
by Neon and private R2 files. New accounts start empty. A connection is required.
[ACCOUNT_APP_IMPLEMENTATION_BRIEF.md](ACCOUNT_APP_IMPLEMENTATION_BRIEF.md) is the
active product brief.

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
Temporary retirement code in `src/client/retire-storage.ts` and `public/sw.js`
removes the previous Rawi caches, offline database and known legacy keys without
clearing unrelated storage or session cookies. Open tabs are never forced to
reload. See the handoff for transition limits.

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

Fictional course bodies live only in `dev/fixtures`. Seed an explicit existing
development workspace, whose ID is returned by `/api/v1/me`:

```sh
npm run db:seed -- --target EXISTING_DEVELOPMENT_WORKSPACE_ID
```

Use `npm.cmd` in PowerShell if its npm shim consumes the argument separator.
The command checks the designated development target and uses internal validated
import utilities. Repeats preserve user edits and history. Those utilities have
no public transfer endpoints. No fixtures ship in the browser or Worker bundle.

See [FULLSTACK_HANDOFF.md](FULLSTACK_HANDOFF.md) for actual checks, verification
limits and remaining AI and extraction work.
