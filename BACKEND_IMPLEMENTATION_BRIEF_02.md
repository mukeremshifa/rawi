# Backend implementation brief: checkpoint 2

Prepared 6 October 2026. The owner confirmed checkpoint 1 works as expected. Proceed from that foundation. The earlier handoff retains its historical verification record, this brief does not claim those checks were repeated by its author.

## Outcome and scope

Deliver an online course material library. A signed-in learner can save pasted text, import UTF-8 text or Markdown, upload source files privately, read usable text, edit material content with preserved versions, archive and restore materials, and download originals from another browser.

PDF, DOCX, and PPTX are stored and downloadable in this checkpoint. Show explicitly that their text has not been extracted. Do not invent previews or send these files to AI. PDF and Office extraction remain the later processing checkpoint. Legacy .doc and .ppt are outside this slice.

Keep the README's locked stack: Hono Workers, Neon PostgreSQL, Drizzle with Neon HTTP/WebSocket transports, existing Better Auth, and private R2. Do not replace these with defaults from newly installed skills. No hosted AI, payments, general offline sync, bulk local-data import, heavy parser compute, or Workflows are required here. No new tests or CI are requested. Verify affected behavior manually in the dev server.

## Read and preserve

Read README.md, AGENTS.md, BACKEND_PLAN.md, BACKEND_CHECKPOINT_1.md, and the existing online implementation. Focus on server/backend/schema.ts, service.ts, routes.ts, config.ts, src/shared/online.ts, src/client/online/, and the local material types and features.

Use relevant Cloudflare, Workers, Wrangler, and Neon Postgres guidance while preserving the chosen stack. Keep unrelated local changes untouched. Keep npm install, npm run dev, and npm run dev:backend usable. Existing local storage, exports, auth, courses, preferences, revision conflicts, and account guards must continue working.

Extend the existing online routes and components. Update the configured-route allowlist in server/backend/routes.ts, which currently only recognizes checkpoint 1 paths. Scope missing R2 configuration to file actions so sign-in, courses, and pasted-text materials still work.

## Data model

Add a new Drizzle migration rather than rewriting the applied foundation migration. Use the existing workspace and course scoping conventions and stable UUIDs.

| Table | Required purpose |
| --- | --- |
| materials | Workspace/course ownership, title, kind, attribution, archived flag, current version, revision, timestamps |
| material_versions | Immutable material content revision, origin, optional source object reference, content status, creation time, version number |
| passages | Version-scoped IDs, heading, plain text, stable order |
| material_topic_links | Current material classification scoped to the same course |
| file_objects | Immutable final object key, actual byte size, detected type, checksum or ETag, ownership, timestamps |
| uploads | Owner/course, staging key, intended material or new material ID, request fingerprint, expected revision, expected size/type, expiry, state, lease and finalization metadata |
| workspace_storage | Used and reserved bytes, atomically updated under limits |

Upload public states are pending, ready, and failed. Track internal finalization ownership with a lease token and expiry, without implying a fourth successful state. Distinguish content status: readable for valid text, not_extracted for stored PDF/Office files, and failed for invalid text conversion. Upload readiness is not content readability.

Enforce same-workspace and same-course references with constraints and service checks. Unique material/version number and upload-to-result relationships prevent duplicate publication. Constrain current-version pointers to their own material. Keep object keys server-generated and private. Do not use filenames as paths.

Versions preserve content and original source files. Editing text creates new passages with new IDs in a new version. Old version and passage URLs still resolve. Title, attribution, archive, and current topic classification can be revisioned metadata without duplicating unchanged text. Editing extracted text never replaces the uploaded original.

The existing outline replacement physically deletes removed topics. Extend it deliberately: remove only current material-topic associations when a topic is removed, retaining material versions and passages. Use transactionally scoped deletion or a link-table cascade. Do not cascade topic deletion into material or passage content. Historical content must not depend on live topic names or IDs to remain readable.

## R2 configuration and limits

