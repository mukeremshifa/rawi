# Rawi backend plan

Status: architecture proposal for discussion, 3 October 2026. Product decisions confirmed in the conversation are separated from proposed implementation choices.

## 1. Confirmed product direction

- Rawi is an openly accessible personal learning product with direct individual subscriptions.
- Institutions can sponsor access for their members. Sponsorship does not restrict which subjects a learner studies.
- Learning data belongs to the learner's independent workspace. Organization administration is a separate boundary.
- Institutional integrations are later work.
- Online use is the primary experience. Offline support is optional future work.
- Cloudflare is the preferred application platform.
- The initial audience is 1,000 users in the Middle East.
- The first SaaS release supports PDF, Word, PowerPoint, text, and Markdown.
- Preserve the existing tutor, practice, exam rehearsal, planner, and progress behavior unless we deliberately change it.

Database host, specific launch countries, identity and payment providers, prices, allowances, and retention periods remain open. Recommendations below remain provisional where they depend on those choices. The 1,000-user figure is an audience target, not 1,000 simultaneous AI requests.

## 2. Architecture recommendation

Keep the React application and a TypeScript backend in this repository. Build a modular application with an HTTP Worker and background Workflows. Both use the same domain services and database. Start with managed PostgreSQL, private R2 storage, and Workflows for durable orchestration. Use a document-processing container for libraries requiring a full runtime.

The API handles authentication, ownership checks, saved work, entitlements, and interactive tutor requests. Background Workflows handle extraction, question generation, written feedback, exports, and deletion. The database is authoritative for operation status and results. Workflow parameters identify work rather than containing entire documents or conversations. Store large intermediate artifacts in R2 and pass references between steps.

Suggested modules: identity, workspace, materials, learning, tutor, planning, billing, organizations, usage, and operations. Give modules clear service interfaces, without making them independent network services.

### Proposed Cloudflare stack

| Responsibility | Proposal | Reason |
| --- | --- | --- |
| React delivery | Workers Static Assets | Keep Vite and a same-origin API |
| API and tutor streaming | Cloudflare Workers, TypeScript | Authorization and streamed model responses |
| Primary database | Managed PostgreSQL through Hyperdrive | Transactions across learning records, grants, seats, and accounting |
| Files and extraction artifacts | Private Cloudflare R2 buckets | Keep binaries outside the database |
| Durable background processing | Cloudflare Workflows | Retriable steps and persisted execution state |
| Native document parsing | Cloudflare Containers | Full runtime for PDF and Office libraries |
| Model calls | Existing Vertex AI integration with hosted authentication | Preserve prompts and model provenance |
| Recovery dispatch | Scheduled Worker scanning a bounded database outbox | Recover missing workflow starts |

I recommend PostgreSQL rather than D1 for the first implementation. D1 remains viable at this audience size, but its current 10 GB per-database limit and eventual partitioning choices introduce a different growth model. PostgreSQL gives this design a straightforward home for transactions, relationship constraints, and optional row security. This is a design preference, not a claim that D1 cannot support 1,000 users. The tradeoff is a separate database vendor and a baseline database bill. Select that host after comparing regional latency, recovery, connection limits, and price.

Disable Hyperdrive query caching on the initial application binding. Its cache is enabled by default and writes do not invalidate cached reads. Entitlements, permissions, balances, and just-saved answers require fresh reads. Hyperdrive pools at transaction scope, so authorization context must be transaction-local. Add selective caching only for clearly safe read models later.

Workflows orchestrate extraction but do not make CPU-heavy parsers ordinary Worker code. Prototype the container path with representative files before selecting a parser. If unsuitable, replace extraction behind the same job contract. Queues, KV, Vectorize, and a separate tutor Durable Object are optional additions when a specific use case needs them. Containers themselves use Cloudflare's Durable Object machinery.

The current Node HTTP entry point, filesystem ledger, environment loading, and Application Default Credentials need runtime adaptation. Shared prompts, validators, and learning rules can remain. Do not assume nodejs_compat makes every current dependency deployment-ready.

Use managed authentication. Select the provider after deciding required sign-in methods and account recovery. Keep a Rawi user ID independent of provider identity IDs. Use one global learner identity space, with organization memberships in Rawi's database.

Stripe Billing is a candidate for individual checkout and institutional seat subscriptions. Merchant country, payment methods, and invoicing requirements must be checked before selecting it. Rawi's entitlement service remains independent of the billing provider.

