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

Pending implementation. Applied migrations 0000 and 0001 must remain unchanged.

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
