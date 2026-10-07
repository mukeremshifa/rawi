# Rawi full-stack implementation brief

Superseded on 7 October 2026 by [SINGLE_APP_IMPLEMENTATION_BRIEF.md](SINGLE_APP_IMPLEMENTATION_BRIEF.md). Its single-app and offline-feature requirements replace the dual-mode migration requirements below. This document remains a feature and historical reference, not the active kickoff.

Prepared 7 October 2026. This was the full-stack migration brief preceding the single-app decision. It superseded the limited scope and kickoff in BACKEND_IMPLEMENTATION_BRIEF_03.md. BACKEND_PLAN.md remains the architectural reference.

## Outcome and scope

Bring the existing Rawi learning experience online end to end. A learner signs in, manages courses and materials, studies with the tutor, creates and completes practice, rehearses exams, plans work, and reviews progress and history. Saved work belongs to the account and is usable across browsers. Preserve the existing interface and learning behavior rather than shipping a second reduced version of the product.

The current checkout already implements online identity, courses, topics, preferences, and versioned materials. Inspect the checkout before changing it and build on any additional work that has landed. A written brief is not evidence that its features were implemented.

Keep the README's chosen stack and existing repository. This brief covers application code, database migrations, API behavior, client integration, and verification. Infrastructure selection, provisioning, credential setup, public deployment, payments, and institutional administration are outside this assignment. Do not introduce new vendors or services to complete it. Use existing configured capabilities. Where an external capability is unavailable, implement the meaningful independent application work, show an honest unavailable state, and record the precise remaining dependency. Do not substitute mocks or the local server as proof of hosted functionality.

Rawi remains a personal learning workspace. Future institutional sponsorship provides access without owning private content or restricting subjects. Do not add school-domain restrictions, institution-owned course boundaries, general offline synchronization, or a new question-authoring product as a prerequisite for this migration.

## Read and preserve

Read AGENTS.md, README.md, BACKEND_PLAN.md, and the checkpoint handoffs. Inspect server/worker.ts, server/backend/, src/client/online/, src/client/features/, src/client/store/, and src/shared/. In particular, understand the local practice and exam engines, tutor stream handling, marking, evidence, planner, restoration, and exports before adapting them.

Keep npm install, npm run dev, and npm run dev:backend runnable. Preserve existing local work, immutable material versions, R2 finalization fencing, account isolation, and revision handling. Do not rewrite applied migrations or silently reset browser data. Keep unrelated changes untouched. Use relevant repository skills for implementation while retaining the locked stack. No automated tests, CI, new environment setup, or additional approval gates are requested.

## Execution approach

Work through the milestones below as one assignment. They are commit and verification boundaries, not requests to stop for a new brief. Complete each feature through its real UI, API, persistence, and failure recovery. Continue independent work when a dependency prevents one integration from being verified.

At the start, make a compact inventory in FULLSTACK_HANDOFF.md mapping existing routes and actions to their online implementation and verification status. Include supporting actions such as search, archive, rename, source links, review practice, and settings. Update this one handoff as work progresses. Avoid parallel planning documents.

Reuse existing presentational components and pure domain rules. Separate their data access from local-store assumptions with focused feature hooks or adapters. Do not build a universal abstraction framework or a cloud copy of the entire local AppState. The tradeoff is a larger coordinated migration in exchange for preserving the full product experience and avoiding temporary feature restrictions.

## 1. Shared persistence and client foundation

Add normalized records as their features are implemented: versioned questions and saved sets, runs and answers, finalized attempts and feedback revisions, tutor sessions and messages, assessments, planner availability and sessions, and check-ins. Validated JSON is appropriate for variable response shapes and immutable snapshots. Independently mutable records need their own identity and concurrency rules.

Derive ownership from the validated session. Scope every query and nested relationship to its workspace and course where applicable, including retrieval, source links, planned-session links, and remediation references. Use scoped constraints as well as service checks. Foreign IDs return 404. Never trust client-provided ownership, grades, answer keys at submission, material text used for grounding, or conversation history as authority.