Avoid selecting an ORM or HTTP framework before the runtime and team preferences are settled. Their required capabilities are typed validation, transactions, migrations, streaming, and explicit SQL access when needed.

## 3. Identity, ownership, and authorization

Create one personal workspace per user initially. Workspace ownership does not depend on an organization membership, email domain, subscription, or active payment method.

An identity is the combination of provider and provider subject. Email can change and is not the database primary key. Link additional sign-in methods only after proof of control. Accept an institutional invitation into the user's existing account rather than silently creating another learner account.

For a browser application, prefer server-validated sessions in secure, HttpOnly cookies. Use CSRF protection on state-changing requests, explicit session expiry and revocation, and a same-origin API where practical. Sign-out clears private client caches. Require stronger authentication for privileged administration when the selected provider supports it.

Every learner-data operation resolves the workspace from the authenticated user. Never accept an owner ID from the browser as authority. References to courses, materials, questions, and attempts must be checked within that workspace. Use scoped foreign keys or equivalent constraints so a valid ID from another workspace cannot be linked accidentally.

Organization roles initially cover owner, administrator, billing administrator, and member. Role permissions apply to organization administration. Membership alone provides no permission to read a learner's courses or tutor messages. Platform support access is exceptional, explicit, and audited.

PostgreSQL row-level security can add a second layer of isolation. If used, run application queries with a role that cannot bypass policies and set request context inside each transaction. Policies are not a substitute for service authorization. Worker access must be scoped too.

## 4. Data model

Normalize records that need independent updates, filtering, authorization, or history. Use validated JSON for varied answer formats, rubric structures, and immutable snapshots. Do not store the entire current browser state as a single database record.

| Area | Proposed records | Important relationships |
| --- | --- | --- |
| Identity | users, auth identities, sessions as required by provider | Stable Rawi identity, multiple verified sign-in methods |
| Workspace | workspaces, preferences, drafts | One personal workspace per user initially |
| Organization | organizations, memberships, invitations | A user may belong to multiple organizations |
| Commercial access | billing accounts, subscriptions, plan versions, access grants, seat assignments | Individual or organizational payer, grants issued to learners |
| Learning structure | courses, topics, topic relationships | Scoped to a workspace |
| Material library | materials, material versions, file objects, passages, passage-topic links | Passages belong to immutable material versions |
| Questions | questions, question versions, rubrics, practice sets, set items | Sets reference fixed question versions |
| Practice and rehearsal | runs, run items, answers, attempts, feedback revisions | Answers bind to the question version actually shown |
| Tutoring | tutor sessions, messages, citation links, session summaries | Ordered messages, citations to material versions |
| Planning | assessments, availability, exceptions, planned sessions, check-ins | Learner calendar spanning courses |
| Operations | operations, outbox, usage reservations, usage entries, webhook inbox, audit records | Durable work, accounting, and recovery |

An attempt is the completed learning record. A run is the mutable activity in progress. Submitting a run freezes its answer snapshot and creates or finalizes one attempt in a transaction. Written feedback may arrive later and has its own revision history.

Common mutable records have an ID, workspace ID where relevant, timestamps, and a revision number. Archive hides records without breaking history. Permanent deletion follows a separate workflow. Index common reads by workspace, course, status, and timestamp. Apply uniqueness constraints to message sequence numbers, operation keys, webhook IDs, active seat assignments, and run-to-attempt relationships.

Preserve source versions even after a material edit. A tutor citation must open the passage actually used. An explicit permanent deletion can remove source content and leave a clear unavailable-source reference. It must not quietly redirect old citations to new text.

## 5. Subscriptions and sponsorship

Keep three independent concepts:

1. A billing account pays for a subscription or agreement.
2. An access grant gives a learner a versioned set of benefits for a defined period.
3. A usage account records consumption attributed to a grant and payer.

Membership and sponsorship are separate. A member can remain in an organization after their sponsored seat ends. An organization administrator need not consume a learner seat.

Recommended initial policy: feature availability is the union of active grants, while each paid operation uses one eligible funding grant. Select a default funding grant explicitly and record it on the operation. Do not silently pool all sponsors' budgets or charge a personal payment method when sponsored capacity runs out. Multiple funding sources can be supported in the data model without exposing a complex selector at launch.

Recommended institutional offering: a fixed allowance per sponsored learner, plus an organization spending ceiling. Pooled organization allowances can follow if customers need them. This limits one member's ability to exhaust everybody's usage.

