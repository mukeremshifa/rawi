# Rawi account-based application brief

Prepared 7 October 2026. This is the active execution brief. It supersedes SINGLE_APP_IMPLEMENTATION_BRIEF.md, including its offline access, device storage, draft recovery, and user-facing JSON import/export requirements. Earlier full-stack briefs remain historical feature references. Build on the current single application and backend rather than restarting them.

## Outcome

Deliver a conventional full-stack learning app with a polished authentication flow and one persistent personal account. Courses, materials, tutor conversations, practice, attempts, exams, planner, history, and preferences belong to that account and are retrieved from the backend. The browser holds temporary screen state, not a persistent copy of the workspace.

Remove offline support entirely for this assignment. Remove Device storage, Workspace data, recovery downloads, raw account exports, JSON import/restore flows, cache controls, cached identities, offline access windows, and local draft persistence. Users should study, manage their account, and save work normally without being asked to manage application storage or technical payloads.

Keep the locked React/Vite, Hono/Workers, Neon/Drizzle, Better Auth, and private R2 stack. Keep Google as the existing sign-in method. No replacement authentication stack, new providers, infrastructure provisioning, credential setup, production deployment, payments, institutional administration, automated tests, or CI are requested. Hosted AI and document extraction remain separately tracked integration gaps. Their absence must not prevent this architectural cleanup.

## Read and preserve

Read AGENTS.md, README.md, BACKEND_PLAN.md, and the current FULLSTACK_HANDOFF.md. Inspect src/client/main.tsx, online/OnlineApp.tsx, online/api.ts, online/learning-hooks.tsx, offline/, online/Transfer.tsx, shell/navigation components, vite.config.ts, server/backend/auth.ts, routes.ts, service.ts, and the seed tooling. Check the remaining references before deleting shared helpers.

The app already has one root and canonical routes. Preserve them, its visual design, working features, account ownership checks, revision conflicts, idempotent receipts, immutable history, and designated development resources. Preserve the corrected exam section-eligibility and Unicode question-deduplication logic, and the material-editor draft fix. Verify these remain correct after refactoring rather than implementing parallel replacements.

## 1. Authentication as a product flow

Create a dedicated sign-in screen and a clear protected application boundary. Use the existing Better Auth Google integration and server session. Authentication state must distinguish initial checking, authenticated, unauthenticated, and temporarily unavailable. A network error or backend 5xx is not proof of sign-out. A cached browser identity must never establish authentication.

- Signed-out visitors to protected routes go to sign-in with a validated same-origin return destination. Preserve legitimate path, query, and fragment state. Reject external, protocol-relative, malformed, and authentication-loop return targets.
- Continue with Google initiates OAuth through Better Auth. Preserve its state, origin, cookie, and callback protections. Handle cancelled or failed sign-in with clear product copy and retry, not environment variables or device-recovery instructions.
- Successful sign-in returns an existing learner to the intended page. Bootstrap one personal workspace idempotently using the stable authenticated user ID, never an email string supplied by the browser.
- A genuinely new account sees concise first-use onboarding, with profile/display name and study preferences where useful. Persist completion server-side. Do not require an institution, subscription, sample course, or course creation to access the empty workspace. Preserve the intended destination across onboarding when still accessible.
- Offer an account menu with the signed-in identity, account/profile settings, preferences, and Sign out. Do not display Sign out to an unauthenticated visitor simply because the backend is configured. Keep identity/profile fields and workspace preferences conceptually distinct while exposing them naturally in settings.
- Save profile changes through authenticated supported server APIs. Treat Google identity and provider-managed email honestly. Do not create an unverified email-change feature or automatic account linking. Keep existing user IDs and ownership unchanged.
- Sign out revokes the server session and clears private in-memory state across tabs. No download, recovery wizard, or device-storage prompt. If there are unsaved edits, use the normal leave/discard warning. If sign-out cannot reach the server, explain that it did not complete and offer retry. Do not claim the session was revoked or build a persistent offline sign-out queue.
- An expired or rejected session stops protected requests and returns the learner to sign-in. Preserve only a safe route destination. Clear private state when the identity boundary changes. Do not move an earlier account's unsent text into a newly authenticated account.

