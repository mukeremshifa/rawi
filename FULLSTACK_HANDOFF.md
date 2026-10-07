# Single-app implementation handoff

Next assignment: [ACCOUNT_APP_IMPLEMENTATION_BRIEF.md](ACCOUNT_APP_IMPLEMENTATION_BRIEF.md).
The owner has withdrawn offline support and user-facing storage/recovery features.
The implementation and verification below describe the previous assignment.
Keep them as historical evidence while recording the account-app cleanup.
Updated 7 October 2026. The current record below supersedes the historical migration
notes that follow it.

## Current implementation

Rawi now has one account boundary, router, shell and theme path. Canonical routes
serve the account features. Old `/online` links redirect with query strings,
fragments and exact material references intact. The former course editor link
redirects to `/course/:id/syllabus`. `npm run dev` builds the shell and starts
Vite with the Worker API. The mounted local application, live workspace store,
fallback data and Node AI entry point were removed.

The single shell includes course setup and outline review, material editing and
version navigation, all nine practice formats, second passes, review practice,
rehearsals, planner controls, tutor records and summaries, history filters, topic
progress, search, reminders, preferences and recovery. Feedback revision history
is visible. Server section activation and sequential progression now gate every
answer in save and submit batches, with atomic rejection and deadline checks.
Question deduplication uses the shared Unicode-aware prompt key.

Private offline data uses IndexedDB `rawi-offline-v1`, schema 1, partitioned by
schema, user and workspace. Only explicitly allowed successful read views enter
the cache. Defaults are a 24-hour session-check grace, seven-day snapshot retention,
a 50 MiB snapshot budget with recent-view eviction, 2 MiB per item, and a separate
10 MiB protected draft budget. Cached history arrays retain at most 100 entries,
planner sessions at most 200. Evidence totals remain server-derived. Storage
controls inspect and remove snapshots and separately export or discard drafts.

The production service worker caches only its versioned public shell and static
assets. It waits for existing tabs to close, then removes obsolete Rawi shell
caches. It never intercepts API writes or caches authentication and signed URLs.
IndexedDB version changes close old connections. This is the first cache schema,
so there is no previous deployed cache schema to migrate. Future incompatible
schemas need an explicit recovery-preserving migration before changing this default.

Eligible note, material, practice-answer and tutor-message drafts retain their
base revision and narrow retry payload. Restoring and saving are explicit.
Conflicts require review. An ambiguous save retries its original operation ID.
Storage failures offer export without claiming device recovery. Sign-out offers
recovery, locks all tabs and clears private storage. Offline sign-out completes
server sign-out before reopening an account. Online session rejection never
falls back to an unlocked cached identity. No offline mutation queue exists.

Fictional courses live only in `dev/fixtures`. The manual seed requires an existing
development workspace and the designated `.dev.vars` target. Stable provenance
makes repeats preserve edits and history. Browser legacy data remains an explicit
recovery original. Reviewed imports support unfinished practice and account
archives, including exact readable versions and feedback history. Restored
practice retains unknown historical assistance even after current server marking.
Repeated imports do not republish records. Active local exam timers confer no
server authority. README documents the seed and storage controls.

## Checks performed for this assignment

Checks used the existing isolated development identities, designated Neon database
and R2 bucket. Chrome exercised the real API and UI through Vite and a locally
served production build. No hosted AI output was substituted as provider evidence.

- TypeScript, production build and Worker dry-run packaging passed. The client
  entry is about 832 kB minified and 249 kB gzipped. Vite still reports its large
  chunk warning. Worker packaging is about 3,313 KiB and 602 KiB gzipped.
- Actual `npm run dev` starts the single app. Canonical pages, legacy redirects,
  deep passage reload and browser Back were checked. An authenticated account
  with no active courses displayed the empty library without seeding.
- Both material regressions passed: unsaved metadata survived a text save and a
  real R2 source replacement. Replacement stayed disabled with a text editor open.
- All nine question formats were answered in Chrome and submitted through the
  API. Pending written feedback stayed pending. Save receipts, revision conflicts,
  answer locks, foreign reads and concurrent finalization passed API checks.
  Chrome reveal and Edge resume retained the same saved state. Canonical learning
  pages opened without runtime errors. Saved tutor summaries, grounding labels,
  disabled ended composers and blocked-only summaries passed using existing
  explicitly synthetic fixtures, with no provider call.
