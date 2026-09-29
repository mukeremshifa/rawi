# Rawi: complete the desktop frontend product experience

## Purpose and scope

This extended brief covers all four batches from `FRONTEND_AUDIT.md`. It supersedes the earlier decision to defer batch 4. The milestone is a complete local desktop experience for a student with several courses and weeks of activity, from an empty workspace to routine study, review, planning and workspace management.

This is a planning deliverable. It does not start implementation. When implementation is requested, treat the four increments as an execution sequence within one milestone, not separate approval gates. Complete the requested scope rather than stopping after the audit fixes.

The five product outcomes are complete course setup, continuous study transitions, everyday management, deliberate interface states, and a functional local profile and workspace experience. The existing screens are the starting point. Implement missing behavior and verify existing behavior instead of rebuilding features that already work.

Read `AGENTS.md`, `README.md`, `FRONTEND_AUDIT.md` and the relevant code. Earlier implementation briefs describe historical checkpoints. This scope includes the answer-aware tutor handoff previously deferred in brief 03, and preserves the real AI integration now described in the README.

- Keep the current course/student navigation distinction and design vocabulary. Extend the shell for profile, settings, workspace search and notifications. Improve hierarchy, density and consistency across existing screens without reviving the Foundry redesign or replacing the visual system.
- Keep workspace data local and use dummy courses for development. Preserve existing user data and migrations.
- Preserve `npm install` and `npm run dev`. Do not add automated tests, CI, environment setup or approval gates.
- Preserve the existing local AI API, model configuration, spending limits, cancellation, validation and provenance. Small contract, prompt and validation changes required by the answer-aware handoff are in scope. New backend infrastructure is not.
- Do not make background AI calls or silently substitute simulated teaching for actual AI. Keep unavailable-service states usable and truthful.
- Follow the punctuation rules in `AGENTS.md`, including the exceptions for imported material and citations.

Global settings, a local profile, study and notification preferences, workspace management, desktop polish and accessibility checks are now in scope. Billing and subscription screens remain deferred until the paid offering is defined. Do not add fictitious plans, paywalls or upgrade prompts. PDF/OCR/Word/slide parsing, adaptive review algorithms, cloud storage, authentication, deployment, external notification delivery and collaboration remain outside this scope. A local profile must not imply a real online account or synchronization.

## Increment 1: repair the first study journey

### Material entry and immediate recovery

- Fix Add material so Paste text and Add a file both open and switching between them is reliable. Keep selected input mode separate from saved content provenance.
- Preserve entered work when switching modes. If an action would replace populated content, make that replacement explicit. Cancelling the dialog must follow the draft behavior in increment 3.
- Verify supported text/Markdown imports, file-size limits and read failures. Unsupported formats remain clearly identified file references, never readable course material or AI input.
- Allow a material to exist without a topic. When tutoring or practice requires a topic, offer Link topics directly from the reader and blocked action, with a return to the intended activity after saving the link. Do not leave a toast as the only recovery path.
- Topic selection must use the current course. When several linked topics are possible, let the student choose rather than silently using the first. If the course has no topics, provide a route to create them and return to the material.

### Course ownership

- Scope open, past and archived tutor sessions to the current course. Correct empty states as well as lists and resume URLs.
- Check ownership at the destination as well as when building the link. A missing or mismatched record must have a useful recovery action and must never open another course's work under the current course heading.
- Preserve course and target identity through reload, course switching, browser back and direct links. Inspect touched source links, practice handoffs and planner launches for the same problem.

### Honest activity entry points

- Make Materials, Tutor, Practice, Exams, Home, course Overview and affected planner suggestions agree about what the course can currently do. Reuse existing capability derivation where possible.
- Replace the claim that all tutoring and practice work from topics alone. Explain whether the missing requirement is topics, readable material, matching questions or AI availability, and offer the corresponding action.
- Show practice format availability before a student fills out setup. A format with no matching bank questions and no supported generation path must explain why it is unavailable.
- Switching question source must not silently turn essay practice into multiple choice. Preserve the chosen activity until the student explicitly selects a supported alternative.
- Keep bank-based practice usable when AI is unavailable. A failed status check must not block activities that do not need AI.
- A new course's Exams page must not recommend nonexistent presets. An empty question bank should offer a concrete route to preparing practice questions before rehearsal setup.