Keep the existing /api/v1 contract conventions, configured-route allowlist, JSON errors, no-store behavior, and account guard. Runtime-validate requests and bound payload sizes, list pages, question counts, context size, and response lengths. Use stable cursor ordering. A paginated response must not silently become the complete input for an aggregate or marking decision.

Use revisions for mutable records and stable operation IDs with request fingerprints for retriable writes. A changed payload cannot reuse an old operation ID. Lost responses after a committed write must be recoverable without creating duplicates. Serialize answer saves against finalization. Do not hold database transactions during file transfers or model calls. Use the existing Neon transport and connection lifecycle conventions.

The client uses server-backed feature data plus transient UI state. Show loading, saving, saved, failure, and conflict states. Keep unsent text through request failures, preserve it during conflict review, and provide copy/export recovery where needed. Saved answers survive reload. Do not imply unacknowledged edits do. Guard navigation while unsent work would be lost. Account changes cancel requests and clear private caches, drafts, streams, and pending callbacks. Late responses cannot populate another account or record.

## 2. Materials and the carried review fix

Integrate the online material lifecycle into the established course interface. Preserve upload progress, retry, version history, original downloads, archive/restore, and exact historical passage links. Material actions that start tutoring, practice, or a note must pass authorized versioned references.

Fix src/client/online/Materials.tsx: reload currently resets unsaved metadata after text saves or source replacements, and advances material.revision while an older text draft remains open. Separate saved state from dirty fields. Capture the text draft's base revision when editing begins. A source replacement must not silently rebase that draft. Preserve explicit review before saving over changed content. Coordinate overlapping mutations and keep ambiguous retry payloads stable. A successful unrelated refresh must not discard unsaved title, attribution, or topic edits.

Keep source-file readiness separate from readable content. Connect any available extraction implementation through bounded, validated processing and immutable content publication. Preserve page, slide, or paragraph locations where the implementation actually provides them. Never invent extracted text or cite a location that was not recovered. Unsupported or externally blocked extraction retains the original and a truthful status. Parser/provider selection and new processing infrastructure are outside this brief.

Topic removal and archive must not delete historical passages, questions, attempts, or tutor citations. Preserve historical labels when a live classification disappears.

## 3. Questions, practice, answers, and feedback

Migrate existing question-bank selection and generated-set flows. Preserve all nine existing question formats in storage, rendering, answering, and applicable marking: flashcards, multiple choice, multiple select, matching, ordering, fill blank, written recall, source analysis, and essays. Preserve the current generator's supported formats rather than requiring it to generate every format. Do not seed a real workspace automatically or pretend unsupported generation succeeded.

Saved sets pin immutable question versions and ordering. Questions retain rubrics, explanations, provenance, and exact material sources. Saving generated questions and their set is atomic after validation. Reopening a set or starting another attempt uses saved content without generating again. Preserve the library's rename, archive, restore, and repeat-attempt actions.

Create server-owned runs from saved sets. Persist answers, position, reveal state, and assistance provenance as applicable. Resume the same run across browsers. A new attempt creates a new run. Enforce response shapes and option/item membership against the saved question version, not client content.

Save each submitted answer before feedback. Objective marking uses shared rules on the server. Preserve the existing practice feedback timing with explicit server transitions. Once an answer has been marked or a solution revealed, later edits cannot be recorded as a fresh independent response in the same attempt. Flashcard ratings stay self-rated. Written responses remain pending until valid feedback is saved, with explicit failure and retry when the provider operation is available. Never fall back to keyword grading.

Finalize each run into exactly one attempt through a unique constraint and short transaction. Final submission must flush acknowledged answer saves or include eligible final answers atomically. A concurrent save cannot change a finalized attempt. Repeated submission returns the same result, including after a lost response. Keep repeated runs separate.

