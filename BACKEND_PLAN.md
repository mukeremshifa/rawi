# Rawi backend plan

Updated 4 October 2026. README.md is authoritative for the chosen stack. This document replaces the earlier provisional architecture. BACKEND_IMPLEMENTATION_BRIEF.md defines the first executable checkpoint.

Execution update, 7 October 2026: [ACCOUNT_APP_IMPLEMENTATION_BRIEF.md](ACCOUNT_APP_IMPLEMENTATION_BRIEF.md) is the active brief. Deliver a conventional account-based full-stack app with proper authentication. Remove offline support, persistent private browser data, storage-management UI, and user-facing JSON recovery/import/export. Infrastructure decisions and provisioning remain outside that assignment.

## 1. Product boundaries

Rawi is a personal learning SaaS with individual subscriptions and institutional sponsorship. Learners own independent workspaces and can study any subject. Organizations administer access without automatically gaining access to private study content. Institutional integrations are later work. The current product requires connectivity and has no offline workflow. Application data belongs in Neon and R2, with temporary client state in memory and authentication managed through server sessions.

The initial audience is 1,000 users in the Middle East. Measure latency from UAE networks. This does not imply 1,000 simultaneous generations or UAE data residency.

The complete first SaaS release targets PDF, Word, PowerPoint, text, and Markdown. Implementation is phased. Modern Office formats are the initial proposal. Legacy .doc and .ppt, OCR, and scanned-document expectations remain open.

## 2. Locked stack

| Responsibility | Choice |
| --- | --- |
| Frontend | Existing React and Vite, Workers Static Assets |
| API and streaming | Hono on Cloudflare Workers |
| Database | PostgreSQL on Neon |
| Queries and migrations | Drizzle with the Neon serverless driver |
| Authentication | Better Auth in the API, records in Neon, Google sign-in first |
| Files | Private R2 with authorized short-lived upload and download URLs |
| Initial monitoring | Workers logs and metrics |

Use Neon HTTP for single queries and non-interactive transaction batches. Use its WebSocket client when later queries depend on earlier results inside a transaction. Never emulate a transaction with BEGIN and COMMIT sent through separate HTTP requests. Create and close WebSocket clients within their request or operation, without retaining live connections across Worker invocations.

Use a request-scoped WebSocket-backed Drizzle adapter for Better Auth initially so interactive transactions are available. Verify the installed adapter and driver together. Simple application reads use HTTP. Generate the auth schema for the installed Better Auth version and manage it alongside application schema with Drizzle migrations.

Hyperdrive, separate vector storage, heavy extraction compute, and extra monitoring vendors are deferred. Introduce Workflows when a feature must continue after a request ends. Accounts and course persistence do not require it.

AI provider and model selection remain independent. Vertex AI is the prototype integration. Reuse its prompts and validation where useful, but adapt local credentials, Node runtime assumptions, and the filesystem ledger before hosted AI.

## 3. Application and ownership

Keep one repository and a modular backend. Hono routes validate input and establish the actor. Services enforce ownership and state transitions. Drizzle repositories persist records. Provider adapters handle AI and file storage. Runtime-independent learning rules remain in src/shared.

