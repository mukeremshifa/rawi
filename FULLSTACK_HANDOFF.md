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
