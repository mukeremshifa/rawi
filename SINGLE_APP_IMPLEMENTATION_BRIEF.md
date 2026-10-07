# Rawi single-app implementation brief

Superseded by [ACCOUNT_APP_IMPLEMENTATION_BRIEF.md](ACCOUNT_APP_IMPLEMENTATION_BRIEF.md). The owner has removed offline support, device storage, and user-facing JSON recovery from scope. Do not execute the offline requirements below. This document is historical.

Prepared 7 October 2026. This was the single-app consolidation brief. It superseded FULLSTACK_IMPLEMENTATION_BRIEF.md and BACKEND_IMPLEMENTATION_BRIEF_03.md wherever they required retaining local mode, separate online routes, or separate application roots.

## Product decision

Deliver one full-stack Rawi application. The authenticated backend is the source of truth for learning records. The same routes, screens, and account workspace remain usable to the extent possible without a connection. Offline access is a feature of that app, not another mode, product, workspace, or implementation of the learning rules.

Remove the local/online switch, mode badges, local demo onboarding, and the path-based application split. Preserve the existing product design and complete missing controls against the real backend. Do not retain the old application as a fallback when authentication, the API, or AI is unavailable. Empty accounts start empty.

Retain the fictional courses as an explicit development seed, outside the runtime app. Do not automatically populate anyone's workspace. Removing hard-coded sample data does not mean deleting user-created local work. Provide a bounded recovery/import path for that work while retiring the old local store.

Keep the README's chosen stack. Infrastructure selection, provisioning, credential setup, deployment, payments, and institutional administration remain outside this assignment. Browser caching, a service worker, local draft recovery, and the development seed are application work authorized here. No general offline write synchronization, new providers, automated tests, or CI are requested.

## Read and inspect first

Read AGENTS.md, README.md, BACKEND_PLAN.md, FULLSTACK_HANDOFF.md, and the previous full-stack brief as a feature checklist. Inspect src/client/main.tsx, routes.tsx, online/, features/, store/, src/shared/course/, server/backend/, server/index.ts, package.json, and the Vite/Worker setup. Inventory implemented and missing controls before replacing roots or deleting code.

The backend now contains learning runs, attempts, exam timing, planner state, tutor records, AI operation boundaries, and reviewed local import. Reuse these. The carried material-editor fix has been implemented and must keep working. Hosted AI execution is unfinished, not merely unverified. Do not describe saved blocked operations as working tutoring.

## 1. One application and development entry point

Use one router, shell, account boundary, theme system, and set of feature screens. Canonical routes should represent the product, such as /courses, /course/:id, /planner, and /history. Redirect old /online links to the corresponding canonical route, retaining record IDs, query parameters, exact material versions, and passage references. Browser Back and direct reload must work.

Reuse the richer existing components and presentation where useful, replacing their store dependencies with focused account-data hooks. Consolidate duplicate online/local screens deliberately. Do not simply rename the reduced online UI and declare parity. Preserve all nine question formats, library controls, exam settings, planner controls, source navigation, review practice, tutor summaries, progress, search, notifications, and settings.

Remove the mounted legacy StoreProvider, whole-workspace localStorage persistence, demo reset actions, and fallback seeding. Extract useful pure validation, migration, and learning functions before deleting modules. Retain a small legacy importer if needed, not an executable local application. Remove dead selectors, routes, mode labels, and dependencies after checking their remaining callers.

Make npm run dev start the single full-stack development path using the existing Vite and Worker setup. npm run dev:backend may remain an alias during cleanup, but must not start a different product. Remove the local Node AI server from normal app execution. Preserve reusable prompts, validators, and provider code needed by the backend. Missing backend configuration produces a clear setup/unavailable screen, never sample work. Keep npm install and npm run build usable.

Do not postpone removing the dual-mode architecture until hosted AI or extraction becomes available. A single app can expose an honest unavailable capability while its other features work. Keep the feature gap visible in the handoff.