Acceptance: create a course and topics, add a reading, recover from omitting topic links, then reach the correct tutor or practice setup. Repeat with two courses. No incorrect course sessions, broken resume links, inert import tabs or recommendations for nonexistent content remain in this journey.

## Increment 2: complete onboarding and content management

### First visit and returning visits

- A genuinely new workspace should see the choice between sample courses and an empty workspace. Do not silently seed a demo before the choice is made.
- Existing workspaces open normally without being treated as new. Migrate any new onboarding state without reseeding, resetting or prompting existing users to repeat setup.
- Revisiting `/welcome` must not replace an established workspace. Offer Continue to workspace. Keep intentional replacement behind the existing explicit reset flow with its explanation of what will be replaced.
- Keep demo and own-course entry paths distinct and resumable. An empty own-course workspace must not inherit sample activity, tutor sessions, assessments or study availability.

### Course setup checklist

- Add a compact, persistent setup checklist to the course overview. Derive completion from actual saved records rather than maintaining a second set of completion flags.
- Cover topics, readable materials linked to topics, optional assessment dates and study availability. Label optional work clearly. Availability belongs to the whole workspace and is shared across courses.
- Do not call an entire course ready because one topic has a reading. Show useful coverage, such as how many topics have study material or questions, and allow studying the topics that are ready.
- After confirming topics, offer Add your first material with relevant topic context. After saving material, offer the available study actions. Avoid making outline replacement the main next step.
- Include an assessment step that creates real saved assessment records using the existing editor, with date, optional time, duration and topic coverage. Support several assessments, edit/cancel and a clear Skip for now action. Do not invent exam dates or require one before studying.
- Distinguish Study now from Continue setup. Show which topics support reading, tutoring, bank practice or generation, and explain remaining requirements. AI availability is separate from material readiness.
- Let a student add a second course without repeating workspace preferences. When adding a topic or material from a blocked study action, return to that specific course and activity rather than the generic home page.
- Support skipping or dismissing guidance and reopening it later. Missing assessments or availability must not block unscheduled reading or practice.
- When Plan my week has no usable availability, guide the student to availability before presenting a zero-session proposal. Preserve their intended week and course filter when returning.

### Material and note editing

- Provide editing of title, type, text and topic links for saved materials. Show save, cancel, draft and validation states consistently.
- Let students write and revise their own notes, including adding commentary to an excerpt saved from a reading. Keep the excerpt's source attribution and a source link where one is available.
- Preserve the material identity and unchanged passage identities. Renaming or relinking a reading must not break saved sets, tutor sources or result links.
- Preserve the evidence behind an existing citation when cited text changes. Retain a bounded snapshot or prior passage version for referenced content, clearly distinguished from the current reading. A citation must never silently display new text as the evidence used by an earlier answer.
- New study uses current material. Existing saved questions, answer keys, completed marks and feedback remain as recorded. Editing a source must not regenerate a saved set or regrade an attempt.
- For removed or unavailable sources, preserve historical work and show a useful source-unavailable state. Do not retarget a citation to a different passage just because it occupies the same position.
- Avoid a general document versioning system, folders, bulk import or advanced note-taking features in this pass. Reuse the existing material library and its search and filters.

### Everyday management coverage

Audit and complete the following behaviors using consistent list, detail and action patterns. These are required capabilities, not a requirement to give every record every possible action.

