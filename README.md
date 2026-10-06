# Rawi

A local prototype of a study workspace: several courses, each with its own
readings, tutoring, practice and exam rehearsal, planned across all of them.

Requires Node.js 22.12+ and npm.

```sh
npm install
npm run dev
```

`npm run dev` starts the page on http://localhost:5173 and a small local API
on 127.0.0.1:8787. The page opens and saved work stays usable without any AI
configuration: AI actions say what is missing instead.

## Chosen backend stack

Decision recorded on 4 October 2026. Local mode uses the Node API and browser
storage described below. Explicit online mode now saves courses, materials,
practice, exam rehearsals, planning and learning history to the account. The
coordinated migration is still in progress. See FULLSTACK_HANDOFF.md for actual
verification and remaining gaps.

| Responsibility | Choice |
| --- | --- |
| Frontend | Existing React and Vite, hosted with Cloudflare Workers Static Assets |
| API and AI streaming | Hono on Cloudflare Workers |
| Database | PostgreSQL on Neon |
| Queries and migrations | Drizzle with the Neon serverless driver |
| Authentication | Better Auth hosted in the API, with records in Neon, Google sign-in first |
| Files | Private Cloudflare R2 storage with authorized, short-lived upload and download URLs |
| Initial monitoring | Workers logs and metrics |

Use the Neon driver's HTTP interface for single queries and non-interactive
transactions, and its WebSocket client when interactive transactions are needed.
The API enforces ownership and keeps database and AI credentials server-side.
Persist answers before grading, preserve cited material versions, and move AI
spending reservations into database transactions. Track uploads with explicit
pending, ready and failed states because R2 and Postgres do not share a transaction.

Add Cloudflare Workflows when a feature needs durable background processing.
Defer Hyperdrive, separate vector storage and heavy document-processing compute
until measured needs justify them. AI provider and model selection remain
separate from the infrastructure decision. Vertex AI remains the prototype's
current integration.

The main tradeoff is low initial infrastructure overhead in exchange for managing
authentication and integration across Cloudflare and Neon. Select the Neon region
and Worker placement using measurements from UAE networks. This decision does not
promise UAE data residency or free hosting at a particular user count.

Keep `npm install` and `npm run dev` usable throughout the migration, and preserve
existing saved work. Provisioning and production deployment remain later work.

## Online development

Open `/online`, or choose **Local mode** in the workspace header to switch.
The modes have separate composition roots. Signing in never uploads or replaces
`rawi.state.v1`. Existing restoration, migration and export remain in local mode.
Online mode includes versioned materials, all nine saved question formats,
resumable practice, immutable attempts, server-timed rehearsals, planner review,
progress, search and in-app reminders. The navigation uses the existing product
rail. Online mode remains explicit while full feature parity is unfinished.

For online development, copy `.dev.vars.example` to the ignored `.dev.vars`
and fill in `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Use a designated development
Neon database and a random auth secret of at least 32 characters. No service
is provisioned automatically. No credentials are needed for local mode.

Set `BETTER_AUTH_URL=http://localhost:5173`. Register that origin and the exact
Google callback `http://localhost:5173/api/auth/callback/google`. Production
uses the HTTPS application origin and its `/api/auth/callback/google` path.
Google sign-in uses basic identity scopes, with no school-domain restriction
or Drive permissions.

```sh
npm run db:generate
npm run db:migrate
npm run dev:backend
```

Generation is offline. Review `drizzle/*.sql` before applying it. `db:migrate`
reads `DATABASE_URL` from `.dev.vars` or the shell and applies the committed
auth and application migration history. Run it only against the designated
development database. Request handlers never migrate, and schema push is not
used. `dev:backend` builds the static assets, starts the Worker on 8788 and
proxies Vite's public origin to it. Stop `npm run dev` before starting it because
both use port 5173. Use `npm run dev` for the local AI prototype.

The online UI keeps unsent edits in memory on save failure. Revision conflicts
require reviewing the latest record before saving again. Learning and material
drafts warn before navigation and offer recovery copies where applicable.
Unacknowledged work is not saved across reloads. Account changes clear online
memory. Practice defaults and reminder preferences apply to online features.

`/online/data` exports a versioned account archive and reviews local version 1
exports before importing. Imports add remapped records atomically and deduplicate
identical files. Unsupported records are listed before confirmation and retained
in the original recovery archive. No import removes or replaces local data.
Online archive restoration remains unfinished.

Hosted tutor replies, question generation and written grading are blocked. Their
requests are saved, with no provider call or charge. Neon reservation, partial
checkpoint and structured publication functions exist, including immutable
feedback revisions. A Worker-compatible Vertex authentication and execution
adapter, tutor streaming and cancellation still need integration. Local ADC and
the Node AI server are not used as substitutes for hosted execution.

`npm run typecheck` covers the client, local server and Worker.
`npm run worker:types` regenerates runtime types. The Worker compatibility date
matches the pinned runtime's October 1 release. `npx wrangler deploy --dry-run`
checks packaging without deploying. See [checkpoint verification](BACKEND_CHECKPOINT_1.md)
for executed checks and the external configuration still needed.