## 2. Offline access in the same screens

Implement a deliberately small first offline feature: reopen the app, read cached work, and recover unsent drafts. A connection loss changes availability and save status within the existing screens. It must not create a new workspace or switch data providers to the old local store.

| Capability | Without a connection |
| --- | --- |
| App shell and navigation | Load after a successful prior online visit, including reload on a cached deep link |
| Courses, material text and saved notes | Read cached records and exact versions, clearly identify uncached content |
| Saved practice and results, tutor history, planner and progress | Read the bounded saved views already available on this device, with last-updated status |
| Unsent note/text, practice-answer, and tutor-message drafts | Preserve eligible drafts locally with their record and base revision. Label them saved on this device, not submitted or graded |
| Mutations, new runs, reveals/checks, submission, planning apply, import, upload, and AI | Require the backend. Do not simulate success, create server results locally, or automatically queue these actions |
| Active timed rehearsal | Show only the last authorized safe view and connection state. Server time, section activation, eligibility, submission, and grading remain authoritative |

Explicitly selected material downloads may be available offline. Do not mirror all original files automatically. Cache actual owned bytes through an authorized download, with type, size, version, and ownership metadata. Never retain a signed URL as the offline asset. If original-file downloads are deferred, ship readable cached text and state that original files need a connection.

Use Cache Storage for versioned app assets and IndexedDB for structured account-scoped snapshots and recoverable drafts. These are bounded caches, not a second database of record. Persist only the fields required by supported offline views. Keep component state, filters, and unnecessary intermediate data in memory. Do not copy AppState, complete API traffic, entire account exports, or all materials into browser storage.

Implement explicit allowlists and storage bounds. An initial cache budget of 50 MiB per account is sufficient, with recent-view eviction and optional pinned readable materials. Keep protected drafts separate from evictable snapshots. If a browser quota or serialization write fails, do not claim the draft is recoverable, show a copy/export option. Document concrete freshness, retention, and schema-version defaults in the handoff. Provide a small storage control to inspect usage, remove downloads, and clear cached content without silently losing drafts.

The service worker caches the public app shell and safe static assets. Do not blanket-cache /api responses, OAuth callbacks, authentication endpoints, errors, signed URLs, or POST requests. Private snapshots are stored explicitly after successful authorized reads. Retain API no-store behavior. Use versioned assets and a controlled worker update path so an update does not replace a screen containing unsent work or serve mismatched app/schema versions. Remove obsolete static caches without deleting unrelated storage or recovery drafts.

On an uncached route, explain that the content needs a connection and offer cached navigation. The first visit to an uninstalled app cannot work offline. Use request outcomes as well as network hints, since navigator.onLine does not prove API availability. A server error or 401/403 is not permission to treat stale private data as a valid authenticated response.

## 3. Account isolation and reconnection

Partition persistent private data by stable user/workspace identity and cache schema version. Offline reads are limited to data previously authorized and downloaded by the last authenticated account on that device. Never use an email address or cached identity object to confer server authorization. A fresh browser needs an online sign-in before private offline access.

Define a finite offline-access grace period from the last successful session check, initially 24 hours. This permits reading previously cached data, not starting a server session. Require reauthentication after that window. Do not claim remote revocation can be detected without connectivity. Do not store credentials, OAuth tokens, cookies, or AI secrets in the cache.

Sign-out clears private cached records and drafts after offering recovery for unsent work, cancels in-flight requests, and locks the account view across open tabs. Account switching starts from an empty private view. An offline sign-out must also lock and clear the device immediately, and complete server sign-out on reconnection before automatically reopening that account. Revoked or expired sessions detected online must not fall back to unlocked cached data. Preserve the existing stale-response guards.

After reconnecting, verify the account, refresh relevant records, and reconcile each draft against its captured base revision. A changed or missing record requires explicit review without losing the local text. A matching revision allows an explicit normal save through the existing idempotent API. Do not silently replay offline AI requests, final submissions, uploads, or other mutations. Network loss after a possible commit is ambiguous: retry the original operation ID and payload or read its receipt before creating another operation.