Results preserve question and response snapshots, marking version, assistance, and model provenance where relevant. Regrading creates a feedback revision without replacing the original response. Pending written answers count toward neither earned nor available graded totals. Show pending counts and avoid displaying zero percent for an entirely ungraded attempt. Preserve answer review, source navigation, tutor follow-up, and remediation links.

## 4. Tutor and AI application integration

Adapt existing prompts, validation, retrieval, and streaming behavior into authenticated backend services. Retain the existing provider/model configuration rather than selecting replacements. Remove hosted-path reliance on the user's local Node server, workstation credentials, filesystem ledger, and process-local concurrency counter. Use available runtime-compatible provider access. If it is not configured, report that dependency without fabricating successful responses.

Before any hosted paid call, reserve estimated cost and concurrency atomically in Neon. Bound per-user and global usage, context, output, and retries. Store logical operation IDs, execution attempts, states, input versions, and model/prompt provenance. Settle known usage once and retain reconcilable reservations for ambiguous provider outcomes. Do not release an uncertain charge as though the provider did no work. No payment integration is required for these engineering limits.

Persist student messages before calling the provider. Keep ordered messages and at most one active generation per session initially. The server loads owned course context and exact material versions. Treat uploaded instructions as untrusted content. Validate generated citations against the passages actually supplied, and retain the existing grounding labels.

Preserve streamed replies, Stop, retry, tutor stages, session summaries, and links from materials and reviewed answers. Checkpoint partial replies and expose complete, interrupted, cancelled, or failed outcomes accurately. Refresh reads saved state instead of regenerating. A visible partial reply must not trigger a hidden retry that creates another answer or billable operation. A stale execution cannot publish into a newer session operation.

Grading and generation operations need persisted states and recovery semantics. Complete available execution paths using existing capabilities. Do not represent in-memory work or a detached promise as durable background execution. Leave unavailable execution explicitly blocked while continuing the rest of the application. Background infrastructure decisions remain outside this brief.

Tutor completion and linked planner activity must reflect actual completed learning, not merely opening a session. Retain independent, assisted, and self-rated evidence distinctions.

## 5. Assessments and exam rehearsals

Migrate planned assessments, rehearsal configurations, libraries, active runs, and results. Preserve existing settings including overall or per-section timing, untimed runs, navigation rules, section locking, flags, allowed materials, and extra time. Move runtime-independent validation out of client-only dependencies where necessary and enforce it on the server.

At run creation, snapshot the configuration, ordered question versions, and allowed material versions. The server owns time, section activation, deadlines, navigation restrictions, and locks. Client timers are displays. Reload, a changed device clock, or another browser cannot restart time or unlock answers.

Active exam payloads contain no answer keys, explanations, grading, or feedback. Finishing a section may lock it but reveals no marks. No tutor hints or feedback appear until the whole paper is submitted. This preserves personal rehearsal behavior without adding proctoring or institutional exam administration.

Server checks reject writes to locked sections and after deadlines. Expired runs finalize idempotently from eligible saved answers. Reconcile expiration on run access and before every mutation, with bounded maintenance using the existing maintenance entry point where appropriate. Closing the browser must not keep the run answerable indefinitely. Manual submission atomically accepts eligible final answers and produces the same single-attempt invariant as practice. Display whether the run ended manually or expired.

## 6. Planner, progress, home, and supporting screens

Persist assessments, availability, dated exceptions, planned sessions, and check-ins. Preserve weekly and daily views, manual scheduling, and the review-before-apply planning flow. Compute proposals from owned persisted data with shared deterministic rules. Apply a reviewed proposal against its base revision so a stale plan cannot overwrite newer scheduling changes. Complete linked sessions once when their actual learning activity completes.

Store instants in UTC, calendar dates as dates, and learner timezones as IANA identifiers. Verify daily boundaries, cross-midnight work, and timer behavior without assuming the execution host's timezone is the learner's.

Build course and workspace progress, history, home suggestions, streaks, due reviews, recurring mistakes, and resume actions from saved activity. Keep pending, assisted, self-rated, independent, and legacy evidence distinct. Do not trust client-supplied evidence totals. Aggregate over complete relevant server data, not the first page of history. Any derived cache must be rebuildable and tied to the rules version.