- Future-section save and submit batches failed atomically for sequential and
  free navigation. Skipped sequential progression failed. Entered sections saved.
  Section locks, expiry and concurrent manual/access finalization passed.
- Three distinct Arabic prompts stayed distinct. True duplicates, mixed text and
  English case and punctuation normalization behaved as intended without AI calls.
- Production offline deep reload, exact passage reading, freshness labels,
  blocked mutations, unchanged-record note saving and closed-tab text recovery
  passed. A concurrent edit required explicit conflict review. A simulated quota
  failure offered export. A lost response after commit reused its original receipt.
- Offline tutor drafts recovered. Offline sign-out locked two tabs and cleared
  all private stores, then completed server sign-out before reopening. Account
  switching during a held committed save ignored the late response. A 25-hour
  cache window and online 401 and 403 responses prevented cached reopening.
- A waiting worker left a dirty editor intact. Activation preserved its draft,
  deleted only obsolete Rawi shell caches and retained an unrelated cache. Cache
  Storage contained no API or signed-URL requests. An uncached offline route
  explained its connection requirement and Back returned to cached content.
- A synthetic size exercise through the actual cache module verified the 50 MiB
  bound, recent-view eviction, per-item limit and read allowlist. The storage UI
  cleared snapshots while preserving its protected draft.
- Planner UI saved dated availability ending at midnight, linked session topics
  and assessments, and a scoped check-in. Rehearsal copying, question navigation,
  manual section locking without early feedback and hidden exam-set denial passed.
- The seed ran twice with identical course IDs and preserved an intervening user
  edit. Browser and Worker artifacts contained none of the checked fictional
  course bodies. No startup or sign-in seeding path remains.
- Mixed sample and edited browser data downloaded byte-for-byte and remained
  unchanged through explicit review. Unfinished practice import, repeated commit,
  rejection of active-exam promotion and recovered marking provenance passed.
  A real account archive was reviewed and restored. A larger archive containing
  34 attempts also passed review.

## Remaining limits and dependencies

Hosted tutor, generation and written-feedback execution and streaming are still
unfinished application work. They also need available runtime provider
authentication. Operation records, context builders, validators, reservations and
publication fences are present, but blocked operations are not working AI.
Synthetic tutor fixtures in historical verification remain explicitly synthetic.
PDF, DOCX and PPTX extraction is unfinished. Originals remain recoverable online.

Offline original-file downloads and pinning are deferred. Readable cached text
ships now. First visits need a connection, and remote revocation cannot be known
while disconnected. State-version-1 legacy data has exact download and manual
recovery, not automatic import. Account archives disclose unsupported provider
execution records, file bytes, preferences, reminder state and active timers,
which remain in the retained original rather than being executed or promoted.

A new Google OAuth sign-in, a newly created account, a future incompatible cache
schema migration and every browser storage implementation were not exercised.
No production deployment, infrastructure change, credential setup, applied
migration rewrite, automated test suite or CI was added. The development server
is left running. Sessions for the two isolated verification identities were revoked.
The following older results describe their original checkpoints,
not additional checks performed in this assignment.

---

## Historical full-stack migration record

# Full-stack migration handoff

Next assignment: [SINGLE_APP_IMPLEMENTATION_BRIEF.md](SINGLE_APP_IMPLEMENTATION_BRIEF.md).
The owner now requires one full-stack app with bounded offline access and no
separate local mode. The status and checks below record the preceding migration.
Retain them as historical evidence while updating this handoff for the new work.


Current status: the full brief is not complete. Authenticated persistence and
recovery are implemented for materials, nine-format practice, second passes,
rehearsals, planning, progress, tutor records, search, reminders and reviewed local
transfer. Hosted Vertex execution and streaming remain blocked by absent runtime
authentication and unfinished execution wiring. Full shell parity and the switch
to online as the primary experience remain unfinished. Unfinished local practice,
active local exams and UI drafts remain in the retained recovery export. Online
archive restoration is not implemented. The milestone notes below distinguish
real development checks from synthetic AI publication checks.