Keep local receipt/retry metadata only for the narrow recoverable actions that need it. Never persist bearer upload/download URLs. Do not treat local timestamps as proof that an exam answer reached the server before its deadline. Answers rejected on reconnect stay recoverable as drafts and do not alter the saved attempt. Cache active exam responses without keys, hidden feedback, or locally computed grades.

## 4. Fix the two review findings

### Exam section eligibility

In server/backend/learning.ts, saveBatch currently accepts answers to a future section before its timer starts. Checking sectionLocked and rejecting earlier positions does not establish that a section has been entered.

Validate each answer item's eligibility using server-owned activation and navigation state. Reject writes to unentered timed sections. For sequential navigation, enforce the permitted question progression as well as section locks. Free navigation may save answers only in sections whose activation has already been recorded. Do not let a supplied position field bypass per-item checks. Apply the same rules to final answer batches, retries, and saves racing expiry. Reject an invalid batch atomically.

### Arabic question deduplication

In server/backend/ai.ts, prompt normalization uses /\W+/g. Different Arabic prompts become the same empty string and valid questions are discarded. Use a shared Unicode-aware normalization that preserves letters and numbers across Arabic, English, and mixed text while normalizing intended whitespace and punctuation. Do not treat all non-Latin content as equivalent.

Correct the corresponding local-generation expression if that code is retained as a shared helper. If the obsolete server is removed, preserve only the corrected backend/shared implementation. Verify three distinct Arabic questions remain distinct, real duplicates are removed, and mixed-language and English prompts remain correct. This fix is independently verifiable without a provider call.

## 5. Explicit development data and legacy recovery

Move the existing fictional course content into development-only fixtures and provide a documented manual seed command. Seed the designated development backend through the same validated domain services or an equivalent validated transaction. Require an explicit existing development workspace target. Do not create fake production identities, populate arbitrary signed-in accounts, or seed at app startup, migration, login, npm install, or npm run dev.

Make repeated seeding idempotent with stable seed provenance. It must not duplicate records, overwrite user edits, clear a workspace, or reset development history. Include representative courses, materials, all question formats, and enough explicitly fictional activity to exercise the main screens. Keep seeded activity labelled and separate from real provider results. Never add fixture completed tutor replies as proof of hosted AI execution.

Remove fixture imports from the browser and deployed Worker module graphs. Only the manual development tooling should load them. Verify the production bundle does not include the fictional course bodies or an alternate demo application. Ordinary product constants, labels, rules, and user-requested syllabus samples are not seed records and should not be removed blindly.

Retire rawi.state.v1 as live application storage. If it exists, offer a one-time recovery/export and reviewed import into the authenticated account. Do not render it as a parallel workspace or automatically upload it at login. Distinguish known untouched fixtures from real user additions and edits using explicit provenance or exact matching. If uncertain, preserve the data as a downloadable recovery copy. Never delete an entire saved workspace merely because its seeded flag is true.

Finish the existing import/restore application gaps, including validated unfinished-practice import and reviewed restoration of online exports. Preserve history, exact sources, legacy grading provenance, and retry deduplication. Local timed exams cannot become authoritative active server exams. Disclose unsupported records before import and retain their recovery originals. Remove legacy data only after verified migration or an explicit discard action in the UI. This recovery path replaces local mode and is not a reason to retain its runtime.

## 6. Complete remaining application integration

Use the prior full-stack brief's feature sections and the latest handoff to finish the missing application controls. Integrate them into the single shell: course setup and outline review, materials, practice, exams, planner, tutor history and summaries, progress/history, search, notifications, preferences, and data recovery. Keep feedback revisions and regrading provenance visible where the backend supports them. Do not drop functioning features to simplify the consolidation.

