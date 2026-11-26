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
The R2 binding is remote in development, so `wrangler` must be logged in. The
first upload after a long idle can fail once while the binding reconnects, and
Retry then succeeds.

```sh
npm run format
npm run typecheck
npm run build
npx wrangler deploy --dry-run
```

`npm run preview` serves the production build and proxies `/api` to the Worker.
Schema changes use `npm run db:generate` and `npm run db:migrate` against the
designated development database. Startup never migrates. The schema was reset
for the restructure, and `drizzle/0000_baseline.sql` is the baseline that
later migrations follow. Applied migrations remain unchanged.

## Layout

- `src/client`: the React app. `app/` holds the shell (sidebar, header,
  command menu, reminders), routing and sign-in, `features/` holds one folder
  per area of the product, `components/` holds the layout, states and the
  `ui/` kit, and `lib/` holds the API client, account context and data layer.
  Server state goes through TanStack Query: `lib/query.ts` has the client and
  path-shaped keys, `lib/data.ts` has `useApi`, `useApiPages`, `useApiAll`
  and `useSave`. Design tokens live in `styles/globals.css`. In development,
  `/dev/kit` shows every kit component in both themes. Feature pages load on
  first use, and so does KaTeX, which sets formulas in materials, questions and
  tutor replies.
- `src/server`: the Hono Worker. `worker.ts` is the entry point, `app.ts`
  applies middleware and mounts `routes/`, which call `services/`. The
  database client, schema and migration runner live in `db/`.
  `api-types.ts` is the only server file the client may import, types only.
- `src/shared`: code used by both sides. `contracts/` holds request schemas
  and response shapes, `domain/` holds pure learning logic.
- `dev`: the development seed, its fictional fixtures and `measure.ts`.
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

## How it fits together

Everything starts from material. A version is read into sections and facts,
sections are linked to topics, and practice and the tutor work on a scope.
Model calls are few and checked, and code does whatever it can.

## Materials

An upload goes to private R2, then through a conversion adapter into blocks
that Rawi owns (`src/shared/contracts/document.ts`): headings, paragraphs,
lists, tables, equations, figures, code and quotes, with typed inline spans
and source pages. Nothing is editable after conversion, and the original
stays downloadable. Pasted text, `.md` and `.txt` use the Markdown adapter
at publish time. PDF, DOCX and PPTX are converted by Datalab in the
background. Put `DATALAB_API_KEY` in `.dev.vars`. Without it those uploads
keep their original and show a conversion failure that can be retried once
the key is set.

Up to 10 files go into a client queue, at most 3 transferring at once. The
queue is memory only, so a closed tab loses unsent files. Questions, tutor
replies and topics cite `{ materialId, versionId, blockIds }`, and the Reader
opens `/materials/:m/versions/:v#block-:id`.

## Reading and topics

Every readable version gets an ingest job (`services/knowledge/`) in stages:
structure, embed, digest, figures and repair. Structure splits the version
into sections keyed by heading path, each with a content hash, and takes
facts code can see. Digest writes a summary, key terms and typed facts with a
confidence for each section. A replaced version digests only the sections
whose hash changed and copies the rest. Prerequisites between sections are
worked out in code from defined terms and references to earlier parts.

A syllabus, one per course, is read into 8 to 20 topics and its assessments.
After each version is read, `assign_topics` links its sections to the topics
they cover or mention, and proposes new topics when substantial sections teach
something no topic names. That is how a course without a syllabus gets its
outline and how a midway upload adds topics. New topics are linked by title.
Work out topics again on the course page links every section once more. In a
course without a syllabus, when one topic takes most of a batch while there is
room for more, often a broad topic the student protected, the model reads
those sections once more without it, so the subjects inside can become topics.
Corrections apply in place with Undo, and a re-read never renames or removes
a topic the student changed or has work on.

Jobs run from `waitUntil`, from the course status read and from the cron
sweep, under a lease. One pass runs topic jobs, then reading, then the topic
links reading queued.

## Scopes

A scope (`services/scopes.ts`) is a topic, a set of sections, an assessment,
the whole course or one material. Topic and assessment scopes resolve to
their sections when used, so a new upload joins them without a rebuild.

## Questions

There is one bank per workspace (`services/questions/`), keyed by material,
section and content hash rather than by scope, so any scope draws on it and a
replaced version keeps the items of its unchanged sections.

- Code builds cloze, flashcards, matching, ordering and multiple choice on
  definitions and numbers from facts, at no cost.
- A model writes multiple choice for other facts, numeric templates and
  self-checks. A numeric template is checked once, then code fills in fresh
  values and computes the answer each time. A second reader solves every
  written item from its source before the key is compared, and judges
  multiple choice wrong answers that can be ruled out without the material.
- A practice run starts at once from the bank and what code can build. What
  only a model can write joins the run as it passes its checks, and the run
  says how many could not be written. The kinds ticked share the run equally.
- Exam rehearsals draw from the same bank and show no feedback before the
  whole paper is submitted.
- Every format is marked by code, except flashcards and self-checks, which the
  student marks against the answer.

## Learner model