Active brief: FULLSTACK_IMPLEMENTATION_BRIEF.md. Started 7 October 2026.
This inventory records the checkout, not assumed completion from earlier briefs.

| Area and routes | Existing online implementation | Current verification |
| --- | --- | --- |
| `/online`, `/online/courses`, `/online/course/:id`, `/online/settings` | Auth, courses, archives, outline review, preferences and revisions | Prior checkpoint results only |
| `/online/course/:id/materials`, `/online/materials/:id` and version/passage links | Library, text, uploads, metadata, archive, history, original recovery | Prior checkpoint results only. Draft regressions identified |
| Local home, overview, setup, search and notifications | Local store | Online integration unfinished |
| Local practice libraries, bank selection, generation, runs, feedback, review and remediation | Local store and Node AI API | Online integration unfinished |
| Local tutor libraries, source/review links, streams, stages and summaries | Local store and Node AI API | Online integration unfinished |
| Local assessments, rehearsal builder, timed runs and results | Local store | Online integration unfinished |
| Local planner, availability, proposals, check-ins, history and progress | Local store | Online integration unfinished |
| Local export, import and restoration | Versioned browser data | Online transfer unfinished. Signing in does not transfer local data |

## Verification and dependencies

New checks ran through the Vite/Worker dev server, existing Neon database and R2 bucket. Previous checkpoint handoffs remain historical evidence.
The designated development target is the existing `.dev.vars` database, confirmed
in BACKEND_CHECKPOINT_2.md. No infrastructure or credential changes are planned.
Hosted provider authentication and extraction capability must be inspected before
claiming execution. No substitute responses count as hosted verification.

## Migration record

Applied migrations 0000 and 0001 remain unchanged. New migration details follow.

## Material draft milestone

Implemented and verified in headless Chrome against real authenticated APIs and R2:
unsaved title and attribution survived saving a text version and replacing the
source file. An open text editor disabled replacement. No page errors occurred.
Text editing captures its base revision. A failed text save retains its request
ID and payload. A confirmed conflict permits explicit review before rebasing.
Metadata refresh no longer repopulates draft fields. No local storage was changed.
Verification used the existing isolated checkpoint identities with renewed Better
Auth sessions, not a new Google OAuth login. Screenshot: ignored
`.rawi/fullstack-drafts.png`.

Learning persistence is in progress. Migration 0002 was reviewed and applied to
the designated development database. API checks have passed for all nine formats,
retry receipts, stale revisions, answer locks, foreign reads, pending totals and
concurrent submission. UI and remaining milestone checks are still pending.

## Learning persistence milestone, in progress

Implemented account routes now include:

- `/online/course/:id/practice`, `/online/sets/:id`, `/online/runs/:id`
  and `/online/attempts/:id`. Nine-format answer controls and feedback reuse the
  existing components. Server transitions track checks, hints and reveals.
- `/online/course/:id/exams`. Rehearsals snapshot settings and resolve questions
  with the shared existing selection and validation rules. Active exam reads
  omit solutions. A per-section run also has an outer deadline equal to the sum
  of its section allowances so closing a browser cannot park unused sections.
- `/online/planner`, `/online/progress`, course progress and overview routes.
  Availability, date exceptions, assessments, check-ins and manual sessions are
  persisted separately. Proposals are stored before review and checked against
  their revision and complete input fingerprint before applying.
- `/online/course/:id/tutor` and `/online/tutor/:id`. Libraries, metadata,
  ordered student messages, exact source references and saved-answer context.
  Replies are explicitly blocked. No hosted provider call has been implemented
  or claimed, and opening a tutor never records completed learning.
- `/online/data`. Reviewed local import and account export. Current import
  limitations are listed before confirmation and originals are kept privately.

New migrations 0002 through 0006 were generated, reviewed and applied to the
existing designated development database. Earlier migrations were not changed.
0002 adds normalized learning records and immutable-history triggers. 0003 adds
exams and planning. 0004 adds tutor persistence. 0005 adds reviewed import archives.
0006 adds linked planning, calendar date columns with backfill, expiry indexing,
and a composite passage-source constraint. Its unique constraints were ordered
before dependent foreign keys before application.

Actual checks so far:

- TypeScript passed after these feature additions.
- Real authenticated Worker/Neon checks passed for all nine formats, immutable
  set contents, stable bank/set/run/answer retries, checked-answer locks,
  concurrent finalization, foreign reads and pending totals.
- A real four-second exam expired on access after browser-independent elapsed
  time. It produced an expired result and rejected further answer writes.
- Availability retry, learner timezone storage, stale proposal rejection,
  successful reviewed apply, foreign proposal denial and progress derivation passed.
- Tutor messages survived reads and retries without duplication. The saved
  execution state was blocked and foreign-session access returned 404.
- Chrome opened practice, results, exams, planner, progress, tutor and data pages.
  Edge resumed a reveal saved in Chrome. A second account could not open that
  run. No browser page errors occurred. Screenshots are ignored local artifacts.

Still unfinished: hosted provider execution, spending reservations, streaming,
feedback revisions, extraction beyond text, full parity of local feature controls,
full local-import coverage and online archive restoration. The main shell remains
explicit online mode because full behavior parity has not been established.
The remaining verification matrix is not implied by the checks above.


## Recovery and supporting feature milestone

Migrations 0007 through 0010 were generated, reviewed and applied to the same
designated development database. They add note sources, reminder state, AI
operations and execution reservations, immutable feedback revisions, and scoped
attempt constraints. The unique constraint in 0010 was moved before its dependent
foreign key before application. No infrastructure, credentials or deployment
changed.

Implemented since the earlier inventory:

- Shared navigation rendering with the existing shell, online course rail,
  account search and persisted in-app reminder read/dismiss state.
- Material notes retain exact source versions. Practice links filter an exact
  version. Practice defaults use account preferences. Selection loads a complete
  bank up to 5,000 records, failing explicitly above the bound.
- Planner launch links reach practice and exam run creation. Completion records
  the attempt once. Planner availability drafts retain their base revision and
  can be reviewed after a conflict. Home suggestions reuse the deterministic
  rules and direct unavailable tutoring suggestions to readable material.
- Learner timezone is used for evidence days, due reviews, streaks and proposals.
  Calendar arithmetic uses date values without host timezone assumptions.
- Run acknowledgement retains unmatched drafts, including answers excluded by
  finalization. Navigation protection uses the router blocker, including Back.
- Reviewed local imports now include assessments, rehearsal settings, planner
  sessions and check-ins, plus earlier course/material/question/attempt support.
  Local unfinished exams remain recovery-only because their clocks cannot be
  promoted into server authority. Active practice remains recovery-only, disclosed before import. Tutor history
  import was added in the final milestone below.
- Saved AI request pages and authenticated generation/feedback preparation use
  account records. No client material text, conversation history or grade is
  accepted as authority. Hosted requests remain blocked without sending.
- Internal AI reservation functions serialize cost and concurrency in Neon.
  Duplicate reservations do not authorize sending twice. Unknown outcomes retain
  their estimate and prevent automatic retry. Partial checkpoints require the
  current execution. Validated structured publication atomically saves generated
  questions and their set, or appends a feedback revision. Current results and
  progress apply revisions without overwriting the original attempt.

Additional actual checks:

- Authenticated APIs: own/foreign search, exact-source note, foreign note denial,
  concurrent answer save versus submission, one linked planner completion,
  blocked generation and feedback records, foreign AI operation denial, reminder
  dismissal and duplicate retry passed.
- Neon direct service checks used explicitly synthetic fixtures with no provider
  call: concurrent reservation limit, duplicate send fencing, partial checkpoint,
  uncertain-charge retention, stale checkpoint denial and duplicate settlement
  passed. Synthetic feedback was labelled `verification-fixture-no-provider`.
  Its revision changed current totals while the original response and snapshot
  remained unchanged. This is application validation, not hosted AI proof.
- Expanded import review/commit, duplicate review and commit, remapped IDs,
  readable historical sources, private original archive and account export passed.
  An intentionally inconsistent fixture referencing another course was rejected
  during review before publication.
