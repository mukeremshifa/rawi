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
designated development database. Startup never migrates. The schema was reset
for the materials pipeline, so `drizzle/0000_baseline.sql` is the one applied
migration. Applied migrations remain unchanged from here on.

## Layout

- `src/client`: the React app. `app/` holds the shell (sidebar, header,
  command menu, reminders), routing and sign-in, `features/` holds one folder
  per area of the product, `components/` holds the layout, states and the
  `ui/` kit, and `lib/` holds the API client, account context and data layer.
  Server state goes through TanStack Query: `lib/query.ts` has the client and
  path-shaped keys, `lib/data.ts` has `useApi`, `useApiPages`, `useApiAll`
  and `useSave`. Design tokens live in `styles/globals.css`. In development,
  `/dev/kit` shows every kit component in both themes.
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

Courses include an outline worked out from their documents, versioned materials, nine-format practice, resumable runs, immutable attempts, exam rehearsals and
tutor records. Planning, availability, check-ins, history, search and reminders
use the same authenticated workspace. Old `/online` links redirect to canonical
routes with their references intact.

The server enforces ownership, revisions, answer eligibility, section activation,
deadlines and submission. Exams show no feedback before whole-paper submission.
Pending written feedback does not lower graded totals.

The tutor streams grounded, cited replies. Practice can generate checked
question sets from a topic or material. Written answers in an attempt are
marked together against their rubrics, and every other format is marked by
rules. See AI below.

## Materials

An upload goes to private R2, then through a conversion adapter into blocks
that Rawi owns (`src/shared/contracts/document.ts`): headings, paragraphs,
lists, tables, equations, figures, code and quotes, with typed inline spans
and source pages. Nothing is editable after conversion, and the original
stays downloadable. Pasted text, `.md` and `.txt` use the Markdown adapter
at publish time. PDF, DOCX and PPTX are published as pending and converted
by Datalab in the background: `waitUntil` after upload, the version status
read the Reader polls, and the cron sweep. Raw responses and extracted
images are stored in R2. Images are served by an authorized Worker route.

Add material opens on files. Files dropped on the Materials page or chosen
in the sheet need only a title, prefilled from the filename, and a file that
is already an original in the course is flagged before it moves. Up to 10
files go into a client queue above the routes, at most 3 transferring at
once, each asking for its ticket just before its transfer. A tray and the
table show progress, and each file toasts once when it is readable. The
queue is memory only: a closed tab loses unsent files, and their tickets
expire. A finished result that fails to save twice marks the version
failed, and the cron sweep removes extracted images that no block shows.

Put `DATALAB_API_KEY` in `.dev.vars`. Without it those uploads keep their
original and show a conversion failure that can be retried once the key is
set. Questions, tutor sessions and tutor replies cite
`{ materialId, versionId, blockIds }`, and the Reader opens
`/materials/:m/versions/:v#block-:id`. Every ready version is also read into
the knowledge layer described under AI.

## Course outline

A course starts with a name. Its page has two drop targets: the syllabus,
one per course, and materials. Everything hangs off block, section and
topic. A section is a heading and the blocks under it, or the lead before
the first heading. A topic has a title, order, week or unit label, a short
summary and the blocks it came from.

Outline jobs (`src/server/services/outline/`) run like conversions: from
`waitUntil`, from the outline status read and from the cron sweep, under a
lease, one outline job per course at a time. A ready syllabus is read into
8 to 20 topics and its assessments. Every other ready material is mapped
section by section to topics, which gives Covers in the Reader and Where to
read on the course page. Without a syllabus, two ready materials draft an
outline from titles and headings. Every item a job keeps cites blocks of
that version. A re-read reuses topic ids and never renames or removes a
topic the student changed or has work on. Corrections apply in place with
Undo. Questions and tutor sessions take their topic from their section, and
work with no topic shows under its material as Not in the outline.

Outline jobs run as engine tasks. When no vendor is configured, the
allowance is spent or the models fail their checks, a rules pass reads
tables, headings and lists instead and the outline says so.

## AI

One engine in `src/server/ai/` serves every AI task. Features call a task and
never name a model. A task declares its context builder, output schema and
check, output cap, cache policy, service tier and the route lists it escalates
through. The router picks the first healthy route allowed by the plan, and a
failed check moves to the next list. Routes, prices and the lists themselves
live in `catalog.ts`, chosen from `dev/compare.ts` measurements.

- Vendors: AWS Bedrock and Google Vertex, through small `fetch` adapters that
  run on Workers. Put the credentials described in `.dev.vars.example` in
  `.dev.vars`. Anthropic and OpenAI models on Bedrock refused calls from the
  development machine as an unsupported country, so none is routed.
- Meter and trace: every provider call is a row in `ai_calls`, reserved from
  the task's output cap before sending and settled from usage by class after.
  An uncertain outcome stays charged and is never retried automatically.
- Plans: limits and allowed vendors are rows in `ai_plans`. The `default` plan
  allows $2 a day and $20 a month per workspace, and `platform` caps all
  workspaces together. `/ai/status` reports whether a request would be refused.
- Knowledge layer: each ready version is read once by an ingest job into
  chunks with full-text search and pgvector embeddings, section summaries and
  key terms, atomic facts and figure descriptions, all citing its blocks. A
  newer version supersedes the job. Background work uses the vendors'
  discounted flex lane where a route offers it.
- Tutor: replies stream from `/tutor/:id/reply`, built from the focus section
  and a few retrieved passages. Vector search runs only when text search is
  weak, and when nothing relevant is found the tutor says so without a model
  call. Older turns are summarised.
- Questions: checked pool questions keyed by version, section, format,
  difficulty and prompt version are reused first. The shortfall is written,
  checked by rules and a second cheap reader, and stored with its verdict.

Run `npx tsx dev/compare.ts` to compare routes on the fictional fixtures. A full
run costs about five cents.

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

The seed uses domain services and atomic validated historical writes. Fixture
text goes through the Markdown adapter, and question sources and authored
tutor citations resolve to block ids by section heading. Four small
originals use the designated R2 binding through the normal upload lifecycle
and convert through Datalab when the key is set. A fourth sample course
has the syllabus in `dev/fixtures/syllabus.md` as its syllabus material,
and the seed runs its outline jobs.
Authored tutor replies and written feedback carry Sample labels with no provider
operations or charges. No fixtures or seed entry points ship in client or Worker
bundles. Nothing seeds during startup, migration, onboarding or sign-in.

## Remaining work

- AI hardening: pedagogy and edge cases in tutor, generation and grading,
  stopping a reply partway, and the latency of the reply path, which makes
  about two dozen database round trips before the model starts.
- Deferred AI: Arabic prompts and search, voice, chart specs, shared question
  pools and organisation policy. Language, audio units and cache keys are
  already carried for them.
- Deferred from the redesign: illustrations and brand art, a canvas or topic
  map, and native mobile patterns beyond the responsive layout.
- Latency: planner and progress reads run their queries one after another
  inside a socket transaction. Batching them would cut seconds per load.
- Browser check of the failed sign-out message. Sign-in, protected routes,
  cross-tab sign-out, autosave failure and retry, all nine answer controls,
  material-editor drafts and storage retirement were checked on 8 October 2026.
