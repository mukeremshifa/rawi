# Full-stack migration handoff

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
| Tutor learning behavior | Bounded context, existing prompts, validated publication, Stop and saved recovery are implemented. Connect hosted streaming and session summaries. Current tutor messages are saved with blocked replies and do not create learning evidence. These application paths remain unfinished, not merely unverified. |
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