Personal billing must remain visible when sponsorship is added. Show overlapping coverage and offer an explicit transition such as cancellation at the end of the paid period. Do not automatically resume a cancelled personal subscription when sponsorship expires.

Initial sponsorship flow: organization purchases seats, administrator invites members, a signed-in user accepts a short-lived invitation, and the server atomically allocates a seat and creates the grant. Concurrent acceptances cannot exceed purchased capacity. Reassignment ends the former grant and creates a new assignment with history. Domain verification may prove organizational control later, but an email domain alone does not grant administrative power.

Recommended lapse behavior: preserve access to reading and exporting existing work while restricting new paid AI operations. Storage retention, edit permissions, payment grace periods, and deletion schedules still need product decisions. An expiring sponsorship never transfers data to the institution.

Verify billing webhook signatures, durably record incoming events, acknowledge them, and process them asynchronously. Duplicate delivery is expected. Reconcile current subscription state so old or reordered events cannot restore expired access. Periodic reconciliation recovers missed webhooks. Checkout redirects are not proof of paid access.

## 6. AI operations and accounting

Keep the existing provider integration initially, behind a small interface for streamed text, structured responses, cancellation, and usage metadata. Verify available models and prices when implementing. Prototype model names and price comments are configuration history, not production pricing authority.

Replace local Application Default Credentials with a production credential strategy for Workers. Cloudflare AI Gateway documents Vertex AI authentication and is a candidate adapter, subject to regional endpoint and model compatibility. If used, disable content logging and caching unless deliberately enabled for an appropriate purpose. Gateway analytics do not replace the database usage ledger. Credentials remain server-side, narrowly scoped, and rotatable.

Each AI operation records its user, workspace, funding grant, type, status, input references, prompt version, model, timestamps, retry history, and usage. Save the actual model that answered. Store enough versioned input references to explain a result without duplicating private text in operational logs.

Use an explicit state machine: queued, running, succeeded, failed, cancelled, or interrupted. Execution attempts are separate from the user's logical operation. A retry must not create another practice set or apply feedback twice.

Before a provider call, atomically reserve allowance and internal estimated cost. Use integer accounting units or fixed-precision decimals. Enforce per-user, funding-account, and global limits across all API and worker instances. Record the billing period on the reservation so a request crossing a renewal boundary settles in the correct period.

After the call, settle actual reported usage and release unused reservation. Release the whole reservation only when the call is known not to have been sent. Unknown outcomes retain a bounded, reconcilable estimate. Distinguish internal provider cost from the user's product allowance and any customer invoice.

Provider requests cannot generally be made exactly once across a network failure. Idempotency can prevent duplicate Rawi results, but cannot promise that a provider never charges for an ambiguous retry. Track every execution attempt, bound retries, and avoid automatic retry after visible tutor output has begun.

Use a database outbox: create domain state and pending work in one transaction, then start a Workflow with a deterministic instance ID derived from the operation. A scheduled dispatcher recovers missing starts. Workflow steps claim operations using leases and conditional state transitions. Unique result constraints prevent duplicate commits. A recovery process finds expired leases and undispatched work. Step retries still require idempotent external side effects. Never hold a database transaction open during a model call.

## 7. Tutor request lifecycle

1. The browser sends a session ID, message, action, optional focus passage ID, and idempotency key.
2. The API validates ownership, session revision, entitlement, and input size.
3. Persist the student message and AI operation before calling the model.
4. Load conversation and learning context from authorized server records. Pin all material versions used.
5. Reserve usage, invoke the model, and stream text. Preserve the existing newline-delimited JSON protocol initially.
6. Save partial output periodically, with a monotonic sequence or offset. Commit the final validated reply, citations, usage, and state transition together where possible.
7. Refreshing the page retrieves saved operation status and output. It does not automatically start another generation.

Allow one active generation per tutor session initially to preserve conversation order. Parallel work in separate sessions is controlled by user and platform limits.

On browser disconnection, attempt to cancel the upstream call and save the interrupted output. On explicit Stop, use a server cancellation request as well as closing the browser stream. Cancellation is best effort and may still incur usage. If the process crashes, recovery marks the operation interrupted and exposes a retry. A later durable live-generation service is possible if continuing through disconnection becomes important.