## Online materials: checkpoint 2

Each online course has a Materials library for pasted text and private source
files. Text and Markdown are readable. PDF, DOCX and PPTX are stored for download
with an explicit notice that text has not been extracted. Edits create immutable
versions and passage links. Archive preserves history and originals.

The development bucket is `rawi-materials-development`, bound as
`MATERIALS_BUCKET` with `remote: true` in `wrangler.jsonc`. It must stay private.
The remote development binding requires a Wrangler login. For text-only
development without Cloudflare access, set that binding's `remote` to `false`.
The target check prevents mixing local storage with real signed upload URLs.
File actions also need server-only `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`,
`R2_ENVIRONMENT`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` in `.dev.vars`.
Use an Object Read & Write token scoped to this bucket. Pasted text, courses
and sign-in remain available without those file credentials.

The `_rawi/environment` object must contain
`ACCOUNT_ID/BUCKET_NAME/ENVIRONMENT`. Before signing file access, the API reads
that marker through both the binding and signed endpoint to verify the target.
The development marker and exact-origin CORS are configured. To reapply CORS:

```sh
npx wrangler r2 bucket cors set rawi-materials-development --file server/backend/r2-cors.json
```

Add the exact application origin to that file when a hosted development origin
is chosen. Do not use wildcard origins or enable public bucket access. Upload
and download URLs expire within five minutes and are never saved in browser
storage. Originals download as attachments. Basic file validation is not malware
scanning. Text is limited to 1 MiB, originals to 25 MiB each, stored originals to
1 GiB per workspace, and pending uploads to five. `.dev.vars.example` lists
optional limits. Archived and historical originals count toward storage.

The scheduled handler reconciles up to 25 records per maintenance phase every
15 minutes when deployed. While `npm run dev:backend` is running, invoke
`http://127.0.0.1:8788/cdn-cgi/local/scheduled` to run it again.
It releases expired reservations and fences cleanup of tracked abandoned
objects after a one-hour grace period. No bucket-wide deletion scan is used.
Local development requires manual scheduled invocations for ongoing cleanup.
See [checkpoint 2 verification](BACKEND_CHECKPOINT_2.md) for actual results and
remaining configuration. No production deployment is part of this checkpoint.

## AI setup (Vertex AI)

Tutoring, question generation and written feedback call Gemini on Vertex AI
through the local API, using Application Default Credentials. No key or
credential ever reaches the browser.

1. In a Google Cloud project with billing linked (and the credits applied to
   that billing account), enable the Vertex AI API:
   `gcloud services enable aiplatform.googleapis.com --project=PROJECT_ID`
2. Give your account the Vertex AI User role (`roles/aiplatform.user`).
3. Log in for local credentials: `gcloud auth application-default login`
4. Create `.env.local` in the project folder (Git ignores it):

   ```
   GOOGLE_CLOUD_PROJECT=PROJECT_ID
   GOOGLE_CLOUD_LOCATION=global
   ```

5. In Cloud Billing, add a budget for the project, and a spend cap on the
   Vertex AI service where your account supports one. A budget alone only
   sends alerts. It does not stop spending.

Restart `npm run dev` after changing `.env.local`.

**Models.** `gemini-3.8-flash` at `LOW` thinking for everything, set by
`RAWI_MODEL` and `RAWI_THINKING_LEVEL`. `gemini-3.5-flash-lite` is available
for chosen tasks with `RAWI_LITE_TASKS` (any of `tutor`, `generate`, `grade`).
The model that actually answered is stored with every tutor turn, generated
question and piece of feedback. Nothing falls back to another model.

**Budget.** The API keeps a ledger in `.rawi/ledger.json` with each request's
tokens and estimated cost. It allows $5 a day and $80 in total by default
(`RAWI_DAILY_BUDGET_USD`, `RAWI_TOTAL_BUDGET_USD`), and reserves each
request's worst case before sending it, so parallel requests cannot overrun
the allowance. Prices default to $0.75 input and $3.75 output per million
tokens for 3.8 Flash (the introductory rate, which the ledger raises to $1.50
and $7.50 from 2027) and $0.30 and $2.50 for 3.5 Flash-Lite. Output includes
thinking tokens. These are estimates, not your credit balance. Other limits:
`RAWI_MAX_CONCURRENT` (2), `RAWI_MAX_RETRIES` (1), `RAWI_MAX_INPUT_TOKENS`
(16000), and `RAWI_MAX_OUTPUT_TUTOR`, `_GENERATE`, `_GRADE`. Nothing is
generated in the background.

## What the AI does, and what stays deterministic

**The tutor** answers from a bounded context: the passage a session was
opened from, passages linked to the topic or sharing its words, the recent
conversation and a line or two about earlier work. Course material is sent as
data, never as instructions. Citations are checked against the passages that
were sent before they become links, and each reply says whether it rests on
your material, goes beyond it, or found the material insufficient. Replies
stream, can be stopped, and a cut-off reply is saved and labelled as
incomplete. A failed request saves your message and offers a retry. There is
no scripted fallback.