| Area | Required management behavior |
| --- | --- |
| Courses | Create, edit, search, sort and filter active/archived courses. Archive and restore with retained study history. Delete through an impact summary covering dependent records and drafts. |
| Topics and syllabus | Add, rename, describe, reorder, group and change priority. Find topics in a long outline. Before removal, explain affected materials, assessments and planned work. Preserve historical labels and evidence rather than assigning old work to a replacement topic. |
| Materials and notes | Create, edit, search titles and content, filter by type/topic, sort by name or recent changes, archive/restore and delete. Archived content remains available through historical references but is excluded from automatic new-study selection. |
| Practice sets | Search, filter by topic/activity/status, sort, rename, archive/restore, delete, open saved content, resume an attempt and start a distinct repeat attempt. Changing the question selection creates a new set so earlier attempts remain comparable. |
| Tutor sessions | Rename, search by title/topic/message text, filter active/completed/archived, resume, archive and restore. No permanent session deletion is required. |
| Assessments and rehearsal configurations | Search and distinguish upcoming/past assessments from saved rehearsal configurations. Edit/delete assessments. Rename, edit, duplicate, archive/restore and delete custom configurations. Retain completed attempts and their original configuration context. |
| Planner | Add, edit, reschedule, remove and skip sessions, filter by course/activity/status, and return to today. Offer the linked resume action where work has started. Explain overdue or unavailable targets and let the student reschedule or repair them. |
| History and progress | Search activity titles, filter by course/topic/type/date, clear filters, open the exact result and inspect the evidence behind topic status. Display pending feedback separately from marked results. Keep completed answers and marks read-only. |

- Provide stable, discoverable record actions from lists and detail views. Destructive actions must name the record and explain effects on dependent work. Use the established confirmation component for permanent deletion. Do not claim Undo or recovery unless it actually works.
- Preserve completed attempts when deleting a set or configuration. A course deletion may remove its dependent work only when that scope is stated. Archiving is reversible organization, never a deletion or a completion event.
- Exclude archived courses and records from new suggestions and automatic planning. Retain explicit access to their history and unfinished work, with Restore or an explained read-only state before further study. Do not silently delete scheduled sessions when archiving their target.
- If an active run depends on a record being edited or deleted, preserve its original content/configuration or block the destructive change with a route to finish or abandon that run. Do not mutate an exam while it is being sat.
- Preserve list query, filters, sort and useful scroll position when opening a record and returning. Distinguish a truly empty library from no search matches, and give Clear filters where appropriate. Keep filters scoped to their owning course.
- Ensure all records remain reachable as libraries grow. Use explicit pagination or load-more where needed, with stable ordering and visible counts. Do not truncate a list to recent records without a route to the full list.

Acceptance: pause setup after topics, reload, resume from the checklist, add material and assessment dates, and start studying before optional setup is complete. Create and edit a note. Rename and edit a cited reading, then inspect old result/tutor citations and a new study launch. With several courses and many saved records, find, edit, archive, restore, delete and resume the appropriate items without losing historical evidence or list context.

## Increment 3: complete the returning-student experience

### Drafts and save reliability

- Persist drafts for course creation/settings, syllabus proposals and edits, material/note creation and edits, assessment forms, practice setup and exam configuration. Preserve unsent tutor message text per session too.
- Key drafts by course, form purpose and edited record where applicable. Course creation and global settings drafts belong to the workspace. An unfinished edit in one course must not populate another course's form. Define one resumable new-item draft per form and owning scope, with an explicit Start new/discard choice.
- Restore drafts after navigation and reload, including incomplete or currently invalid forms. Draft persistence must not create live topics, materials, assessments, sets or exams before the relevant save/confirm action.
- Make restored state and saving status clear. Leaving an editor preserves its draft. Discard explicitly removes that draft without deleting the saved record. Successfully saving or confirming retires the corresponding draft without producing duplicates.
- An incomplete exam configuration can be retained as a draft even when it is not valid to start. It must not appear as a runnable rehearsal until validation passes.
- Preserve editable extracted text and file metadata where appropriate, but do not claim a browser File handle survives reload. Explain when an original file must be selected again.
- If a record was deleted or its source changed while a draft existed, explain the conflict. Do not silently recreate a deleted record or overwrite a newer saved version. A distributed or multi-user conflict system is outside scope.
- Surface local persistence failures with a persistent warning that work is only in memory, a retry action and a recovery download of the latest recoverable state. Report success only after the write succeeds. Avoid one warning per keystroke.
- Include the corresponding validated local recovery-import path so the download is usable. Preview what will be replaced and preserve current data until the import validates and the student explicitly applies it. Expose the same implementation from Workspace data in settings. Do not build a second import system or cloud sync.
- Preserve existing migration and corrupt-data recovery behavior. Do not silently replace failed restores with demo data or discard old work to make a migration pass.