Build context on the server using selected passages, topic links, recent messages, and bounded summaries of prior work. Begin with the existing retrieval rules plus database text search. Add semantic retrieval when a representative set of learner queries shows it improves recall. Keep ownership filters inside retrieval, before selecting results. Summaries remain derived data with references and can be rebuilt or deleted.

Treat uploaded material as untrusted source content. Validate returned citations against the exact passages sent. Citation validity proves the reference exists, not that the model's claim is correct. Keep the existing distinction between material-grounded and general explanations.

## 8. Material ingestion

The confirmed first scope is PDF, Word, PowerPoint, text, and Markdown. Proposed launch extensions are .pdf, .docx, .pptx, .txt, and .md. Legacy .doc and .ppt support is a separate conversion decision. Scanned PDFs need OCR or an explicit partially readable state. Diagrams, formulas, tables, speaker notes, and reading order require acceptance examples before choosing a parser.

Cloudflare's documented Markdown conversion supports PDF and DOCX but does not list PPTX. Do not use it as the only ingestion path. Evaluate a dedicated parser container covering the required formats. Preserve source text separately from model-generated diagram descriptions. Use page locations for PDF, slide locations for PowerPoint, and section or paragraph anchors for Word where pagination is not preserved.

Include Arabic, English, mixed-direction text, equations, multi-column PDFs, and slide tables in the evaluation corpus. Language requirements need confirmation, but these checks fit the stated audience. Retrieval tokenization and summaries must not assume English. The current four-character keyword filter is insufficient evidence of Arabic retrieval quality.

Proposed pilot limits are 25 MB per file and 200 pages or slides per processing job. These are tunable application limits to validate with real course materials, not platform limits or promised plan allowances. Explain encrypted, corrupt, oversized, and unsupported files clearly. Processing limits do not determine subscription storage quotas.

Upload flow: reserve storage allowance, issue a restricted upload destination, upload into private quarantine storage, verify actual size and type, then enqueue processing. Finalization checks the stored object rather than trusting client claims. Expire unfinished uploads and release their reservations.

The parsing container inspects files and extracts text in a constrained process with resource limits. The Workflow preserves page or slide locations, creates versioned passages, and publishes the material when its usable content is ready. Show queued, processing, ready, partially readable, or failed states. A failed extraction never becomes fabricated study content.

Keep original files, extracted artifacts, and database metadata linked by version. Limit file bytes, pages, extraction time, and total workspace storage. Downloads require authorization and short-lived access URLs. Signed URLs are bearer access and should be narrowly scoped and short lived.

Deduplicate repeated uploads within a workspace when appropriate. Do not expose whether another learner has uploaded the same file. Archive excludes a material from new retrieval while retaining references. Permanent deletion removes originals, extracted text, search entries, and derived context according to the defined retention policy.

## 9. Practice, grading, rehearsal, and planning

Generated practice is a background operation. Validate output, then save the question versions and set atomically. Return the saved result on duplicate requests. Reopening a set never triggers generation.

Save answers before requesting feedback. Grade objective answers on the server using the existing deterministic rules. Written feedback runs in the worker and continues after navigation. Failed or pending feedback remains excluded from progress. Regrading creates a new revision with provenance.

Exam rehearsals retain the existing rule that answers, marks, and feedback are not revealed until the full paper is submitted. The server owns deadlines, section locks, finalization, and the question snapshot. Question payloads for an active rehearsal exclude answer keys and explanations. These remain personal rehearsals, with no implied proctoring or formal institutional gradebook.

Persist answers incrementally. Submission includes the latest unsaved answer changes and finalizes them atomically if the run is still eligible. Server time decides deadline acceptance. Duplicate submissions return the same attempt. A recovery process finalizes expired runs using saved answers. Define the late-answer behavior visibly in the product.

Progress remains derived from attempts and feedback rather than an independently editable score. Materialize summaries only when needed, with an algorithm version and a rebuild path. Preserve self-rated, assisted, and independent evidence distinctions. Imported legacy results retain their provenance.

Move planner application and linked-session completion into transactional server operations. Applying a proposed week checks its base revision to avoid overwriting newer manual changes. Store instants in UTC, user time zones as IANA identifiers, and date-only assessments as dates. Study days and streaks use the learner's timezone rather than the server clock.

## 10. API and client changes

Use a versioned JSON API with runtime input validation and a consistent error envelope containing code, message, request ID, and retry guidance. Use cursor pagination for histories and libraries. Build focused aggregate reads for Home and Progress instead of loading every workspace record at startup.

