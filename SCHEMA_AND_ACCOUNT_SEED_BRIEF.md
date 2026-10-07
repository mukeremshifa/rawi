# Rawi schema review, migration, and complete account seed

Prepared 7 October 2026. This is the active execution brief. Build on the completed account-app work and FULLSTACK_HANDOFF.md. The product remains one connected, account-based full-stack app with no offline storage or user-facing JSON recovery workflows.

## Outcome and authorization

First establish that the database structure supports the product correctly, refactor it where evidence shows a problem, and apply the necessary migrations. Then fully seed the existing development account identified by **mukerem.dev@gmail.com** so the owner can explore the implemented app through realistic linked data and normal interactions.

This assignment includes implementation and execution, not only recommendations or a seed script. The owner has authorized necessary schema changes, development migrations, and seeding of this specific account. Do not request approval again for those routine steps. Preserve existing account data and other users. A schema rewrite means a controlled data migration, not dropping the database or rebuilding authentication.

Keep the existing stack, designated development Neon database, and private R2 bucket. Do not provision infrastructure, switch providers, deploy production, reset credentials, create fake Google accounts, or perform paid AI calls just to populate the seed. Do not add tests or CI. Verify against the dev server and report what actually ran.

## Read and inspect

Read AGENTS.md, README.md, BACKEND_PLAN.md, ACCOUNT_APP_IMPLEMENTATION_BRIEF.md, and the current section of FULLSTACK_HANDOFF.md. Inspect server/backend/schema.ts, all applied Drizzle migrations including SQL-only triggers, the live development schema, service queries, API contracts, and dev/seed.ts and dev/fixtures/.

Review real query and mutation paths in learning.ts, exams.ts, planning.ts, tutoring.ts, ai.ts, feedback.ts, materials.ts, uploads.ts, and service.ts. A TypeScript type on a JSONB column is not database validation. Conversely, JSON is appropriate for immutable snapshots and variable answer shapes. Do not normalize every JSON field or replace sound tables just for consistency of appearance.

Use applicable Neon Postgres guidance while preserving the chosen Drizzle and Neon driver setup. Inspect the configured database without printing its URL or secrets. Compare the deployed schema and migration journal with the repository. Record drift before changing anything, including constraints and triggers not represented by the ORM schema.

## 1. Schema audit and final design

Write a concise SCHEMA_REVIEW.md containing the final entity relationships, identified problems and their impact, decisions to retain or change structures, migration/backfill mapping, and verification. Include a small relationship diagram if useful. The following are audit targets grounded in the current code, not a demand to rewrite every area.

| Area | Questions to resolve |
| --- | --- |
| Identity and ownership | Are Better Auth tables library-compatible, provider identities unique as required, and one personal workspace per stable user enforced? Are onboarding and preferences scoped and revisioned correctly? |
| Courses, topics, and historical labels | Are current relationships scoped to the same workspace/course, while topic removal preserves historical material, questions, attempts, and tutor context? |
| Materials and files | Do versions, current pointers, passages, originals, upload candidates, leases, storage reservations, and cleanup remain consistent under retries and partial failure? |
| Questions and sets | Are logical identity, immutable versions, set ordering, topic classification, source references, and provenance explicit enough for the actual editing and selection flows? |
| Runs and attempts | Does every answer belong to an item in the run's fixed set? Are one-attempt-per-run, submitted-answer immutability, activation, deadlines, and valid state transitions enforced? |
| Feedback | Does each revision refer to a question actually present in its attempt, not just another question in the same course? Can original responses and successive feedback be retrieved without conflicting authorities? |
| Tutor | Are message order, operation identity, session source/review links, completion links, historical topics, and incomplete replies consistently scoped and recoverable? |
| Planner and assessments | Which course/topic/activity references and searchable dates are buried in mutable JSON? Do duplicated columns and JSON fields have one authoritative source? Are calendar dates and learner timezones used consistently? |
| AI operations | Are task targets, active execution references, leases or fencing, cost units, state transitions, and settlement relationships constrained? Can retries and ambiguous charges be reconciled? |
| Operational and seed records | Are receipts bounded and indexed appropriately? Is the full legacy import envelope still necessary for seeding, or should seed provenance have a smaller dedicated representation? |