Mastery is read per section from marked answers (`shared/domain/mastery.ts`)
and is never stored. Each local day with a right, unaided answer moves the
section's next review out (1, 3, 7, 16, then 35 days), and a day with a wrong
answer brings it back to tomorrow. Hinted or partly right answers hold it, and
self-marked answers do not count. A section reads as not checked, shaky,
learning or secure. A topic is due when a section it introduces or covers is
due, and that drives review suggestions, the planner and review reminders. The
tutor sees each level in the scope, what is due and the prerequisites the
student has not shown, and asks most about shaky sections. Topic readiness
shows a topic's mastery from its sections, tutor questions included, beside
its exam evidence, which counts only unaided exam work as independent. The two
are kept apart on purpose. The planner and the home suggestions decide what
is weak from mastery, so unaided practice counts there, and a close assessment
still asks for a timed rehearsal.

## Tutor

`POST /tutor/:id/ask` saves the question and streams the reply in one
request. Retrieval searches the course with text first and vectors when text
leaves the question's terms uncovered, then judges the evidence sufficient,
partial or absent. Absent is answered without a model call. An answer from
outside the session's scope is labelled so. Stop ends a reply within a second
and keeps what arrived. A reply whose Worker went away is settled the next
time the session is read.

Check my understanding, or Ask me a question, poses a question from the bank
on the session's scope, or on the section the session started from, weighted
toward sections the student missed lately. No model is called. The student
answers and checks it in the conversation, and code marks it as a tutored
result in the session's own run, which practice does not list. The next turns
see the question and its result. While it is unanswered, every reply is held
back until it is known not to give the answer away. Talk me through it
searches for the question and its answer. A model writes a check only when
the bank has nothing for the session.

Every open session offers one next step, chosen by code from the learner model
and the turns so far (`services/guide.ts`): a review question when part of the
scope is due, talking through a wrong answer, explaining the weakest section
and then checking that section, and wrapping up after five questions. It reads
each step from the action saved with the turn, not from its wording. The
student can ask anything instead. Study with the tutor, on the home page's next
suggestion, starts a guided session whose first message says what it will work
on and why. An ended session shows its next review date.

Each course keeps short tutor notes (`courses.tutor_notes`). When a session
with some learning in it ends, one background call rewrites them from the
session's turns and marked answers: what the student understands, what they
keep getting wrong, what help worked and what to come back to. Every tutor
turn reads them, and a question the materials do not cover can still be
answered from them. The course's tutor page shows the notes in full, and
Forget clears them.

## AI engine

One engine in `src/server/ai/` serves every task. A task declares what it
needs: a skill (chat, extract, write, check, vision or embed), its data class,
lane, output cap, cache policy and attempts. `catalog.ts` lists routes with
prices and the preferred order for each skill. Features never name a model.

Funding sources are rows in `funding_sources`. The `platform` row uses the
credentials in `.dev.vars` and allows $2 a day and $20 a month per workspace.
A student can add their own Bedrock or Vertex key in Settings. Keys are sealed
with a key derived from `BETTER_AUTH_SECRET`, so rotating that secret retires
them. Student content goes only to routes that keep no prompts. The one
embedding route keeps prompts, so under the platform source a student's
question is searched by text alone. Search by meaning runs under a source that
allows it, such as a student's own key with that setting on.

Every provider call is a row in `ai_calls`, reserved before sending and
settled from usage after. An uncertain outcome stays charged and is never
retried automatically.

## Development seed and measurement

Fictional fixtures live in `dev/fixtures`. Seed an existing development
account, which must have signed in once:

```sh
npm run db:seed -- --email you@example.com
```

PowerShell users should use `npm.cmd run db:seed -- --email ...` if the npm
shim consumes the separator. The seed (`rawi-dev-v3`) adds three courses:
the Atlantic World and Statistical Inference with readings and no syllabus,
and Minds, Machines and Meaning with only a syllabus. Topics, facts and
questions are not seeded. Rawi reads the materials when a course page opens.
`dev/fixtures/midway-*.md` are for trying a midway upload, and
`dev/fixtures/originals` holds small originals for the Datalab path.

```sh
npx tsx dev/measure.ts --email you@example.com --suites retrieval,questions,tutor
```

`measure.ts` measures retrieval, question yield and cost, and tutor latency
and cost on the seeded courses. `--read` first runs all reading work. It
removes the tutor sessions it creates. A full run costs a few cents.
`--chat ROUTE` serves tutor replies from one catalog route for that run, and
`--dump FILE` writes each reply to a file, so routes can be compared on the
same cases and read side by side.

## Remaining work

- Owner decisions: prices and plan numbers. Tutor replies stay on Nova Lite in
  development and move to a frontier model for production. Nothing a student writes goes to a vendor that keeps prompts, so
  student-facing work stays on Bedrock. Anthropic models on Bedrock are refused
  for this account's country, checked on 15 November 2026.
- A replaced version embeds the whole document again, not only changed
  sections. The cost is small.
- Each database round trip from the development machine takes 100 to 130
  ms, so a tutor reply needs about 4 seconds to its first word and an answer
  save takes a few seconds. Planner and progress reads run their queries one
  after another.
- R2 holds objects from before the database reset that no row points to.
- The seed gives the winds material a figure with a written description, so
  figure retrieval is measured. Describing a real image with the vision route
  still needs an uploaded document with figures to check.
- Deferred: Arabic prompts and search, and with them an embedding route that
  keeps no prompts. Request rate limiting waits for deployment work, and
  account deletion for launch preparation. Also voice, chart specs, shared
  question pools, organisation policy, illustrations and a topic map.
