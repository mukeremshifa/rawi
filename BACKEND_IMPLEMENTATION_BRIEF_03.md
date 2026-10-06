# Backend implementation brief: checkpoint 3, first slice

Superseded on 7 October 2026 by [FULLSTACK_IMPLEMENTATION_BRIEF.md](FULLSTACK_IMPLEMENTATION_BRIEF.md). Use that brief for execution. This document remains a historical record of the earlier limited slice, including the material-draft finding.

Prepared 6 October 2026. Checkpoint 2 has been reviewed. Carry its material-editor draft issue into this work rather than creating a separate cleanup checkpoint.

## Outcome

A learner can create a small online practice set, start a run, save answers, resume in another browser, submit once, review the result, and attempt the same set again. Questions and attempts retain the exact content used. Include the material-editor fix below.

This is the first slice of learning persistence, not all of checkpoint 3. Keep it focused on flashcards, multiple-choice questions, and written recall. Add a minimal learner-authored set editor for these formats so the feature works without hosted AI or demo data. Questions entered here are explicitly learner-authored, not generated or institution-approved. Later checkpoint 3 slices cover the remaining formats, exam rehearsals, planner and progress, and tutor history. Do not create empty tables for those features now.

Hosted generation, written feedback, extraction, billing, sponsorship, offline sync, and local-workspace import remain outside this brief. Written responses persist with pending feedback and a clear explanation that online feedback is not available yet. No fake grading or background provider calls.

## Read and preserve

Read README.md, AGENTS.md, BACKEND_PLAN.md, BACKEND_CHECKPOINT_2.md, server/backend/, and src/client/online/. Inspect src/shared/types.ts and marking.ts, the local practice features, and their store actions before adapting behavior. Reuse runtime-independent rules where they fit, but do not treat local TypeScript types as validation for network input.

Keep the locked Hono, Workers, Neon, Drizzle, Better Auth, and R2 stack. Preserve existing account guards, ownership checks, revision errors, material versions, upload reconciliation, local storage, and exports. Keep npm install, npm run dev, and npm run dev:backend usable. Online errors must not fall back to local data. No new tests, CI, infrastructure, or production deployment are requested.

## Carryover: preserve material drafts

In src/client/online/Materials.tsx, reload currently replaces all metadata fields after saving text or replacing a source. It also advances material.revision without resetting an open text draft. This can discard unsaved metadata or let an old draft replace newly uploaded content without a conflict.

- Separate persisted state from dirty metadata and text drafts. Refreshing saved content must not silently replace dirty fields.
- Capture the text draft's base revision when editing begins. Do not silently rebase it after a source replacement or unrelated refresh. Preserve explicit review and conflict resolution. Successful own metadata changes may advance the draft base only when the implementation can establish that its source content has not changed.
- Keep retry IDs and payloads stable after an ambiguous save. Changing the draft creates a new logical save after the previous outcome is resolved.
- Coordinate replacement and editor operations so simultaneous responses cannot clobber drafts. Disabling overlapping mutations is acceptable, but do not discard an existing draft to enable an action.
- Verify unsaved metadata survives saving text and replacing a source. Verify an open text draft followed by source replacement either prevents replacement while dirty or requires explicit review before that old draft can be saved over the new source.

## Persistence and contracts

Add a reviewed Drizzle migration, preserving applied migrations. Normalize sets, versioned questions, ordered set items, runs, answers, and finalized attempts. Validated JSON can hold format-specific content and immutable answer snapshots. Do not store the workspace or whole learning history as one JSON blob.

- Every record and nested reference is workspace and course scoped. Derive the actor from the session. Foreign IDs return 404. Validate material, version, passage, topic, question, set, run, and attempt relationships on the server.
- A saved set pins immutable question versions and order. Its title and archive state may be revisioned metadata. Content edits create new question/set content versions or an explicit new set, never change existing runs or attempts. A simple immutable set-content design is sufficient for this slice.
- Optional source links include the material version and passage IDs. Old source links remain readable after edits or archive. Topic removal must not cascade into saved questions, answers, or attempts. Retain historical topic labels and detach deleted live classifications deliberately.
- Start a run from server-loaded set content. Reopening an existing run resumes it. Starting another attempt creates a different run. Stable create IDs and fingerprints make retrying set creation and run creation safe.
- Mutable records use revision checks. A retried successful write returns its original result or a clearly recoverable current state. Reuse of an operation ID with changed input is rejected. A stale answer from another browser must not replace a newer answer.
- Runs have explicit active and submitted states. Answers are associated with run items, not arbitrary question IDs. Persist raw responses and assistance/self-rating provenance before producing results. Submitted answers and attempt snapshots are immutable.
- Use a unique run-to-attempt relationship and a short transaction to finalize. Concurrent or repeated submission returns the same attempt. Serialize answer saves against finalization. Accept an optional final answer batch atomically with submission, or require all answer saves to be acknowledged before submitting. Document the chosen behavior. Never finalize an older saved answer while the UI presents a newer draft as submitted.
- No database transaction spans an external service call. There are no provider calls in this slice.