Promote relationships and frequently filtered, joined, ordered, or independently edited fields into relational columns/tables where warranted. Keep validated JSON for answer variants, fixed exam configuration snapshots, model metadata, and other true document values. When an immutable snapshot duplicates live fields deliberately, define which is historical and which governs current behavior. Avoid dual-write ambiguity.

Review missing foreign keys, same-course composite references, unique constraints, check constraints, positive revisions, allowed statuses, sequence/position uniqueness, nonnegative quantities, completion timestamp consistency, and immutable-history triggers. Database constraints should protect stable invariants even when writes come from internal tools. Some historical references intentionally cannot point at a deletable live record, preserve them through explicit version or historical identity semantics.

Assess indexes and query shape using real list/history, planner, progress, retrieval, budget, and reconciliation paths. Fix correctness or clear scaling problems such as loading all passage text to render a calendar. Use stable chronological pagination where the UI promises recent/older history, with a deterministic tie-breaker. Do not compute totals from only the first page. Use query plans or bounded measurements to justify changes rather than adding indexes indiscriminately.

Preserve the product's future ability to attach personal or sponsored access to the same independent learner account. Do not add speculative billing, organization, LMS, or seat tables before their features exist.

## 2. Refactor and migrate safely

If the audit finds the current structure adequate in an area, keep it and explain why. If it finds structural problems, change the schema and affected services, contracts, and UI together. Do not stop with an ERD or unused replacement tables. Maintain one canonical model rather than parallel old and new schemas indefinitely.

Add new reviewed Drizzle migrations after the existing history. Do not edit already-applied migrations, use schema push, truncate tables, or recreate the auth database. Before applying changes, establish a recoverable backup or restore point through the available development process, record the target identity without secrets, and rehearse data-changing migrations in an isolated development copy where available. Do not create another vendor or backend. If no safe recovery/rehearsal path exists for a destructive change, complete the design and non-destructive work and report that precise limitation before risking records.

Use expand, backfill, validate, and contract steps for substantial rewrites. Preserve IDs or maintain explicit remapping for saved URLs, exact citations, user ownership, files, attempts, and operation receipts. Backfill in bounded operations where necessary. Compare counts, nulls, duplicates, orphan references, representative content hashes, and ownership before and after. Report invalid legacy rows rather than silently deleting or inventing grades for them.

Preserve immutable data semantically during backfill. If a migration must replace an immutability trigger or restructure its table, do so deliberately within the migration and reinstall the final protections before completion. Do not leave constraints or triggers disabled for runtime or seed writes.

Apply the validated migration to the designated development database, then verify the app against the migrated state. Preserve account sessions, Google provider links, profiles, real learning work, R2 references, and non-target users. A migration may improve shared tables but the seed must write only to the resolved target workspace.

## 3. Resolve the exact account

Resolve **mukerem.dev@gmail.com** through the existing auth user record, using the application's established email comparison rules. Require one unambiguous match, then use its stable user ID and unique personal workspace for every seed write. If the workspace is absent, call the normal idempotent bootstrap for that existing user. Log only safe identity and seed-summary fields, never auth secrets or session tokens.

Do not create or link a replacement Google identity, mark an email verified, overwrite profile/onboarding preferences, or fabricate a session to make the account exist. If the user does not yet exist in the designated database, finish migrations and seed tooling, then report that the owner must sign in once. Do not seed a similarly named user, a default workspace, or every account.

Extend the explicit development seed command to accept the email target, while retaining a validated workspace-target option if useful. Document the exact executed command, resolved user/workspace IDs, and seed version in the handoff. The email is a development target input, not a production authorization rule or browser-bundled default.

## 4. Seed a complete, coherent learning workspace

The current seed largely replays legacy fixtures and leaves areas such as check-ins and active practice empty. Build a complete versioned development dataset on the final schema. Existing fictional material may be reused, but the result must exercise current backend behavior, not live only in an import-original JSON field.

Use a persisted seed-run anchor date based on the current date and the account's timezone, with Asia/Dubai only as the fallback if no learner timezone is configured. Spread history over the preceding four to six weeks and place useful assessments and planned work today and in the next two weeks. Retrying the same seed run must keep its anchor and keys rather than creating another timeline.