| Operation | Example endpoint |
| --- | --- |
| Account and access | GET /api/v1/me, GET /api/v1/entitlements |
| Course library | GET and POST /api/v1/courses |
| Edit a course | PATCH /api/v1/courses/:id with expected revision |
| Upload and processing | POST /api/v1/uploads, POST /api/v1/uploads/:id/finalize |
| Tutor | POST /api/v1/tutor-sessions/:id/messages |
| Generate practice | POST /api/v1/practice-sets/generate |
| Run and answers | POST /api/v1/runs, PUT /api/v1/runs/:id/answers/:itemId |
| Submit work | POST /api/v1/runs/:id/submit |
| Operation recovery | GET /api/v1/operations/:id, POST /api/v1/operations/:id/cancel |
| Sponsorship | POST /api/v1/organizations/:id/invitations |
| Account portability | POST /api/v1/exports, POST /api/v1/imports |

Use idempotency keys for creates, submissions, generation, and billing mutations. Scope keys by actor and operation, store a request fingerprint, and reject reuse with different content. Use revision checks on mutable records and explicit conflicts instead of last-write-wins replacement of whole sessions or workspaces.

Convert the client store into a cache of server data plus local UI state. Keep navigation state and presentation preferences local where appropriate. Autosave drafts online, display saving, saved, and failed states, and preserve unsent text during a transient connection failure. This limited recovery does not require a general offline synchronization system.

For the first release, refetch on navigation, window focus, and operation completion. A notification socket is unnecessary until a specific live interaction needs it.

## 11. Privacy, recovery, and operations

Recommended organization reporting is seats, invitation status, and aggregate adoption or allowance usage. Do not expose subjects, documents, individual answers, or conversations by default. Define report thresholds to avoid revealing activity through very small groups.

Track request latency, save failures, operation queue age, stuck jobs, AI latency, provider failures, unknown usage, webhook delay, and cost per active learner. Log IDs and structured failure categories, not document contents or conversation text. Keep secrets in managed configuration and restrict worker credentials to their tasks.

Use managed database backups with point-in-time recovery, recoverable object storage policies consistent with deletion commitments, and a documented restore procedure. Proposed initial recovery targets are at most 15 minutes of database data loss and restoration within four hours. These are targets to validate, not service promises. A restored database and object store must remain referentially consistent.

Exports include a versioned manifest and available source files. Account deletion revokes sessions and grants, stops new work, and queues cleanup across files, database content, derived context, and indexes. Preserve only deliberately defined minimal billing or audit records. Organization deletion ends sponsorship without deleting learners' personal accounts.

Before launch, settle the intended ages, countries served, retention periods, and whether any institution requires regional processing. A regional database alone does not establish regional processing for AI, authentication, logs, or backups. These product and contractual requirements determine service configuration. This plan makes no compliance certification claim.

## 12. Capacity and economics

The target audience is 1,000 users. A provisional validation workload is 100 simultaneous active sessions, 20 simultaneous tutor generations, and 10 concurrent background jobs, with a separate burst scenario of 50 tutor generations. These are sizing assumptions to revise with pilot telemetry, not measured capacity. Institutional onboarding also needs an upload burst scenario.

Use shared database-backed admission for paid model calls, replacing the process-local counter. Bound Workflow and parser concurrency separately so ingestion and generation do not crowd out tutoring. Reserve some provider capacity for interactive requests. Hyperdrive connection limits must fit the database budget, including administration and recovery connections.

For an illustrative storage envelope, 1,000 learners with 20 files averaging 5 MB means about 100 GB of originals before extracted artifacts, previews, and backups. This is a scenario, not a forecast. Estimate model usage from measured tokens per turn and questions per study session.

Proposed experience targets are ordinary reads below 500 ms at the 95th percentile, acknowledged saves below one second, and visible operation status immediately after durable job creation. Measure from launch countries. Model first-token latency and extraction time are separate metrics dependent on provider and document complexity.

Estimate monthly cost as fixed infrastructure plus model usage, extraction, storage, egress, authentication, and payment charges. Track both typical learners and heavy usage. Set commercial allowances only after measuring representative learning sessions. No exact price or capacity promise is justified from the prototype alone.

Use Cloudflare's network for delivery and choose one primary database region based on measurements from launch countries. Evaluate Worker placement near the database for query-heavy routes. R2 location hints are best effort and differ from jurisdiction restrictions. Do not promise UAE-only or Saudi-only storage or processing from a generic Cloudflare deployment. Country residency, if required, needs an end-to-end review including identity, AI, extraction, logs, and backups. Add database regions or separate search when measurements or requirements justify them.