Preserve server-side ownership, immutable snapshots, one attempt per run, server deadlines, safe citations, pending-feedback totals, spending reservations, and operation fencing. Maintain the material-draft regression fix across component consolidation and offline draft recovery.

Hosted AI and extraction remain dependent on available configured execution capabilities. Implement remaining independent integration without choosing new infrastructure or using the removed local Node server as a hidden fallback. Unavailable services have explicit per-feature states inside the one app. The handoff must name unfinished execution wiring separately from missing credentials. Those gaps do not block consolidating the shell or implementing the bounded offline feature.

## Execution and verification

Implement in coherent commits: fix the review issues, consolidate the app and development path, finish feature controls, add bounded cache/draft support, isolate the seed and legacy recovery, then verify the complete experience. Keep the single app runnable at each useful milestone. Do not stop after writing interfaces, renaming files, or removing mode badges.

Maintain FULLSTACK_HANDOFF.md as the current status record, retaining historical verification and clearly marking it as historical. Update README and relevant comments to describe actual implemented behavior. Remove obsolete dual-mode and local-AI setup instructions when their code is retired. Do not rewrite applied migrations or provision services. No tests or CI are requested, verify behavior manually in the dev server and a production build served locally where service-worker behavior requires it.

- Check canonical routes, old /online redirects, direct reload, browser Back, deep passage links, and a fresh empty account. Confirm there is only one root and no mode switch or demo fallback.
- Check the real UI for all existing learning areas, both material-draft scenarios, nine-format answering, saved/unsent states, conflict review, concurrent submission, pending feedback, planner completion, and account isolation.
- Exercise the exam bypass through authenticated requests with future-section items in save and submit batches. Check sequential and free navigation, expired sections, valid entered sections, and atomic rejection.
- Exercise Arabic, mixed-language, and English duplicate detection independently of hosted generation.
- Load owned content online, disconnect, then reload the same deep link. Verify shell, cached content, freshness labels, uncached routes, bounded history views, and unavailable actions without an alternate workspace.
- Draft eligible text during a connection loss, close and reopen within the access window, reconnect, and verify both unchanged-record saving and changed-record conflict review. Simulate quota/write failure and ambiguous server commit. Never lose a draft while claiming it is safe.
- Check online/offline sign-out, account switching across tabs, access-window expiry, online session rejection, and late responses. A second account must never see the first account's cached data or drafts.
- Verify cache bounds, eviction, explicit clearing, optional pinned content, schema upgrades, and a service-worker update while an editor is dirty. Inspect storage to confirm no tokens, signed URLs, API response sweep, or full-workspace mirror is present.
- Run the explicit seed twice on the designated target, verify no duplicates or overwritten user edits, and confirm ordinary startup/login never seeds. Inspect production artifacts for fixture content.
- Check legacy recovery, mixed demo/user content, repeated import, unfinished practice, online export restoration, and rejected active-exam promotion. Preserve recovery originals on failure.
- Run npm run typecheck, npm run build, and Worker dry-run packaging. Verify npm run dev serves the same full-stack app. Report material warnings and any checks that could not run.

Completion means one runnable full-stack application with the bounded offline feature, both review fixes, explicit development seeding, and truthful recovery and dependency states. Report completed behavior, verification, and remaining external or application gaps separately. Do not equate offline cache availability with successful server persistence or full AI functionality.

## Agent kickoff prompt

Implement SINGLE_APP_IMPLEMENTATION_BRIEF.md. It supersedes the previous requirement to preserve separate local and online modes. Consolidate Rawi into one full-stack app, preserve and complete the existing feature UI, add bounded account-scoped offline reading and draft recovery, fix the exam eligibility and Arabic deduplication issues, and move hard-coded sample courses into an explicit idempotent development seed. Retire the local runtime while preserving user data through recovery/import. Leave infrastructure decisions and provisioning out of scope. Continue through the internal milestones, verify the actual app behavior, commit coherent changes, and update FULLSTACK_HANDOFF.md with honest results and remaining gaps.