- Chrome opened the updated routes, including search and reminders. Edge resumed
  a fresh reveal from Chrome. Copied foreign run access was denied. No page errors
  occurred. A first repeated browser check reused an already-revealed fixture and
  timed out, then passed with a new run. The first nine-format UI check overlapped
  a Worker hot reload and its last save returned 503. The repeated check passed all nine browser answer controls, autosave and
  submission after each request was observed by its answer item. A lost response
  after a committed save preserved the draft and retried without duplication.
  Declining browser Back preserved unsent work. The combined check then waited
  for an account-switch fixture request that had already completed, so that
  subcheck was rerun separately.

## Current API map

All paths below have the `/api/v1` prefix, authenticated account ownership,
no-store responses and configured-route allowlisting.

| UI | API routes |
| --- | --- |
| Account, courses, settings and reviewed outline | `me`, `preferences`, `courses`, `courses/:id`, `courses/:id/topics` |
| Materials, notes, exact sources, archive and recovery | `courses/:id/materials`, `materials/:id`, `materials/:id/versions`, `materials/:id/versions/:versionId`, `materials/:id/versions/:versionId/passages/:passageId`, `materials/:id/versions/:versionId/download`, `courses/:id/uploads`, `uploads/:id`, `uploads/:id/finalize` |
| Practice library, runs and results | `courses/:id/questions`, `courses/:id/sets`, `sets/:id`, `sets/:id/runs`, `courses/:id/runs`, `runs/:id`, `runs/:id/answers`, `runs/:id/transition`, `runs/:id/submit`, `courses/:id/attempts`, `attempts/:id` |
| Exam configuration and server transitions | `courses/:id/exams`, `exams/:id`, `exams/:id/runs`, `runs/:id/exam-transition` |
| Tutor history and saved messages | `courses/:id/tutor`, `tutor/:id`, `tutor/:id/messages` |
| AI request preparation and recovery | `ai/status`, `ai/operations/:id`, `courses/:id/generate`, `attempts/:id/feedback` |
| Planner, progress and home | `planner`, `planner/availability`, `planner/sessions`, `planner/check-ins`, `planner/proposals`, `planner/proposals/:id/apply`, `courses/:id/assessments`, `progress` |
| Search, reminders and transfer | `search`, `notifications`, `export`, `imports/review`, `imports/:id/original`, `imports/:id/commit` |

## Gaps and concrete next actions

The full migration is not complete. These are not all external dependencies.

| Gap | Remaining work |
| --- | --- |
| Hosted AI execution | Runtime Vertex authentication is unavailable. Integrate an authenticated Worker-compatible execution adapter using the existing provider/model configuration. Connect it to reservation and publication boundaries, without a detached background promise. No credential setup or provisioning was attempted. |
| Tutor learning behavior | Bounded context, existing prompts, validated publication, Stop and saved recovery are implemented. Connect hosted streaming to the saved execution and publication boundaries. Session summaries and completed-learning links are now implemented. Current real requests are saved with blocked replies. Provider execution and streaming remain unfinished, not merely unverified. Synthetic publication checks do not count as hosted proof. |
| Written feedback execution | Publication and revisions exist. Connect provider output to these functions and expose revision history/regrading controls. Current UI requests are explicitly blocked. |
| Full UI parity | Shared answer components, domain rules and navigation are reused. Some exam controls and remaining shell parity still need adaptation. Custom planner windows, detailed check-ins and flashcard second passes were added in a follow-up. Assessment editing, rehearsal renaming and set conflict review were added. Keep explicit online mode until parity is established. |
| Transfer coverage | Add unfinished practice import with per-record validation. Tutor histories are now imported, with extra local action metadata retained in the recovery original. Online archive restoration needs its own reviewed remapping path. Original files, drafts and unsupported records are recoverable from the retained local export. |
| Extraction | TXT and Markdown are supported. PDF, DOCX and PPTX originals remain downloadable but unreadable. Integrate an available parser if one becomes configured, preserving real locations. Parser selection and processing infrastructure remain outside scope. |
| Verification | Complete the remaining failure matrix, especially cancellation, provider outcomes, large-account pagination and device-clock manipulation. Browser save races, expiry, topic removal and local-mode checks have now passed. No real tutor stream, cancellation, provider timeout or hosted citation result has been verified. |

The principal tradeoff is normalized immutable learning history plus coarse,
short workspace write serialization. This simplifies retries and finalization for
a personal workspace, with less concurrent write throughput. Full server-derived
planner inputs avoid first-page aggregates but are not yet optimized for very
large accounts. Online mode remains explicitly selected and local work is intact.


