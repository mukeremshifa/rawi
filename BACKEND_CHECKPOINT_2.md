# Checkpoint 2 handoff

Implemented on 6 October 2026. The owner confirmed checkpoint 1 works before
this task. That confirmation is separate from the checks below. Google OAuth
was not repeated in this run.

## Delivered

- Online course material library with pasted text, private file uploads,
  metadata and topic editing, archive and restore, version history, exact
  historical passage links and original downloads.
- Immutable versions, passages and file records. Database triggers reject
  changes to historical content. Scoped foreign keys constrain ownership,
  course relationships and current-version pointers. Removing a topic only
  removes current material classification links.
- UTF-8 text and Markdown preserve source wording and whitespace. Rendering
  disables raw HTML, remote images and unsafe links. PDF, DOCX and PPTX have
  `not_extracted` status and no generated passages. Invalid conversion fails
  the upload without publishing a partial material.
- Five-minute signed staging PUT and authorized original GET URLs. The server
  verifies the staging snapshot with its ETag, declared size, SHA-256 and basic
  format checks before writing a unique final key. Finalization uses leased,
  fenced database publication. Browser PUT completion is never treated as a
  saved material.
- Atomic workspace byte reservations and pending counts. Retry fingerprints,
  revision checks and unique result references prevent duplicate publication.
  Archived and historical originals remain counted. A bounded scheduled
  reconciler releases expired reservations and cleans tracked abandoned
  objects. Candidate cleanup tombstones are revisited to cover delayed writers.
- Account changes abort API requests and clear online component memory.
  Unsent edits survive request failures and have explicit conflict review.
  Refresh retrieves pending upload metadata without claiming byte-level resume.

The main tradeoff is synchronous, bounded validation and text conversion in
the Worker. Heavy extraction and durable processing remain later work. Basic
PDF and ZIP package checks are not full document parsing or malware scanning.
The local store, exports, AI integration and prototype material implementation
were not changed. No test suite, CI, production deployment or alternative
database/storage provider was added.

## Development configuration

The owner explicitly confirmed that `.dev.vars` points to the designated
development Neon target despite the saved branch name `production`.
`drizzle/0001_material_library.sql` was reviewed and applied there. The applied
foundation migration was not rewritten. A subsequent `db:generate` reported
no schema drift. SQL immutability triggers are committed in the migration.

With the owner's authorization, Wrangler created `rawi-materials-development`
in the existing Cloudflare account. It is bound remotely as `MATERIALS_BUCKET`.
Public `r2.dev` access is disabled and there are no custom domains. CORS allows
only `http://localhost:5173`, PUT/GET/HEAD, and Content-Type. The environment
identity marker is present. The owner supplied a bucket-scoped signing key in
the ignored `.dev.vars` file. Both binding and S3 signing target were verified.

Wrangler's checkpoint 1 `secrets.required` allowlist excluded optional file
settings. It was removed so `.dev.vars` can supply them. Runtime configuration
checks still enforce auth prerequisites and scope missing R2 settings to file
actions. Generated Worker types contain names and types, never secret values.

An internal presigned marker request initially appeared in Wrangler's local
traces. Internal verification now uses header signing. The affected temporary
verification traces were cleared. Subsequent trace and console-log scans found
no configured credentials or signed URLs. Client-bundle and tracked-file scans
also found no configured secrets.

## Executed verification

Checks used the running Vite/Worker development server, real Neon and real R2.
Two isolated development identities and sessions were created through Better
Auth's adapter. Requests still used normal signed cookies, session validation,
ownership middleware and account guards. These sessions are verification
fixtures, not evidence of a fresh Google OAuth flow. Temporary scripts and
screenshots stayed in ignored `.rawi`, outside the application and commits.
Verification sessions were revoked and their courses archived afterward.
The isolated fixture workspace retains ten immutable originals totaling
1,801,935 bytes, with zero reserved bytes and zero pending uploads. The temporary
database failure trigger is absent. No owner workspace was imported or replaced.