### Continuous study context

- Preserve the selected course, topic, material, passage and excerpt from reading into tutoring and practice. Show the selected source in the destination with an explicit option to broaden it. When practice is requested from a passage, do not silently broaden it to the entire course. If no matching bank questions exist, explain that and offer a supported alternative.
- Return to the originating passage or result, including the passage anchor. Save reading position per material and offer Continue reading without treating a page opening or scroll position as completed study.
- Carry the originating tutor session through practice setup, set creation, the actual run and completion. Show a return link to that session and the resulting practice work from the session. Disambiguate set IDs and attempt IDs instead of overloading the existing `launchedAttemptIds` field.
- Associate a specific run with its launch context. Starting an unrelated repeat attempt later must not inherit an old tutor, remediation or planner link just because it reuses the same set.
- For results-to-tutor review, carry the exact originating attempt, selected question, submitted answer, outcome, hint usage and available rubric feedback. Present this context visibly in the session so the student can see what is being discussed.
- For a topic-level review covering several missed questions, show which questions are included or let the student choose. Do not imply the tutor saw every answer when it only received one.
- Include that bounded review context in the existing tutor request, server validation and prompt. Keep student answers and material as data, enforce course ownership and existing request limits, and distinguish missing, pending, failed and legacy feedback. Do not fabricate feedback or silently use a different attempt.
- Missing origins must produce an explanation and a useful next action. Preserve available historical context even if the original material or session was archived or removed.
- Carry any explicit planner session through the same flow and complete it only under the existing completion rules. Following a link, creating a set or archiving a session does not count as study. Reopening results must not duplicate history or inflate progress.
- Add Schedule another session from a reading, tutor summary and practice/exam results. Open the existing planner editor with course, topic, activity and exact target prefilled where available. Let the student review date, time, duration and conflicts before saving. Do not create a session merely because the action was opened.
- For mistake review, retain the originating attempt and selected question IDs on the scheduled work. Launching it later should reopen the intended review or practice setup, even after reload. Let the student explicitly choose a general topic review instead.
- After scheduling, show a link to the created planner session and a return action to the originating result. Editing its time must retain its study target. Missing or archived targets need repair/restore actions, not a generic unrelated activity.
- Home and course Overview should offer clear resume actions for active practice, tutor sessions, timed exams and reading. Avoid listing the same run twice as unrelated work. Distinguish unsaved configuration drafts from in-progress study and completed results.
- Preserve exam deadlines when leaving or reloading. Explain that a timed rehearsal continues to run, and handle expiry once on return without revealing feedback before submission. A normal practice pause must not accidentally behave like an exam timer.

### Tutor session organization

- Add an editable session title with a sensible default, search within the current course's sessions, and clear active, completed and archived views.
- Support archive and restore. Keep archived sessions accessible from historical links and exclude them from default resume suggestions. Archiving is not completion and must not change evidence, streaks or planner status.
- Preserve messages, source links, linked attempts and completion timestamps when renaming, archiving or restoring. Permanent session deletion is not needed for this scope.

Acceptance: leave partially completed forms, switch courses and reload, then recover the right draft. Recover from a failed save using retry or export/import. Follow reading to tutor to practice to results, review one exact missed answer, schedule a follow-up, reload, then launch that work from Planner. Trace it back to its source and earlier attempt without altering old results or double-counting study. Rename, find, archive and restore the tutor session without recording new study activity.

## Increment 4: complete the workspace shell and interface states

### Profile, workspace and settings

Add a persistent profile/workspace entry in the shell and a real settings area with stable routes, a visible current section and return navigation. Keep course settings inside their course. Global settings should have these sections:

| Section | Functional local scope |
| --- | --- |
| Profile | Edit display name and choose an initials avatar/accent. Reflect the saved identity in the shell and relevant greetings. Profile completion is optional. Do not collect passwords, pretend to verify email or simulate sign-in. |
| Workspace | Edit a single workspace name, display local storage status and link to course management. Explain that data belongs to this browser/device. Do not imply team membership, multiple accounts or cloud sync. |
| Study preferences | Set default session length, practice question count, hint preference and feedback timing. Apply defaults to new eligible activities, validate them and show when available content caps a request. Existing sets, drafts and running exams keep their saved settings. |
| Availability | Link to the existing availability editor as the single source of truth. Session length in settings and availability must edit the same preference. Do not duplicate weekly schedules in a second model. |
| Notifications | Control local in-app reminders for upcoming assessments, planned study and due review. Provide understandable categories and reminder timing choices whose effects are visible in the app. |
| Appearance and accessibility | Reuse the current light/dark/system setting, add reading text-size choices and reduced-motion preference. Apply these consistently and preserve legibility, layout and keyboard focus. Honor system preferences when selected. |
| Workspace data | Export and restore local data using increment 3's recovery path. Include profile/preferences and drafts in the versioned export. Explain replacement scope and expose the intentional demo/reset action separately from ordinary navigation. |

- Use sensible defaults for existing workspaces and migrate profile/preferences without rerunning onboarding. Settings must persist through reload and share the save-error reporting introduced in increment 3.
- Each preference must change an observable behavior. Avoid decorative toggles or unsupported options. For example, practice defaults prefill a new set but never override exam feedback rules or a restored draft.
- Show the device timezone used for dates and planning. Retain that scheduling basis in this milestone instead of adding an arbitrary timezone selector without conversion support.
- Profile, settings and data screens need loading where real work occurs, validation, save feedback and empty/error behavior appropriate to local state. Keep technical diagnostics out of ordinary profile and study settings.

### In-app notifications

- Provide an accessible notification entry and list linked to the exact assessment, planned session or review target. Use existing deadlines, sessions and review rules to derive eligible reminders, with local read/dismiss state.
- Evaluate reminders on app entry, foreground return, relevant state changes and time updates while the app remains open. Deduplicate by event and occurrence so reload does not repeatedly notify the student about the same item. A changed date or rescheduled session should update the relevant reminder, not leave an actionable stale duplicate.
- Preferences must actually suppress the corresponding categories. Dismissal affects the reminder, not the underlying assessment or planner session. Read, unread and empty states must be clear.
- State that these are in-app reminders while Rawi is open. Do not imply email, push, operating-system notifications or closed-browser delivery. No notification permission prompts or external scheduler are needed.
- Keep save errors, failed AI requests and other necessary operational messages visible regardless of reminder preferences. Do not flood the student with old demo reminders on first entry.

### Workspace navigation and search

- Provide global search over course names, topics, material titles/content, practice sets, tutor titles/messages and assessment titles using local data. Group results by type and show the owning course and a useful match excerpt.
- Support keyboard opening, movement, selection and dismissal. Use a visible search entry so the feature does not depend on knowing a shortcut. Exact result links must open the correct record and passage or message where supported.
- Keep search read-only and make empty query, no results, archived results and unavailable targets deliberate. Archived records are excluded by default with an explicit option to include them. Reuse existing per-area search semantics where possible.
- Preserve a clear active course and page, stable page titles, back navigation and access to settings/search from every ordinary workspace area. Focused exam mode may suppress distracting shell actions while preserving its exit and resume behavior.
- Refine hierarchy and density on Home, course Overview, libraries and result pages. Make the primary next action obvious and move lengthy implementation explanations out of the main task flow. Retain useful reasons for recommendations and truthful AI/source disclosures.

### Interface state coverage

Implement this state coverage across the actual features, not only as generic components or a separate showcase:

| State | Required experience |
| --- | --- |
| Empty workspace | A clear first-course action, optional demo exploration and no fabricated progress, streaks or deadlines. |
| Partially configured course | Specific missing prerequisites and returnable setup actions, with ready topics still available for study. |
| Empty collection or no matches | Distinct explanations with Create/Add or Clear filters as appropriate. No disabled dead ends or references to nonexistent presets. |
| Loading or generation pending | A meaningful progress state tied to real work, duplicate submission prevention and cancellation where supported. Do not add artificial delays to local reads. |
| AI unavailable or request failed | Explain the affected action, preserve input and prior output, allow retry/check again, and keep unrelated local work usable. Distinguish configuration, budget and connection problems without claiming a cause the app cannot establish. |
| Partial or interrupted AI output | Clearly label incomplete output, keep it reviewable, provide retry or a deliberate new request, and do not duplicate the student's message or present partial teaching as a completed session. |
| Written feedback pending or failed | Keep the submitted answer, show per-answer status and retry only the missing/failed work. Do not count pending feedback as a correct or incorrect result. |
| Paused practice or expired exam | Restore saved answers and position, explain the timer state, and create at most one completed result. |
| Failed local save or restore | Persistent recoverability guidance, retry/export/import and no false Saved state or automatic data reset. |
| Deleted, archived or wrong-course target | Explain the situation, preserve available context and provide the correct library, restore action or target repair. |
| Long or dense content | Readable paragraphs, mathematical/code content already supported by the renderer, long titles, many topics, long conversations and crowded planner days. Keep actions reachable and content inside its containers. |
| Validation and successful mutation | Errors next to their fields with retained input, explicit successful outcome, stable focus and no success message while persistence has failed. |

- Recovery must resume the intended task wherever possible. Retrying must not duplicate courses, sets, messages, attempts, sessions or activity records.
- Navigation or cancellation during an AI request must have explicit behavior. If the request is cancelled, retain recoverable inputs and identify partial output. If work is allowed to finish, save its result to the correct record and never navigate the student away from their new page unexpectedly.
- Provide a local diagnostics/retry detail for service issues if useful. Students should not need to understand model identifiers, parsers or command-line setup to navigate the ordinary frontend.

### Desktop layout and accessibility

- Check the full workspace at 1024 by 768, 1280 by 800 and 1440 by 900, plus 200% browser zoom. Check narrow layouts for basic usability without expanding into a separate mobile redesign.
- Keep ordinary pages under one main vertical scroll owner. Intentional nested scrolling for conversations, editors, tables and the calendar must have a clear purpose and accessible controls. Prevent clipped dialogs, hidden save buttons and accidental horizontal page scrolling.
- Make planner cards work with long names and many sessions. Preserve full titles accessibly and use a usable calendar scroll or alternate view when columns become too narrow.
- Verify logical keyboard order, visible focus, modal focus containment/return, Escape behavior, accessible names for icon buttons, associated field errors, and status announcements that do not interrupt typing.
- Use headings and landmarks consistently, avoid color-only status distinctions, and check readability in light and dark themes. Reading text size and reduced motion must work without hiding controls or information.
- On route changes, place focus appropriately for understanding the destination. On return from a record, preserve useful list context without unexpectedly jumping the user to the top.
- Make consistent loading, empty, error, confirmation and feedback patterns across features. Use shared primitives where they reduce inconsistency, with recovery actions specific to each task.

Acceptance: a student can edit their local profile and workspace, set preferences with visible effects, search across several courses, receive and dismiss only enabled in-app reminders, and recover from the listed interface states. The full daily study journey remains usable at the target desktop sizes, with keyboard navigation, zoom, long content and both themes. Settings and shell actions are functional, not placeholders for a future backend.

## Implementation order and verification

Deliver increments 1 through 4 in order, with shared data contracts and persistence designed early enough to support the whole scope. Shared material editing, archive semantics, drafts, search and local persistence should be implemented once and reused. The sequence organizes the work and is not permission to stop after the first increment. Use the existing store and small shared helpers instead of speculative frameworks. Commit coherent changes and update documentation minimally. Do not push or deploy.