Further verification: a remote material content revision rejected the older text
draft and preserved both text and title. Per-section locking rejected writes
without revealing feedback, and manual submission racing expiry produced one
expired result. Pure shared-rule fixtures passed learner midnight evidence,
calendar-day reviews and host-independent date arithmetic. `npm run typecheck`,
`npm run build` and Worker dry-run packaging passed. Vite reported the existing
large-chunk warning, now about 1.39 MB minified for the combined local/online entry.
No public deployment occurred.


## Final implemented milestone and verification status

Migration 0011 was generated, reviewed and applied. It adds imported tutor
provenance, an imported-history label and historical session ending time.
Tutor import validates course/topic/source relationships, stores ordered messages
and remaps citations to immutable online passage versions. Extra local actions
remain in the preserved original. Existing imported attempt assistance is not
promoted into verified independent evidence by server progress. The original
recorded provenance remains available in the immutable snapshot and export.

Course, outline and preference metadata now accept operation receipts. Their
current UI retains payloads on ambiguous failure and clears them only on success
or explicit conflict review. Older checkpoint callers without an operation ID
remain revision-protected. Practice now uses the shared format/topic selection
rule. Mixed-format flashcards count as self-rated evidence. Active run links keep
planned sessions out of proposal replacement. Exam countdowns include the server's
outer deadline as well as the section deadline.

Newly verified:

- Course, outline and preference retries returned the original revision without
  applying another mutation.
- Chrome edited an assessment's time and notes, and renamed a rehearsal. API
  rereads confirmed persistence.
- Account change during a held, committed answer-save response cleared private
  drafts and ignored the late response. This used two isolated test identities.
- Imported tutor text, explicit synthetic model provenance, remapped exact
  citations and foreign-session denial passed. No live AI response was produced.
- Removing a topic preserved the saved attempt, historical label and exact source.
  A new tutor review could refer to that historical topic. The fixture's optional
  outline restoration collided with a Worker hot reload after the check, so it
  was not counted as successful restoration. Only the isolated fixture was
  affected, and it was subsequently archived.
- `npm run dev` launched the local API and Vite. Chrome opened the local sample
  home, courses, planner, history, practice and exams without page errors.
  Visiting `/online` left `rawi.state.v1` byte-for-byte unchanged. Local reopening
  succeeded. No real user's browser profile or stored local work was accessed.
- The development verification sessions were revoked. Fixture courses were
  archived. Maintenance reported zero pending uploads and zero reserved bytes.
  No temporary failure triggers remain. Immutable verification history and
  retained private originals were not deleted.

The full brief remains incomplete. The primary unresolved work is hosted tutor
execution and streaming, an authenticated Vertex adapter, unfinished-practice
import and online archive restoration, and remaining UI parity. Online mode was
not made the default because that condition has not been met. No new infrastructure
was selected or provisioned, no credentials changed, and no tests or CI were added.


## Tutor context and transaction recovery follow-up

The server now snapshots bounded owned tutor history, selected passages, exact
historical focus versions, reviewed answers and prior work into the existing
prompt builder. Tutor actions use the existing six action types. Reply publication
reuses the local citation and stage validator, saves ordered messages and exact
citations, and fences stale executions. A cancelled request retains partial text
and any uncertain charge. The saved-operation UI exposes Stop and recovery export.
Interrupted or visible partial output cannot silently retry. Unknown outcomes
continue to consume concurrency until reconciled.

Authenticated development API checks passed for saved context and actions,
message retries, active-reply fencing, foreign denial and cancellation retries.
Direct publication checks used explicitly synthetic model output, no provider
call. They passed citation filtering, exact version retention, one-stage maximum
advancement, server history and stale publication denial. Chrome saved a tutor
action and message and opened a cancelled partial recovery page without errors.
Hosted streaming and actual provider cancellation remain unverified and unfinished.

A real dropped Worker connection exposed an idle transaction holding a fixture
workspace lock. Its two identified fixture connections were terminated. Application
transactions now set local idle, statement and lock timeouts of 15, 30 and 10 seconds.
The values were read back successfully from the development database. Database-wide
settings were not changed. The subsequent tutor API and publication check passed.
Earlier timeout and connection failures are not counted as successful checks.