| Feature | Required visible sample coverage |
| --- | --- |
| Courses and outline | At least three substantive courses with goals, readable descriptions, modules, related topics, and priorities. Include English, Arabic, and mixed-language examples. At least two courses should be active, with a clearly archived sample available for archive controls. |
| Materials and notes | Several readings/notes per active course, multiple immutable versions, exact historical passage links, topic links, source-linked learner notes, and an archived sample. Include a real UTF-8 text or Markdown original in R2 with a working authorized download. |
| Stored document formats | Small valid PDF, DOCX, and PPTX originals, uploaded through the real lifecycle to the designated private bucket. Retain truthful not-extracted status unless actual extraction is available. Do not rename arbitrary bytes to those extensions. |
| Questions and sets | All nine formats across suitable topics and difficulties, valid keys and rubrics, exact versioned sources, immediate/end-feedback sets, a mixed set, a focused set, and a remediation set linked to a prior attempt. |
| Practice activity | Untimed resumable runs with saved answers, completed attempts with correct/partial/incorrect/skipped responses, repeated attempts on the same set, hints, flashcard ratings and second-pass history. Written responses include pending and illustrative graded states with explicit sample provenance. |
| Exams | Startable overall-timed, per-section, and untimed configurations, relevant navigation/locking and open-book settings, linked assessments, and historical manually submitted/expired results. Do not leave a short-lived active exam that expires before the owner opens it. |
| Tutor | Substantive sample conversations with stages, exact citations, grounding labels, summaries, and open/completed/archived sessions. Include an interrupted reply example and a saved-answer discussion. Replies are authored fixtures, not claims of real provider output. |
| Feedback revisions | An illustrative written response with at least two feedback revisions and unchanged original text, plus pending feedback elsewhere. Preserve rubric totals and show the sample provenance in the UI. |
| Planner | Availability, a dated exception, realistic daily/weekly sessions, links to reading/practice/exam/tutor activity, completed and skipped work, and a reviewable unapplied proposal. Respect existing learner settings instead of replacing them. |
| Progress and reminders | Sufficient coherent history to exercise streaks, due reviews, recurring mistakes, assisted/self-rated/independent distinctions, upcoming assessments, and read/unread in-app reminders. Derive these from activity, never inject dashboard totals. |
| Account experience | Existing profile and preferences stay intact. All seeded records appear under this same signed-in account and normal navigation, with useful empty/error states still available outside the sample content. |

Use domain services or equivalent validated, atomic internal seed operations for run transitions, marking, citations, feedback publication, and storage accounting. Objective grades should actually follow the marking rules. Historical timestamps may be controlled by narrowly scoped development tooling, not browser-supplied timing or public bypass endpoints.

Represent authored tutor and feedback examples honestly. Add explicit seed/fixture provenance to the final model if required, with a concise Sample label on affected content. Do not claim a real model generated them, record fake token consumption or charges, or make a synthetic successful provider operation indistinguishable from a real one. Seeded history can populate the development account's progress, but must remain identifiable as sample activity.

Unavailable live features remain unavailable. The owner should be able to inspect realistic saved tutor and feedback screens, but sending a new message or requesting grading must still show the actual capability state. No hidden mocks in production handlers and no paid AI calls solely for seeding.

## 5. Idempotency and existing data

Maintain stable seed keys, a dataset version, account scope, and a record/file manifest. Rerunning after success or interruption fills missing fixtures without duplicate courses, attempts, files, reminders, or byte reservations. Handle an earlier rawi-fictional-v1 seed deliberately rather than importing another indistinguishable copy. Record how existing fixture IDs are reused or superseded.

Do not reset the account, overwrite user-edited records, erase real progress, change identity, or unarchive something the owner deliberately archived. If an existing fixture differs from its recorded baseline, preserve the edit and report the conflict. New seed versions may add clearly distinguished examples where necessary. Any reset/rebase option must be explicit and limited to unchanged seed-owned records, not executed by default in this assignment.

Preserve saved onboarding and study preferences. Seed availability only when it is absent, or fit sample sessions around existing settings. Keep real and sample provenance separate enough that a future targeted cleanup is possible without a whole-account wipe. Sample fixtures and the seed tool remain outside production client and Worker bundles. No startup, login, onboarding, or migration auto-seeding.