At implementation start, map the management and state tables to existing screens and identify which behaviors already work. Use that inventory to drive targeted changes and verification, not as another standalone audit deliverable. Include a temporary local scenario with at least four courses, dozens of materials and sets, several weeks of history, long titles and pending work. Seeded happy paths alone do not demonstrate completion.

Use the dev server and isolated local data. Do not reset the owner's browser workspace. Run `npm run build`, inspect browser runtime errors and manually verify these scenarios:

| Scenario | Required result |
| --- | --- |
| First visit, demo choice, own-course choice, returning user and revisited welcome | Correct entry flow, no accidental reset or seeded activity in an empty workspace. |
| Two courses with different topics, readings and tutor sessions | Lists, drafts, actions and direct links stay in their owning course. Wrong-course links recover clearly. |
| Both material input tabs, supported text file, unsupported file, failure and mode switching | Controls work, draft text remains recoverable, unread content never becomes AI input. |
| Unlinked and multiply linked material, topic creation, later editing | Clear topic choice and repair, with return to the intended activity. |
| Setup paused and resumed, zero availability, optional steps skipped | Checklist reflects real data and each next action is usable. |
| Empty bank, supported and unsupported generation formats, unavailable AI | Choices explain availability, no silent format substitution, local bank practice remains usable. |
| Long forms and unsent tutor text, navigation, reload, discard and save | Drafts restore correctly, saved records change only on commit, no duplicate objects. |
| Saving failure and recovery import, malformed recovery file, older workspace | No false saved state, valid recovery works, invalid input changes nothing, existing data remains recoverable. |
| Referenced material renamed, edited and removed | Earlier citations retain their evidence or explain unavailability, new study uses current text. |
| Exact missed-answer review, tutor-to-practice, repeat attempt and planner launch | Correct answer context and durable return links, no inherited unrelated context or duplicate completion. |
| Tutor rename, search, archive, restore and old deep link | Organization works within one course and does not alter learning history. |
| Existing saved set resume and completed exam results | Preserve persisted answers, separate repeat attempts and full-paper feedback rules. |
| Reading to tutor to practice to mistake review to scheduling and later launch | Source, topic, exact answer and target survive every transition, reload and return, with one planned follow-up. |
| Several courses with large libraries and long history | Search, filters, sorting, archive/restore and all-items access work without lost list context or hidden records. |
| Delete a material, topic, set, configuration or course with dependent work | Scope and consequences are clear, protected active runs remain valid, preserved history never points to unrelated content. |
| Profile, workspace name, study defaults, availability and appearance | Settings persist and visibly affect only the intended future activities or display. No duplicated availability state. |
| In-app reminders enabled, disabled, read, dismissed and rescheduled | Exact target links, no duplicate or stale actionable reminders, no claim of external delivery. |
| Global search with active/archived records, matching passages/messages and no results | Correct course destinations, meaningful excerpts, keyboard access and explicit empty states. |
| Request pending, interrupted, cancelled, failed and retried after navigation | Inputs/output remain recoverable and records or messages are not duplicated. |
| Long content, crowded planner, desktop sizes, zoom and light/dark themes | No clipped primary actions, unreadable content, inaccessible dialogs or accidental page overflow. |
| Keyboard-only setup, editing, search, scheduling and settings | Logical focus, named controls, useful error announcements and correct focus return. |

Do not add permanent test infrastructure to exercise these states. Use isolated dummy records and temporary local verification techniques where needed. Clearly identified temporary local response fixtures may exercise AI success, interruption and error interfaces without making live calls. They must never become a silent runtime fallback or appear as real AI provenance. If AI is unavailable, verify the visible review context and the request/validation path separately, exercise the unavailable-service recovery, and state that generated-response behavior remains unverified. Never claim a successful model response based only on a build or a simulated result.

The implementation handoff should list delivered behavior, actual browser checks, remaining limitations and any deliberately deferred work. Completion means all four acceptance journeys and the five product outcomes work with preserved local data. Include the management and interface states actually verified, with any outstanding items identified. Billing, subscription, authentication, cloud delivery and deployment remain separate future work. Frontend completeness must not be reported as production SaaS readiness.