Use a private designated development bucket. Keep public bucket access disabled. Bind it as MATERIALS_BUCKET for Worker operations. Signed S3 URLs require server-only account ID, bucket name, access key ID, and secret access key in addition to the binding. Use consistent names such as R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY. Validate that signing and binding target the same bucket and environment.

Document only necessary configuration. Use existing designated development resources when available. Missing R2 credentials are an integration limitation, not a reason to fabricate successful uploads. Do not provision production services or deploy production as part of this brief.

Use short-lived signed PUT URLs for staging and GET URLs for downloads, initially five minutes. Configure CORS for the exact development and application origins, PUT/GET/HEAD, and required signed headers. The browser must not send its Rawi session headers to R2. Avoid credentialed cross-origin requests to storage. URLs are bearer credentials and must not enter logs or durable UI storage.

Initial configurable engineering limits: 25 MiB per file, 1 MiB for readable text input, 1 GiB of originals per workspace, and five pending uploads per workspace. These are development safeguards, not subscription promises. Validate counts and sizes server-side. Reserve declared bytes atomically before issuing a URL, then settle actual bytes once. Include archived and historical source files in used storage.

A signed Content-Type is not proof of the bytes' type. Verify actual size and basic format signatures. Check OOXML package markers with bounded ZIP inspection without executing or rendering contents. Reject encrypted, malformed, unexpected, or oversized inputs. Do not represent basic validation as malware scanning. Always download binary originals as attachments and never serve arbitrary HTML on the application origin.

## Upload and finalization lifecycle

1. Authenticate, validate course and any existing material, check revision and limits, and create a pending upload plus byte reservation in one database transaction. A stable request ID and fingerprint make initiation retries safe.
2. Return a signed PUT URL, required headers, upload ID, and expiry. The client uploads to a server-chosen staging key. A retry may reuse the pending operation while valid. New file content requires a new upload operation.
3. Finalization authenticates again and claims a bounded database lease with a unique fencing token. Already-ready operations return their existing result. Concurrent callers receive the existing result or a retryable in-progress response.
4. Read and validate a specific staging object snapshot. Avoid a HEAD-check followed by an unchecked copy: the signed upload URL remains reusable until expiry. Use a conditional read bound to the observed ETag or another verified snapshot mechanism, then persist those verified bytes under a final key that the browser never receives permission to write.
5. Make each finalization attempt's candidate final key unique and record its lease token. A stale finalizer cannot overwrite a published object or commit after its lease was replaced. Do not keep a database transaction open during R2 transfer.
6. For text/Markdown, decode UTF-8 strictly and split readable source into ordered passages on the server. Reject invalid encoding and binary masquerading as text. Sanitize rendering, with raw HTML disabled and safe link protocols. Preserve the original file separately.
7. In one short transaction, verify lease ownership and material revision, save the object record and immutable material version, publish passages and the current version, settle storage, and mark the upload ready. This is the publication boundary.
8. If R2 succeeds but the transaction fails, retain reconciliation metadata. Retry may recover the same verified candidate or create another attempt. Only one result becomes visible. A stale revision cannot overwrite an intervening material edit.
9. Remove staging objects after successful finalization where safe. Since an unexpired URL can recreate a staging object, also clean staging after expiry. Never delete a final object referenced by a committed version.

Terminal failure and expiration release reservations once. A missing upload immediately after initiation can remain pending with a clear retry action until expiry. Retryable network failures must not silently publish unreadable or partial records.

Provide a bounded reconciliation function and a repeatable maintenance command or scheduled Worker handler. It expires uploads, releases abandoned reservations, handles expired leases, and removes unreferenced candidate objects after a grace period. Cleanup claims must be fenced against publication. Track candidate keys in the database, avoid a broad bucket-wide deletion scan. Use an optional staging-prefix lifecycle rule only as an additional cleanup measure.

## API contract

Keep the existing error envelope, ownership middleware, account-change guard, and no-store behavior. Foreign IDs return 404. Validate all fields at runtime. Limits return clear errors and revisions return 409.