Use secure, HttpOnly session cookies through Better Auth, with Secure enabled on HTTPS deployments and existing same-origin/CSRF protections retained. Do not put tokens, sessions, or copies of the user/workspace in localStorage, sessionStorage, or IndexedDB. The auth library may use its necessary short-lived OAuth/session mechanisms. Do not invent another session system.

Refresh sessions without blanking and remounting the whole workspace whenever focus changes. Preserve current screen state through a transient connectivity failure, show the failure accurately, and prevent stale responses from populating a different account. Use BroadcastChannel or an equivalent transient mechanism for cross-tab invalidation without private persistent browser records.

## 2. Backend authority and ordinary saving

Neon stores structured account and learning records. R2 stores private source files. The authenticated API enforces ownership, revisions, state transitions, timing, and marking. Keep browser caches in memory only, tied to the active account and invalidated appropriately. User preferences are account records, with sensible in-memory defaults while loading.

Remove cachedRead/cacheRead fallbacks and offline-account restoration from the request layer. A failed request returns a structured error, not an older IndexedDB response. Keep private API responses no-store. Handle 401 as an authentication failure, resource-level 403 as access denied, and missing resources as 404 without treating every permission error as logout. Use existing explicit account-mismatch signals to invalidate the account boundary.

Preserve ordinary autosave where it already makes sense. Show Saving, Saved, and Could not save states accurately. Saved means acknowledged by the server. Retain unsent text in component/feature memory on failure and offer Retry. Warn before navigation, reload, or sign-out when edits would be lost. A reload cannot recover unsaved memory, and the UI must not promise otherwise.

Keep operation IDs, payload fingerprints, and revision checks. An ambiguous save retries the same operation and payload while the page is open, or is reconciled through an authorized read/receipt. Do not introduce a persistent mutation queue. Server-stored draft/run records already acknowledged by the API remain resumable normally, while device-only drafts are removed.

Connection indicators may explain a failed action briefly. Do not expose cache budgets, device storage, JSON payloads, technical operation receipts, or backend configuration details as normal learning flows. Keep useful loading, empty, retry, access-denied, and not-found states in the established product design.

## 3. Remove offline and recovery machinery

Remove the offline service-worker registration and asset-generation plugin, offline hooks/providers, snapshot persistence, IndexedDB draft writes, access grace/retention policies, device locks, offline sign-out state, storage events used by that system, and recovery banners. Replace feature-level useRecovery behavior with ordinary in-memory edits and server saving.

Remove /storage and /data from navigation and routing. Old links should resolve to a useful account/settings destination or a normal not-found page, never show raw data. Remove StoragePage, OnlineTransfer, downloadRecovery, JSON Blob-download actions, automatic downloads on sign-out, and recovery/export buttons from material, practice, tutor, planner, account, and error states. Inspect all call sites, not only the two named pages.

Remove public API routes for whole-workspace raw exports, recovery-original downloads, and user-facing JSON import/restore once no product callers remain. Preserve internal validated import utilities needed by the explicit development seed, without exposing them as an end-user data-management feature. Do not delete existing imported database records or rewrite applied migrations just because their old UI is retired.

Ordinary authenticated downloads of original files the learner uploaded remain supported. This assignment removes technical workspace/answer payload downloads, not the material library's actual file functionality. Do not replace JSON downloads with another technical archive format or add new export features.

Keep static asset caching under normal browser HTTP behavior. Do not replace the removed service worker with a PWA, local data cache, or offline shell. After network loss, the already-open page may retain its current memory, but new reads and writes require the backend. First load and reload require connectivity.

## 4. Retire installations already on the device

Deleting registration code alone does not remove a previously installed worker. Provide a targeted, temporary retirement path for the existing /sw.js registration and rawi-shell-* caches so returning browsers cannot remain pinned to the old cached app.

Account for the old worker serving cached navigation before the new client executes. Serve a network-pass-through retirement worker at the existing script URL as needed, activate and retire it safely, and remove only Rawi-owned registrations and caches. Coordinate open tabs and avoid forced navigation that destroys unsaved work. Do not leave a functioning offline fallback after retirement.

Remove the obsolete rawi-offline-v1 IndexedDB database and known Rawi offline/legacy workspace keys as part of this one-time cleanup, including cached identities and device-only drafts. Do not import or replay those drafts automatically and do not download recovery files. This is retirement of the previously requested local workflow. Persisted account records in Neon and files in R2 are unaffected.