**Practice** can be drawn from the question bank or generated from a course's
readable material as flashcards, multiple choice or written recall. The
server and the page both check answer keys, option indices, rubric totals,
topics, sources and course ownership, and only questions that pass are saved,
with the model and material they came from. A saved set keeps its questions,
so reopening it or attempting it again never generates anew.

**Written answers** get AI feedback per rubric point, judged on meaning. The
answer is saved first and marked afterwards, so a failed request loses
nothing and can be retried from the results page. An answer waiting for
feedback counts neither for nor against progress. Exams still show no marks
or feedback until the whole paper is submitted. Written grades from earlier
versions, which matched keywords, are kept as recorded and labelled.

Objective marking, the planner, evidence levels and the syllabus reader are
unchanged rules with no model involved. The prototype reads plain text and
Markdown only. A file it cannot read is recorded as a placeholder and is never
sent as course content.

## The seeded courses

Opening the app for the first time offers a choice: explore two fictional
courses or start with an empty workspace. The demo contains "The Atlantic
World, 1500–1800" and "Statistical Inference for Social Research", with thirteen
readings, a question bank across nine formats, four planned assessments and a
fortnight of history. Returning to `/welcome` preserves established work.

An earlier build also added a CENG 401 course to every workspace. That no
longer happens. A workspace that already holds it keeps all of it, including
its materials, questions, sets, attempts and tutor sessions, because those were
already stored in the browser.

## Areas

Above the courses:

- **Home**: today's planned work across courses, upcoming assessments, resume
  actions, streak and recent activity.
- **Courses**: every course with its status, plus create, open and archive.
- **Planner**: a weekly calendar and a daily list of the same sessions,
  availability, manual scheduling, and a simulated "Plan my week" you review
  before applying.
- **Progress & history**: activity across courses, per-course breakdowns, and
  a chronological history with filters.

Inside a course:

- **Overview**: this course's suggested work with the reason for each, its next
  assessment, and a check-in that changes what is suggested.
- **Syllabus & topics**: paste a syllabus, read a .txt/.md file, or build a
  week-by-week outline, reviewed and confirmed before topics are created.
- **Materials**: readings and notes. Select a passage to ask the tutor, save a
  note, or practise the topic.
- **Tutor**: AI sessions moving through orient, understand, recall, reason,
  apply and reflect, with hints, examples, checks and a summary.
- **Practice**: name a set, draw it from the bank or generate it from your
  materials, and it is saved. Flashcards, quizzes,
  written recall, source analysis and essays, with attempts that survive a
  reload and repeat attempts kept separate.
- **Exams**: planned assessments with their real dates, plus rehearsal
  configurations and a timed exam workspace. **Nothing is marked and no feedback
  appears until the whole paper is submitted.**
- **Progress**: topic evidence, recurring mistakes, and the attempts behind
  every indicator.

## Local data

State is kept in `localStorage` on this device and survives a reload. Data
written by the previous single-course version is upgraded in place: its exam
date becomes a planned assessment and its daily study time becomes planner
availability. A saved practice set from that version stored only its settings,
and it is resolved against its own course's questions on upgrade so that it can
actually be opened. An unfinished exam from that version cannot resume under the
current exam rules, so it is kept and offered as a download with the reason
stated rather than dropped. Data that genuinely cannot be read is reported with
the option to download it, never silently replaced.

Setup and activity drafts also survive navigation and reload. A save failure
stays visible with retry and export options. Settings offers versioned workspace
export and validated import, plus local profile, study, appearance and reminder
preferences. Reminders appear inside the app while it is open. They do not send
email or operating system notifications.

Materials can be edited and archived. Earlier cited passages remain available
when an edit changes their text. Saved sets, tutor sessions and rehearsals have
course-specific libraries with search, archive, rename and restore controls.
Answer review sends the tutor the saved response, key, feedback, marks and
assistance used. Review practice and planned remediation keep links to that
attempt. Pending written feedback is never presented as a grade.

**Reset demo**, in Courses, clears everything, including courses you added, and restores the two sample courses.

## Layout

- `server/`: the local API: Vertex AI calls, prompts, validation and the
  spending ledger.
- `server/worker.ts` and `server/backend/`: online auth, scoped services and API.
- `drizzle/`: the shared auth and application migration history.
- `src/client/online/`: online account boundary and course, outline and preference screens.
- `src/shared/`: domain types, the API contract, AI context building, marking,
  progress derivation, the planner and the syllabus reader.
- `src/shared/course/`: the two sample courses and their question banks.
- `src/client/store/`: the local state tree, its migration, and course scoping.
- `src/client/features/`: home, courses, planner, history, and the per-course
  areas.
- `src/client/components/`: layout vocabulary, UI primitives, design tokens.

`npm run build` creates a static preview of the page, and `npm run preview`
serves it without the API. Database migration commands and Worker configuration
are included for checkpoint 1. No tests or CI have been added.