Execute the completed seed for the target account after migration, verify its visible results, and execute it again to demonstrate safe repetition. Do not count a generated script, archived fixture courses, or records in another verification account as completion of the owner's request.

## 6. Carry forward the last handoff's gaps

The last assignment verified many API paths but could not run actual browser interaction or a successful Google OAuth exchange. Complete that verification where browser access is now available, and fix any issues found in the existing account flow. Do not replace the selected auth stack or introduce another architecture cycle.

Cover sign-in success/cancel/error, protected deep links and return paths, first-use onboarding in a separate disposable verification account, normal sign-out and failure, focus/session refresh, cross-tab account changes, autosave retry, all nine answer controls, both material-editor draft scenarios, browser storage inspection, and the returning-worker retirement path. Use the target account for non-destructive seed walkthroughs and separate fixtures for destructive or empty-account checks. Never change the target's Google identity or manufacture a successful OAuth result.

Retain the existing offline-retirement files until returning-worker behavior has actually been checked. No persistent browser data, Device storage, JSON recovery/export, or public transfer workflow may return. Distinguish ordinary original-file downloads from those removed features.

Hosted provider execution/streaming and binary extraction remain unfinished. Continue independent application fixes that this audit exposes, but do not add providers, credentials, infrastructure, or pretend the seed resolves those dependencies. List remaining live capability gaps explicitly.

## Verification and handoff

Verify the final database, API, and UI, not only TypeScript types. Do not add an automated suite or CI, use manual development checks and targeted read-only audit queries.

- Compare migration history and actual database objects. Verify constraints reject representative foreign-scope references, invalid states, duplicate finalization, and edits to submitted/immutable records. Use isolated verification data and transactions where possible.
- Check before/after row counts, ownership, source references, originals, and sample existing histories. Verify fresh migrations in the available isolated environment and the upgraded designated database. Record recovery and any deferred destructive cleanup.
- Exercise important indexed queries and account aggregates with the full seed. Confirm chronological history pages, planner dates, pending totals, and recent activity are correct without loading unrelated complete content unnecessarily.
- Verify the exact target user/workspace and record counts by feature. Ensure fixtures are active and discoverable where intended. Run the seed twice, preserve an intervening sample edit, and confirm no duplication or cross-account writes.
- Use the actual app to read an old passage, download an original, resume practice, submit once, view feedback revisions, start a fresh rehearsal, inspect tutor examples, review a planner proposal, and see corresponding history/progress. Do not apply every proposal or consume every resumable example during verification. Leave useful work for the owner to explore.
- Check another account cannot read copied target IDs or originals. Do not print private response bodies or credentials in logs. Revoke temporary verification sessions after use, without revoking the owner's ordinary session.
- Run npm run typecheck, npm run build, Worker dry-run packaging, and npm run dev. Record material warnings and any genuinely blocked checks. Nothing is deployed.

Update FULLSTACK_HANDOFF.md with the schema decisions, migrations actually applied, safe target identity, seed command/version/anchor, per-feature counts, real checks, and remaining gaps. Include a short owner walkthrough with actual app links to the seeded courses, a resumable practice run, results, tutor examples, and planner. Explain which actions are live and which content is illustrative. Keep SCHEMA_REVIEW.md as the concise final schema reference and update README only as needed.

Completion means the justified schema changes are applied, existing data is preserved, **mukerem.dev@gmail.com** has the complete visible seed, and the available account-app checks have been performed. Missing account identity or unavailable services must be reported honestly, not hidden behind a successful seed-script build.

## Agent kickoff prompt

Implement SCHEMA_AND_ACCOUNT_SEED_BRIEF.md. Audit the current and deployed schema against Rawi's actual learning and account model, refactor and migrate where justified, then fully seed the existing development account mukerem.dev@gmail.com through the final schema. Preserve authentication, existing data, account isolation, previous correctness fixes, and the connected-app architecture. Make the seed complete, coherent, repeatable, and visibly labelled where authored sample AI-like content is used. Execute it for the target account, verify it through the actual app, and finish the browser/account checks left in the previous handoff where possible. Do not provision infrastructure or simulate live provider capability. Commit coherent changes and update SCHEMA_REVIEW.md and FULLSTACK_HANDOFF.md with actual results and a short owner walkthrough.