Extend /api/v1 and its configured-route allowlist using the existing error envelope and account-change protections. Provide course-scoped set lists/create, set detail and metadata/archive, run create/read, answer save, run submit, and paginated attempt list/detail. The agent may choose exact endpoint names, but document the delivered contract briefly in the handoff. Runtime-validate payload shapes, lengths, option indices, question counts, and unique item membership. Set explicit bounded limits, initially 50 questions per set and 20,000 characters per written response.

## Marking and saved results

Run objective marking on the server using authorized immutable question versions and shared rules. Never accept client totals, outcomes, answer keys, or feedback as grading authority. Authored question keys enter only through validated content creation, not answer submission.

For this slice, reveal objective feedback after full practice-run submission. Flashcards have an explicit reveal action and self-rating. Persist reveal state and identify self-rated evidence honestly. Active-run responses omit objective keys and explanations. Keep authoring/detail payloads separate from run payloads. This personal practice feature is not a secure institutional exam system.

Written recall remains pending, with no invented marks. Exclude pending answers from both earned and available graded totals, and show the pending count. An all-pending result must not display a zero-percent grade. Do not expose an AI retry action before hosted grading exists.

Results retain the question version, response, marking rule version, timestamps, and provenance. Repeated attempts remain separate. Archive hides a set from the default list but preserves runs and results. It must not strand an existing active run. Listing and reading history must not regenerate, regrade, or depend on the current source material text.

## Online experience

Enable Practice in online course navigation. Provide set creation, library, archive/restore, start/resume, answer saving, submission, and results/history. Follow existing layout components. Keep unsupported formats and hosted AI actions clearly unavailable. Do not enable other learning areas prematurely.

Show saving, saved, failed, and conflict states. Acknowledged answers survive reload and browser changes. Keep unacknowledged text in memory after request failure, with explicit retry and copy/export recovery. Do not claim unsent changes survive reload. Prevent navigation from silently losing unsent answers, without adding offline synchronization.

Serialize or coalesce autosaves and ignore stale responses. Flush or include outstanding answers when submitting. On conflict, retain the draft and let the learner review the saved answer before choosing a revision. Account changes cancel requests and clear private state. A late response from another account or run must not populate the current screen.

## Verification and handoff

Check affected behavior in the dev server using the designated development database. Apply only the new reviewed migration to that known target. Do not provision services or alter credentials for this task. Missing access is a verification limitation, not permission to substitute a different backend.

Record actual checks in BACKEND_CHECKPOINT_3A.md, including:

- Both material-draft scenarios above, including a source replacement while text is open.
- Create and reopen a learner-authored mixed-format set in another browser. Start, save, reload, resume, submit, and repeat it with separate attempts.
- Duplicate create/start/submit requests, concurrent submission, and an answer save racing submission. Confirm one attempt per run with the intended final answers.
- Failed saves and lost responses after a successful commit. Retry recovers saved work without duplication. Two browsers show a conflict rather than silently overwrite answers.
- Tampered scores, foreign nested IDs, unsupported response shapes, and oversized inputs are rejected. Another account cannot read or change copied set/run/attempt IDs.
- Active-run payloads omit objective keys. Objective results use server rules, flashcards remain self-rated, and written feedback stays pending without depressing totals.
- Material edits, source replacement, topic removal, and archive preserve historical questions, answers, and source links.
- Account switching and stale responses, local mode, and existing course/material operations still work.
- npm run typecheck, npm run build, migration review, and Worker dry-run packaging. No private content or credentials enter logs.

Do not add automated tests or CI. Distinguish newly executed checks from checkpoint 2's handoff. Update README minimally with delivered behavior and limitations. Commit coherent changes. Do not mark all of checkpoint 3 complete after this slice.

## Agent kickoff prompt

Implement BACKEND_IMPLEMENTATION_BRIEF_03.md. Include the checkpoint 2 material-editor draft fix, then deliver the first learning-persistence slice: learner-authored practice sets, saved runs and answers, server-side objective marking, and immutable attempts. Preserve the locked stack and local mode. Keep hosted AI and other checkpoint 3 slices out of scope. Verify in the dev server, commit coherent changes, and write BACKEND_CHECKPOINT_3A.md with actual results and limitations.