| Method and path | Behavior |
| --- | --- |
| GET /api/v1/courses/:id/materials | Paginated own material summaries, archive and topic filters |
| POST /api/v1/courses/:id/materials | Create pasted-text material and first version atomically with stable create ID |
| GET /api/v1/materials/:id | Metadata, revision, current content status and version reference |
| PATCH /api/v1/materials/:id | Metadata, current topic classification, archive/restore with expected revision |
| GET /api/v1/materials/:id/versions | Paginated version history |
| POST /api/v1/materials/:id/versions | New text version with stable request ID and expected material revision |
| GET /api/v1/materials/:id/versions/:versionId | Version plus bounded or paginated passages |
| GET /api/v1/materials/:id/versions/:versionId/passages/:passageId | Exact historical passage |
| POST /api/v1/courses/:id/uploads | Initiate new or replacement source upload |
| GET /api/v1/uploads/:id | Own pending/ready/failed state and result reference |
| POST /api/v1/uploads/:id/finalize | Validate and publish idempotently |
| POST /api/v1/materials/:id/versions/:versionId/download | Authorize and return a short-lived original-file URL |

Download authorization resolves the object through the owned material version, never an arbitrary client-supplied key. Pasted materials without an original return a clear no-original result. Archive keeps history and downloads available. Permanent deletion is deferred, apart from cleanup of abandoned upload artifacts.

## Online experience

Enable the Materials area in the existing online course navigation. Support add text, select file, upload progress, finalization status, retry, reading, version history, metadata/content editing, archive/restore, and download. PDF and Office entries explicitly say that the file is stored but its text is not yet available for studying.

Preserve unsent edits through request errors and conflicts. Do not invent resumable byte-level uploads. After refresh, retrieve pending upload metadata and explain when the user must reselect the file. Never equate a completed browser PUT with a saved material.

Clear caches and cancel UI requests when accounts change. Ignore stale responses using checkpoint 1's guards. Check current ownership before finalization even when an upload began in a previous session. Keep unavailable tutor/practice actions honest. No local workspace import or changes to the local material library are needed.

## Acceptance and handoff

Verify in the dev server and record evidence in BACKEND_CHECKPOINT_2.md. Keep the user-confirmed checkpoint 1 status distinct from checks performed in this run.

- Pasted text and uploaded text/Markdown persist across browsers, retain original wording, and render safely.
- PDF/DOCX/PPTX can be stored and downloaded with truthful not-extracted status and no generated passages.
- Another account cannot list, edit, finalize, link topics, read historical passages, or obtain download URLs for copied IDs.
- Missing R2 configuration affects only file operations. Courses and pasted materials still work.
- Concurrent initiation respects pending count and byte reservations. Duplicate finalization publishes one result and settles storage once.
- Reusing the staging PUT URL cannot change a published version. Exercise competing finalizers and expired-lease recovery.
- Simulate R2 success followed by database failure, expired uploads, invalid bytes, and stale revisions. Recovery leaves no duplicate versions or permanently held reservations.
- Editing creates a version and old passage links remain readable. Removing a topic preserves materials and historical text.
- Archive/restore, account switching, failed saves, direct links, original downloads, and narrow CORS work in the browser.
- npm run typecheck, npm run build, migration review, Worker packaging, and both development modes pass. No credential or signed URL appears in bundles or logs.

Use designated development services. Apply new migrations only to the known development target. Do not substitute another database or storage provider because skills suggest a different default. Report integration limitations honestly, without mocks as proof of real R2 behavior. Commit only coherent task changes and leave unrelated work untouched.

## Agent kickoff prompt

Implement BACKEND_IMPLEMENTATION_BRIEF_02.md. The owner confirmed checkpoint 1 works. Add the online material library, private R2 upload/download lifecycle, immutable material versions, and readable text/Markdown. Preserve the locked README stack and local prototype. Verify the specified failure and ownership behavior in the dev server, commit coherent changes, and write BACKEND_CHECKPOINT_2.md with actual results and remaining configuration needs.

## References

- [R2 signed URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/): signatures, expiry, and URL reuse.
- [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/): object metadata and conditional operations.
- [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/): browser origins and headers.