Handle blocked IndexedDB deletion and older tabs with open connections. Retrying cleanup must be safe and idempotent. Do not clear all origin storage or cookies indiscriminately, and do not disturb Better Auth session cookies. Keep retirement code isolated and documented so it can be removed after the transition. It must not become another user-facing storage subsystem.

## 5. Account-connected screens and development data

Check every main screen reads and writes the same authenticated workspace: home, courses, syllabus, materials, notes, practice, results, exams, tutor records, planner, progress/history, search, reminders, and settings. Preserve canonical deep links and old /online redirects. Route account actions through the account menu. No page should depend on a storage dashboard, cached identity, local profile, or a downloadable payload to complete a normal action.

Keep fictional course content solely in dev/fixtures and the explicit manual seed command. Startup, sign-in, onboarding, and migrations never seed. Preserve its designated target, idempotency, and protection of user edits. Internal seed tooling is not a reason to retain public transfer routes or ship fixture bodies in the browser/Worker bundles.

Hosted tutor replies, generation, grading, and extraction should remain honestly unavailable where execution is still missing. Retain their reusable backend boundaries and existing stored records. Do not reintroduce the local Node AI server, invent output, or describe this cleanup as completion of those integrations. Record remaining application wiring separately from external dependencies.

## Execution and acceptance

Work in coherent commits: account/auth flow, request and feature-state simplification, removal of user-facing recovery, installed-worker/storage retirement, then verification and documentation. Keep npm install, npm run dev, and npm run build usable against the existing designated development backend. No new services or configuration work are part of this brief.

Verify in the dev server and a locally served production build for returning-service-worker behavior. Do not add tests or CI. Record actual checks in FULLSTACK_HANDOFF.md, keeping prior offline verification clearly historical.

- Fresh visitor, Google sign-in success/cancellation/error, first-use onboarding, returning-account login, direct protected links, and safe return-to handling. Use real OAuth when available. Synthetic authenticated fixtures do not prove the OAuth flow.
- Reload with an existing session, expired/revoked sessions, backend outage, permission denial, and repeated focus changes. A temporary outage does not silently log out the learner or load an offline account.
- Profile and preference persistence across browsers, one workspace after repeated callbacks, empty fresh accounts, account-menu behavior, sign-out success/failure, and cross-tab account changes.
- All main learning routes, both earlier review fixes, material-draft preservation, autosave failure/retry, stale revisions, duplicate submission, and account changes during a late response. Inspect active exam payloads for solution leakage.
- No /storage or /data feature, recovery prompt, JSON download, workspace export endpoint, or import/restore entry point remains in the shipped product. Uploaded original-file downloads still work with ownership checks.
- Inspect browser storage during ordinary use. No Rawi private snapshots, account copies, drafts, offline queues, or workspace payloads are written to persistent browser storage. Auth cookies and normal static-asset caching are expected.
- Start from the old installed worker and offline database, upgrade to the new app, and verify retirement, blocked deletion retry, multiple tabs, and later reload. Confirm no stale offline shell reappears and no unrelated storage/session is wiped.
- Network loss retains only current in-memory work and exposes retry. No mutation is reported saved without acknowledgement, no work is queued persistently, and no JSON file is offered as recovery.
- Explicit development seeding remains repeatable, with no automatic fixtures or production fixture imports. Existing Neon history and R2 sources remain intact.
- Run npm run typecheck, npm run build, and Worker dry-run packaging. Report warnings and checks that could not run, without deploying or changing credentials.

Update README, BACKEND_PLAN.md, and relevant comments to describe the implemented account model. Remove current offline instructions and setup references when their code is retired. The final handoff must distinguish delivered behavior, actual verification, retirement limitations, and remaining AI/extraction work. Completion of this brief requires removing the old workflow, not hiding its menu item.

## Agent kickoff prompt

Implement ACCOUNT_APP_IMPLEMENTATION_BRIEF.md. It supersedes all earlier offline, device-storage, and JSON recovery requirements. Deliver a proper Google/Better Auth account flow, keep all learning data authoritative in Neon/R2, retain only temporary application state in browser memory, remove the offline/recovery UI and public payload export/import routes, and safely retire installed Rawi service workers and old local storage. Preserve working learning features, previous correctness fixes, and the explicit development seed. Leave infrastructure and provider setup out of scope. Verify the real app and auth flows, commit coherent changes, and update FULLSTACK_HANDOFF.md honestly.