## Flashcard second pass

Migration 0012 was generated, reviewed and applied. It adds a nullable second-pass
snapshot to learning runs. Difficult cards can be revisited once before submission.
The server resets their reveal and rating locks while retaining first-pass ratings.
Second-pass position and ratings resume across browsers. Final attempts keep both
initial and final ratings as self-rated evidence.

Chrome started the second pass and Edge resumed, revealed, rerated and submitted it.
The immutable result retained the initial hard rating and final easy rating.
A second account was denied access. Two preliminary browser assertions matched
the original heading too broadly and read before the write completed. The corrected
exact-heading check passed. No underlying second-pass failure was inferred from
those preliminary assertions.


## Planner and rehearsal controls follow-up

The planner now edits custom dated windows and notes, including an end at midnight,
manual session topic and assessment links, and detailed check-ins. Editing existing
assessments and sessions retains the opening revision through unrelated refreshes.
Draft export and stable retry callbacks preserve proposal review and other pending
actions. Applying a proposal refreshes saved data without reloading away drafts.

Rehearsals can link owned assessments and copy settings into a new configuration.
The copy excludes record metadata rejected by request validation. Active exams have
a numbered question navigator with flags. Hidden exam sets cannot be opened through
the practice-set API. Manual section completion no longer submits a single-section
paper, and all manually locked sections do not trigger expiry reconciliation.

Chrome and API rereads verified custom dated availability ending at midnight,
linked session topics and assessment, a detailed scoped check-in and rehearsal copy.
An initial selector was too strict for a native select and was corrected. The next
run reached the exam step and exposed automatic finalization of all locked sections.
After fixing reconciliation, a focused Chrome check passed navigation, final-section
locking without feedback, rejected locked writes, hidden exam-set denial and explicit
whole-paper submission with a manual result. These are actual dev-server checks,
not hosted provider verification.


## Tutor summaries and learning completion

Migration 0013 was generated, reviewed and applied. It adds a scoped planner link
and a completed-learning flag to tutor sessions. Ending a session saves its ending
time and reuses the existing deterministic summary rules. Two saved blocked
questions do not complete a planned activity. Completion requires two acknowledged
student exchanges and a complete tutor reply. Imported message provenance does not
qualify as newly verified learning. Linked sessions complete once. Completed tutor
activity contributes to activity history and streaks, with no independent mastery
marks. Imported tutor history remains separately labelled.

Tutor transcripts now reuse the established presentation component, with an online
renderer for exact versioned source links. Local rendering uses the same component.
Completed sessions reject new messages and show their saved summary. Topic removal
still leaves historical labels and sources available. Imported planned tutor links
are validated and remapped.

Actual development checks passed for blocked-only ending without planner completion,
foreign end denial, repeated ending, immutable completion links, summary persistence,
ended-message rejection and unchanged independent evidence. Completed replies in
these checks were explicitly synthetic and labelled as such. Chrome verified the
shared transcript, grounding labels, both summary outcomes, disabled ended-session
composer and assisted activity in progress. No hosted provider call was made.


## Final checks after the follow-ups

`npm run typecheck`, `npm run build` and Worker dry-run packaging passed after the
application changes. The combined client entry is 1,407.92 kB minified, 401.34 kB
gzipped. Vite reports its large-chunk warning. The Worker package is 3,293.55 KiB,
597.80 KiB gzipped. Nothing was deployed.

The authenticated practice page loaded readable material names and source filters.
`npm run dev` then passed local home, courses, planner, history, practice, exams,
tutor transcript and session-summary checks in a fresh Chrome profile. Visiting
online mode left local storage byte-for-byte unchanged and local reopening passed.
No page errors or provider calls occurred in that local check. The new imported
tutor planner-link mapping is typechecked but was not separately imported again.

Verification sessions were revoked again, fixture courses archived, and material
maintenance reported zero pending uploads and zero reserved bytes. No temporary
failure triggers remain. The local dev server was left running. Changes are saved
in coherent milestone commits. No infrastructure was provisioned, credentials
reconfigured, public deployment performed, or tests and CI added.