| Check | Actual result |
| --- | --- |
| Pasted text and Markdown | Exact wording, CRLF, spacing, Arabic and emoji survived storage. Duplicate creates returned the same version. |
| Text version history | Editing created a new version. Old passage URLs retained exact text. Stale revisions returned 409. |
| Topic removal | Current links disappeared while material versions and historical passages stayed readable. |
| Ownership | Foreign course/material/version/passage/upload IDs returned 404 for reads, edits, finalization and downloads. Foreign topic linking failed. Account-header mismatch returned 401. |
| Missing file configuration | File initiation returned a clear 503 while courses, pasted text and no-original responses worked. |
| Real R2 formats | TXT and Markdown became readable. PDF, DOCX and PPTX were stored with no passages and truthful status. Downloaded bytes matched SHA-256. |
| Initiation and finalization retries | Repeated initiation reused its operation. Competing finalizers returned ready or retryable in-progress responses. Repeated finalization returned one result. |
| Staging URL reuse | Re-uploading different bytes through the still-valid PUT URL did not change any published original. |
| Count and byte reservations | Seven concurrent requests admitted exactly five pending uploads. A separately injected near-limit usage boundary admitted only one of two competing byte reservations. Original measured usage was restored afterward. |
| Expiry and missing bytes | Missing staging bytes stayed pending. Expiry released reservations exactly once through status lookup and repeated reconciliation. |
| Invalid files | Invalid UTF-8, binary Markdown, fake PDF, malformed ZIP and wrong Office package type were rejected. Invalid uploaded files became failed without publication. |
| Stale replacement | An intervening material edit caused 409 and terminal failure of the replacement upload, with reservation release. |
| Lease recovery | An active lease rejected competitors. Expiring the development lease allowed successful recovery. |
| Active finalizer fencing | Replacing a lease during transfer returned `lease_lost` to the old finalizer. Retry published exactly one verified 900 KB text version. A separate 900 KB upload also completed. |
| Original preservation after edits | New text versions retained their original source reference. Archive retained authorized original downloads. |
| R2 success then DB failure | A temporary, filename-scoped database trigger rejected object publication after real R2 transfer. Candidate bytes were confirmed in R2. Removing the trigger and retrying published exactly one version. The trigger and function were removed. |
| Cleanup | The real scheduled handler removed an aged, unreferenced candidate and retained the committed original. Used bytes matched object records, with zero pending reservations after the failure scenarios. |
| Chrome material UI | Safe Markdown, historical direct links, second-context persistence, foreign-account errors, failed-save draft retention, conflict review, archive/restore and sign-out clearing private UI passed, with no page errors. A textarea label issue found during checking was fixed. |
| Chrome upload and Edge reading | Real browser PUT used the exact-origin CORS rule without cookies, authorization or Rawi session headers. Interrupting finalization left the upload pending. Refresh retrieved it and retry published it. Chrome downloaded the original filename and exact bytes. Edge opened and read the Chrome-uploaded Markdown. |
| Browser account and origin boundaries | Replacing the current session with the second account and triggering revalidation cleared private UI and returned 404. A browser with an unapproved origin could not read a signed download. |
| Local prototype | `npm run dev` started Vite and the Node API. Chrome opened both seeded courses, retained local storage across reload and preserved it when switching online. |
| Tooling | `npm install`, `npm run typecheck`, `npm run build`, `npm run worker:types`, migration review, schema-drift check and Worker dry-run packaging passed. |

## Remaining checks and configuration

One 900 KB retry stalled in the local remote-binding runtime before candidate
publication. Restarting the runtime restored transfer. Storage operations now
have explicit deadlines, and a timed-out transfer cannot reach publication.
The subsequent large upload and active-finalizer recovery passed. This was a
development integration check, not a throughput or reliability benchmark.

- Production remains unprovisioned and undeployed. Before any hosted use, choose
  its exact origin, auth callback, environment and bucket configuration. Add
  only that approved origin to CORS and configure server-side secrets there.
- Scheduled jobs do not run automatically in local development. Invoke
  `http://127.0.0.1:8788/cdn-cgi/local/scheduled` while the backend is running.
  The configured 15-minute cron applies when a Worker is eventually deployed.
- Full PDF/Office extraction, legacy DOC/PPT, OCR, malware scanning, permanent
  deletion, general offline sync and hosted learning remain outside this slice.
- The build still reports a large client chunk. npm reports four moderate
  development dependency advisories in the existing Drizzle Kit loader chain.
  No forced downgrade or unrelated infrastructure change was made.