Mount /api/auth/* to Better Auth before catch-all routes. Application endpoints use /api/v1. Unknown API paths return JSON rather than the SPA document. Static Assets handles application deep links. Development uses Vite with an API proxy so cookies and OAuth callbacks share the public origin.

Use Better Auth's stable user ID as the workspace owner reference. Email is mutable. Bootstrap one personal workspace per user through a unique owner constraint and an idempotent transaction. Google sign-in accepts personal and institutional accounts without domain restrictions. Register exact callback URLs and preserve Better Auth's origin, state, cookie, and CSRF protections. Production cookies are secure and HttpOnly.

Derive ownership from the server-validated session. Scope every record lookup, nested relationship, upload, source reference, and AI operation. Browser-supplied owner IDs never confer access. Use scoped foreign keys where applicable. Row-level security is an optional additional layer rather than a substitute for service authorization or a checkpoint 1 requirement.

Organization permissions apply to organization administration. Sponsorship does not transfer ownership. Private support access, if introduced, is explicit and audited. Account changes abort protected requests and clear private screen memory before another workspace renders. BroadcastChannel invalidates other tabs without persistent identity records.

## 4. Data model

Normalize independently mutable and queryable records. Use validated JSON for variable answers and immutable snapshots. Do not save the entire AppState as one cloud JSON record.

| Area | Records | Invariant |
| --- | --- | --- |
| Identity | Better Auth user, session, account, verification | Library-compatible schema and stable identities |
| Workspace | workspaces, preferences, drafts | One personal owner, revisioned changes |
| Courses | courses, topics, topic links | Workspace and course scoped relations |
| Materials | materials, versions, passages, uploads, file objects | Citations retain exact source versions |
| Questions | questions, versions, rubrics, sets and items | Fixed question versions in saved sets |
| Learning | runs, answers, attempts, feedback revisions | One finalized attempt per run |
| Tutor | sessions, ordered messages, citations, summaries | One active generation per session initially |
| Planner | assessments, availability, exceptions, sessions, check-ins | Completion links to actual activity |
| Commercial | billing accounts, subscriptions, grants, usage accounts | Payer separate from learner ownership |
| Organizations | memberships, invitations, seat assignments | Atomic seat allocation |
| Operations | operations, reservations, usage entries, outbox, webhook inbox | Repeated delivery does not duplicate results |

Implement tables when their feature arrives. Checkpoint 1 needs auth, workspace, preferences, courses, and topics. Future records are architecture guidance, not a request for empty infrastructure.

Mutable records have revisions and timestamps. Reject stale revisions rather than overwrite newer changes. Use unique constraints for message sequences, create keys, and run finalization. Paginate histories. Archive preserves history. Permanent deletion has its own lifecycle. Store instants in UTC, calendar dates as dates, and learner timezones as IANA identifiers.

## 5. Access and billing

A billing account pays, an access grant provides benefits for a period, and a usage account attributes consumption to a grant and payer. Membership and sponsorship are distinct. Organization administrators need not consume learner seats.

Proposed policy: combine feature access from active grants, but attribute each paid operation to one eligible funding grant. Do not silently charge an individual when sponsored allowance runs out. Centralize grant selection and allowance rules. Prices and funding precedence remain product decisions.

Show overlapping personal and sponsored coverage. Offer an explicit subscription transition instead of silently cancelling or restarting billing. Sponsorship expiry preserves learning records. Proposed lapse behavior permits reading saved work while restricting new paid AI. Retention and edit permissions remain open. Raw workspace exports are not part of the current product.

Invitations are short-lived, single-use, and accepted into an authenticated account. Allocate the seat and grant atomically. Keep reassignment history. Email domains alone do not establish organizational authority.

Select the payment provider at the billing checkpoint. Verify webhook signatures, store event IDs durably, process idempotently, and reconcile current subscription state. Handle duplicate and reordered events. Checkout redirects are not proof of payment.

## 6. AI execution and spending

The browser supplies record IDs and new user input. The server loads authorized materials, conversation, questions, and rubrics. Never trust client grades, answer keys, ownership, or history as authoritative.

Record logical operation ID, owner, task, status, input versions, prompt version, model, funding source, and execution attempts. Use queued, running, succeeded, failed, cancelled, and interrupted states as applicable.

Atomically reserve allowance and estimated cost before provider calls. Use fixed-precision or integer accounting and record the billing period. Settle reported usage, release unused capacity, and retain reconcilable estimates for ambiguous outcomes. Internal cost and customer allowance are distinct.

Replace the JSON ledger and process-local concurrency counter before hosted paid AI. Enforce limits across Worker instances. Never hold database transactions during model calls. Bound retries. Database idempotency prevents duplicate Rawi results but cannot guarantee a provider never bills an ambiguous retry.

When durability is needed, commit operation and outbox together, start a Workflow with a stable operation-derived ID, and recover undispatched work. Retried steps tolerate repeated side effects and check deletion or cancellation before publishing. Large intermediate artifacts belong in R2, not workflow parameters.

## 7. Learning behavior

Tutor flow: authenticate, validate ownership, save student message and operation, load versioned context, reserve usage, and stream. Preserve newline-delimited JSON initially. Validate citations against supplied passages. Periodically save partial output. Reload retrieves saved state rather than regenerating.

Stop requests server cancellation and closes the stream. Disconnection triggers best-effort cancellation and partial saving. A crash may lose uncheckpointed text, but recovery exposes an interrupted state. Retry after visible output is a user action. Allow one active generation per session initially.

Start with existing topic and keyword retrieval, adding database text search where useful. Evaluate Arabic and mixed-language recall. Add semantic retrieval only when measured failures justify it. Authorization belongs inside retrieval and uploaded instructions remain untrusted source text.

Save answers before grading. Objective marking runs on the server using shared rules. Written feedback stays pending until valid feedback persists. Introduce Workflows when grading must survive navigation. Regrading creates a revision. Save generated questions and their set atomically. Reopening a set never regenerates.

The server owns rehearsal deadlines, section locks, snapshots, and submission. Active-run payloads exclude keys and feedback. Submission atomically accepts eligible final answers and creates one attempt. Expired runs finalize from saved answers. Preserve no-feedback-before-full-submission behavior.

Progress derives from attempts and feedback with assisted, self-rated, independent, and legacy evidence distinguished. Planner changes use revision checks and linked sessions complete once. Derived caches, if needed, are rebuildable and algorithm-versioned.

## 8. Files and extraction

Create a pending upload record with a unique object key before issuing an authenticated short-lived R2 upload URL. Configure narrow browser CORS. Finalization verifies actual size and type before marking ready. Expired and abandoned uploads receive cleanup and release reservations.

Neon and R2 do not share a transaction. Use pending, ready, and failed states, idempotent finalization, and reconciliation. Prevent reuse of a still-valid upload URL from replacing a finalized source by promoting the verified object to an immutable final key or an equivalent verified version strategy. Authorize downloads separately. Do not log signed URLs.

Upload readiness and extraction readiness are separate. A stored PDF is not automatically usable tutor material. Begin with real text and Markdown, then evaluate PDF, DOCX, and PPTX extraction on representative files. Report partial and unreadable content honestly.

Cloudflare's documented Markdown converter supports PDF and DOCX but does not list PPTX. It is a candidate for some inputs, not a complete solution. Defer heavy compute until evaluation demonstrates need. Add Workflows when the selected processing path must outlive an HTTP request.

Preserve PDF pages, slide locations, and Word paragraph or section anchors. Separate extracted text from generated diagram descriptions. Evaluate Arabic, English, mixed direction, tables, equations, scans, and speaker notes. Set file, page, processing-time, and storage limits during the materials work. Permanent deletion cleans files, extracts, indexes, and derived context consistently.

## 9. Client migration

Keep npm install and npm run dev usable for one full-stack development path. The local runtime, mode switch, and automatic demo seeding are retired. Backend failures never fall back to sample storage. Signing in never imports legacy browser work.

Use one router and application shell backed by authenticated services. Redirect previous /online links to canonical product routes. Preserve the existing product UI and complete missing controls rather than maintaining a reduced second application. New accounts start empty. Fictional data is loaded only by an explicit development seed.

Use authenticated server reads and writes with temporary account-scoped caches and unsent edits in memory. Show loading, saving, saved, conflict, and failure states accurately. Acknowledged server work survives reload, unsubmitted memory does not. Use ordinary retry and navigation warnings. Remove IndexedDB records, local workspace copies, service-worker offline access, and cached-identity authorization. Authentication and network failures are distinct states.

The account flow has a dedicated sign-in page, validated return destinations and server-persisted onboarding. Existing preference records without an onboarding flag remain complete, while new workspace defaults require onboarding. Profile name updates use the supported Better Auth API behind the authenticated account-mismatch guard. Email editing and automatic account linking are disabled.

The public device-storage and raw-data transfer screens and API entry points are removed. Existing imported server records remain intact. Validated import utilities remain internal to development seeding. Original uploaded files remain downloadable through authorized material actions. Temporary retirement code removes only the old Rawi worker, shell caches, offline database and known legacy keys. It never forces open tabs to navigate. Older tabs must close their database connections before blocked deletion completes.

## 10. Delivery checkpoints

| Checkpoint | Scope | Completion evidence |
| --- | --- | --- |
| 1. Account foundation | Hono, Neon, Drizzle, Google auth, workspace, courses, topics, preferences | Two accounts isolated, a second session sees saved work |
| 2. Material storage | R2 lifecycle, immutable versions, text passages | Duplicate finalization safe, unauthorized access rejected |
| 3. Learning persistence | Runs, answers, attempts, tutor history, planner, server rules | Conflicts visible, repeated submit creates one attempt |
| 4. Hosted AI and processing | Database budgets, hosted credentials, streaming, durable jobs, evaluated extraction | Answers survive failure, jobs recover, required formats readable |
| 5. Individual subscriptions | Payment provider, grants, limits, reconciliation | Renewal and lapse correct, concurrency respects allowances |
| 6. Sponsorship | Organizations, invitations, seats, reporting | Workspace preserved, seats cannot overallocate |
| 7. Release readiness | Account lifecycle, operational backup/restore, deletion, capacity measurements | Server recovery and account isolation demonstrated |

Budget enforcement precedes hosted provider calls even though billing arrives later. Ownership stays independent of payment from checkpoint 1 without requiring billing implementation then.

Use ACCOUNT_APP_IMPLEMENTATION_BRIEF.md for current execution. Earlier local-mode and offline-cache milestones are historical, not current product requirements. Server backup and restore are operational responsibilities, not a user-facing JSON storage workflow. Completion of this cleanup does not imply hosted AI, extraction, or release readiness are complete.

## 11. Operations and remaining decisions

Use Workers logs and metrics with request and operation IDs, latency, failures, and job age where applicable. Exclude credentials, session tokens, signed URLs, and private learning text. Measure Neon cold and warm behavior, API latency, model latency, extraction, and cost separately.

Select Neon region and Worker placement through UAE measurements. Delivery location is not residency. Configure recovery for the actual Neon plan and reconcile database and object restoration. Set retention before commercial promises.

For 1,000 users, provisional checks can use 100 active sessions, 20 concurrent tutor generations, and a 50-generation burst. These are proposed workloads, not measured capacity. Twenty files averaging 5 MB per learner implies about 100 GB of originals before derived artifacts. Forecast cost from actual usage.

Remaining decisions belong to their checkpoints: domain and credentials, Neon region, hosted AI authentication and models, extraction and OCR, payment provider and plans, sponsorship overlap, lapse behavior, retention, and reporting. They do not block checkpoint 1 code. Missing credentials limit integration verification rather than justify fake authentication or stack substitutions.

## References

- [Neon serverless driver](https://github.com/neondatabase/serverless) and [Drizzle Neon integration](https://orm.drizzle.team/docs/connect-neon) document transport selection.
- [Better Auth with Hono](https://www.better-auth.com/docs/integrations/hono), [Drizzle adapter](https://www.better-auth.com/docs/adapters/drizzle), and [Google sign-in](https://www.better-auth.com/docs/authentication/google) cover the chosen integration.
- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) and [R2 signed URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) cover delivery and private files.
- [Conversion formats](https://developers.cloudflare.com/workers-ai/features/markdown-conversion/supported-formats/) and [Workflows retries](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/) inform later processing.