## 13. Migration and delivery sequence

Keep npm install and npm run dev working. Retain an explicitly separate local demo mode until a backend checkpoint is chosen. Production never silently falls back to demo storage after a server failure. No infrastructure or application behavior changes are made by this planning document.

| Milestone | Scope | Observable completion |
| --- | --- | --- |
| 1. Accounts and persistence | Identity, workspace ownership, courses, topics, preferences, API validation | A learner can save work and reopen it from another browser. Another account cannot read it |
| 2. Materials | Private uploads, versions, extraction worker, passage locations | Supported materials become readable, failure is visible, old citations remain stable |
| 3. Durable learning | Runs, answers, tutor persistence, feedback jobs, progress and planner | Navigation and retries preserve work. Duplicate submissions produce one attempt |
| 4. Individual subscriptions | Checkout, grants, usage reservations, renewals, lapse behavior | Paid access follows reconciled billing state and simultaneous requests respect allowances |
| 5. Institutional sponsorship | Organization roles, invitations, seats, grants, reporting | A user gains and loses sponsorship while keeping the same workspace. Seat allocation is atomic |
| 6. Launch operations | Export, deletion, restore procedure, operational visibility, capacity measurements | Restore and recovery scenarios are demonstrated and launch capacity is measured |

Build the entitlement and operation abstractions during the early milestones, using explicit development grants before live billing. Ship institutional administration after the individual flow works, while keeping the sponsorship schema compatible from the beginning.

Import browser data through a versioned import operation. Validate all records, remap IDs within the destination workspace, preserve material references and historical provenance, and deduplicate repeat imports using an import ID and fingerprint. Stage large imports before making them visible. Report unsupported records and provide their originals for download. Keep the browser export until the user has verified the server copy. Never overwrite established server data automatically.

Retain the domain rules in shared modules where useful. Replace browser trust in grading rubrics, context passages, marks, timestamps, and ownership with server-loaded records. Replace the local JSON ledger and process-local concurrency counter before running multiple instances. Update stale comments claiming no server or generation exists as the affected modules are migrated.

Verification during implementation should exercise the dev server with two accounts, conflicting edits, lost connections, duplicate operations, material revisions, pending feedback, repeated billing events, full seats, expired sponsorship, export, and restore. This is the planned acceptance scope. No checks have been executed against an implemented backend and no test or CI scaffolding is introduced here.

## 14. Decisions needed to finalize implementation

1. Database host, operating budget, and credits within the preferred Cloudflare application architecture.
2. Specific Middle East launch countries, learner ages, and any country-specific storage or processing requirements.
3. OCR expectations, language coverage, and whether legacy .doc and .ppt files are required.
4. Sign-in methods, account recovery, and whether institutional SSO is needed for the first customer.
5. Individual plans, trial or free access, AI allowances, and storage limits.
6. Sponsorship funding precedence, personal billing transition, and seat reassignment policy.
7. Lapse behavior, data retention, export, and permanent deletion policy.
8. Organization reporting scope and any regional-processing commitments.

## References checked for this proposal

- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) documents application and static asset delivery.
- [Hyperdrive connection pooling](https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/) explains transaction scope. [Query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/) documents default caching and read-after-write behavior.
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) documents the per-database limit used in the comparison.
- [Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/) and [retry behavior](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/) inform orchestration boundaries.
- [Cloudflare Containers](https://developers.cloudflare.com/containers/) supports full-runtime processing. [Markdown conversion formats](https://developers.cloudflare.com/workers-ai/features/markdown-conversion/supported-formats/) does not currently list PowerPoint.
- [AI Gateway Vertex AI integration](https://developers.cloudflare.com/ai-gateway/usage/providers/vertex/) documents authentication and endpoint considerations.
- PostgreSQL owners and privileged roles can bypass ordinary row policies. See [Row security policies](https://www.postgresql.org/docs/18/ddl-rowsecurity.html).
- [R2 data location](https://developers.cloudflare.com/r2/reference/data-location/) distinguishes location hints from jurisdiction restrictions.
- Stripe describes signature verification, duplicate and unordered events, and subscription lifecycle handling in [Webhooks](https://docs.stripe.com/webhooks) and [Subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks).