Connect course overview, setup, syllabus review, settings, workspace search, and in-app notifications to the same account data. Syllabus imports remain reviewed before applying an outline. Search is ownership-scoped and bounded. Keep the prototype's in-app reminder behavior without adding delivery channels.

## 7. Main application and existing local work

Bring the existing application shell and feature routes onto online data. Once their behavior is integrated, make the signed-in online workspace the primary experience and keep local mode as an explicit accessible choice. Maintain useful old online deep links or redirects. Preserve the local entry path and existing browser restoration behavior throughout.

Signing in never silently uploads or replaces rawi.state.v1. Provide versioned online export and an explicit reviewed path for importing existing local exports. Validate size, structure, and ownership, remap references, preserve question and material versions, provenance, legacy grading, and historical activity, and deduplicate repeated imports. Publish each bounded import atomically or stage it invisibly until complete. Never expose a partially linked workspace as a successful import.

Clearly identify unsupported records before the user commits an import. Keep them recoverable in the original export instead of silently dropping history. Do not turn a local placeholder file into a downloadable original or promote an unverified legacy timer into a valid active online exam. Retain local originals until the user has verified the imported result. Automatic merge, cross-device offline synchronization, and destructive local cleanup are outside scope.

## Verification and completion

Verify each milestone in the dev server against designated development resources. Generate and review new migrations before applying them to the known development target. Missing access limits verification, not the truthfulness of the report. Do not change credentials or provision resources to make a check pass.

At minimum, exercise:

- Two accounts and two browsers. Check every feature's saved state and copied foreign IDs, including nested sources and activity links. Switch accounts during saves and streams and verify no private state leaks.
- Both material-draft regressions, immutable source links, topic removal, archives, upload retries, and existing file recovery behavior.
- Saved sets and all nine answer formats, repeated attempts, pending written feedback, objective grading, duplicate submission, and a save racing submission.
- Autosave conflicts, failed requests, and responses lost after committed writes. Reload recovers acknowledged work without duplication. Unsent work is not presented as saved.
- Tutor reload, ordered messages, cancellation, partial output, failure, retry, stale executions, and citation validation. Distinguish real provider checks from checks that could not run.
- Concurrent AI reservations and duplicate settlement. Provider timeout or ambiguous completion must not bypass spending limits or silently regenerate work.
- Exam deadlines, section locks, clock manipulation, browser closure, cross-browser resume, and expired/manual submission races. Verify response payloads as well as the UI for feedback leakage.
- Planner revision conflicts, repeated completion links, timezone boundaries, and progress/history consistency after pending feedback becomes graded.
- Explicit import/export, repeated import, reference remapping, legacy provenance, and preservation of local data. A failed import cannot appear complete.
- Existing local mode and npm run dev. Run npm run typecheck, npm run build, and Worker dry-run packaging, and report material warnings. Do not add tests or CI.

Use coherent commits per implemented milestone and keep README accurate about delivered behavior. Do not describe the full migration as complete while a core feature is only a stub or an unverified external integration. FULLSTACK_HANDOFF.md must distinguish implemented and verified features, implemented but unverified paths, and unfinished or externally blocked work. Include the final route/API map, migrations, actual checks, remaining dependencies, and the next concrete action for each gap.

## Agent kickoff prompt

Implement FULLSTACK_IMPLEMENTATION_BRIEF.md as one coordinated migration of the existing Rawi app. It supersedes the practice-only scope of BACKEND_IMPLEMENTATION_BRIEF_03.md. Carry over the material-editor draft fix, preserve existing product behavior and local data, and connect each feature through its UI, authenticated API, persistence, and recovery. Continue through the internal milestones without waiting for separate briefs. Leave infrastructure decisions and provisioning out of scope, continue independent work when a dependency is unavailable, and report gaps honestly. Verify in the dev server, commit coherent changes, and maintain FULLSTACK_HANDOFF.md with actual results.
