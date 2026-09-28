# Rawi: complete setup, content management and study continuity

## Purpose and scope

This brief plans batches 1 through 3 from `FRONTEND_AUDIT.md`. The intended outcome is a student creating their own course, reaching a useful study activity, managing their content and returning later without losing work or context.

This is a planning deliverable. It does not start implementation. When implementation is requested, use this as one coherent scope delivered in the three increments below.

Read `AGENTS.md`, `README.md`, `FRONTEND_AUDIT.md` and the relevant code. Earlier implementation briefs describe historical checkpoints. This scope includes the answer-aware tutor handoff previously deferred in brief 03, and preserves the real AI integration now described in the README.

- Keep the current navigation structure and design vocabulary. Make focused interface changes needed for these journeys.
- Keep workspace data local and use dummy courses for development. Preserve existing user data and migrations.
- Preserve `npm install` and `npm run dev`. Do not add automated tests, CI, environment setup or approval gates.
- Preserve the existing local AI API, model configuration, spending limits, cancellation, validation and provenance. Small contract, prompt and validation changes required by the answer-aware handoff are in scope. New backend infrastructure is not.
- Do not make background AI calls or silently substitute simulated teaching for actual AI. Keep unavailable-service states usable and truthful.
- Follow the punctuation rules in `AGENTS.md`, including the exceptions for imported material and citations.

Batch 4 is deferred in full: global settings, account/profile flows, billing, subscription UX, a new visual system and a broad desktop polish or accessibility pass. New controls in this brief must still use accessible labels, keyboard-operable primitives and the established layout. PDF/OCR/Word/slide parsing, adaptive review algorithms, cloud storage, authentication, deployment and collaboration are also outside this scope.

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

Acceptance: pause setup after topics, reload, resume from the checklist, add material and correct its links. Create and edit a note. Rename and edit a cited reading, then inspect old result/tutor citations and a new study launch. Earlier evidence remains intelligible and new study uses the updated material.

## Increment 3: complete the returning-student experience

### Drafts and save reliability

- Persist drafts for course creation/settings, syllabus proposals and edits, material/note creation and edits, assessment forms, practice setup and exam configuration. Preserve unsent tutor message text per session too.
- Key drafts by course, form purpose and edited record where applicable. An unfinished edit in one course must not populate another course's form. Define one resumable new-item draft per form and course, with an explicit Start new/discard choice.
- Restore drafts after navigation and reload, including incomplete or currently invalid forms. Draft persistence must not create live topics, materials, assessments, sets or exams before the relevant save/confirm action.
- Make restored state and saving status clear. Leaving an editor preserves its draft. Discard explicitly removes that draft without deleting the saved record. Successfully saving or confirming retires the corresponding draft without producing duplicates.
- An incomplete exam configuration can be retained as a draft even when it is not valid to start. It must not appear as a runnable rehearsal until validation passes.
- Preserve editable extracted text and file metadata where appropriate, but do not claim a browser File handle survives reload. Explain when an original file must be selected again.
- If a record was deleted or its source changed while a draft existed, explain the conflict. Do not silently recreate a deleted record or overwrite a newer saved version. A distributed or multi-user conflict system is outside scope.
- Surface local persistence failures with a persistent warning that work is only in memory, a retry action and a recovery download of the latest recoverable state. Report success only after the write succeeds. Avoid one warning per keystroke.
- Include the corresponding validated local recovery-import path so the download is usable. Preview what will be replaced and preserve current data until the import validates and the student explicitly applies it. Keep this a local recovery feature, not a settings or sync project.
- Preserve existing migration and corrupt-data recovery behavior. Do not silently replace failed restores with demo data or discard old work to make a migration pass.

### Continuous study context

- Carry the originating tutor session through practice setup, set creation, the actual run and completion. Show a return link to that session and the resulting practice work from the session. Disambiguate set IDs and attempt IDs instead of overloading the existing `launchedAttemptIds` field.
- Associate a specific run with its launch context. Starting an unrelated repeat attempt later must not inherit an old tutor, remediation or planner link just because it reuses the same set.
- For results-to-tutor review, carry the exact originating attempt, selected question, submitted answer, outcome, hint usage and available rubric feedback. Present this context visibly in the session so the student can see what is being discussed.
- For a topic-level review covering several missed questions, show which questions are included or let the student choose. Do not imply the tutor saw every answer when it only received one.
- Include that bounded review context in the existing tutor request, server validation and prompt. Keep student answers and material as data, enforce course ownership and existing request limits, and distinguish missing, pending, failed and legacy feedback. Do not fabricate feedback or silently use a different attempt.
- Missing origins must produce an explanation and a useful next action. Preserve available historical context even if the original material or session was archived or removed.
- Carry any explicit planner session through the same flow and complete it only under the existing completion rules. Following a link, creating a set or archiving a session does not count as study. Reopening results must not duplicate history or inflate progress.

### Tutor session organization

- Add an editable session title with a sensible default, search within the current course's sessions, and clear active, completed and archived views.
- Support archive and restore. Keep archived sessions accessible from historical links and exclude them from default resume suggestions. Archiving is not completion and must not change evidence, streaks or planner status.
- Preserve messages, source links, linked attempts and completion timestamps when renaming, archiving or restoring. Permanent session deletion is not needed for this scope.

Acceptance: leave partially completed forms, switch courses and reload, then recover the right draft. Recover from a failed save using retry or export/import. Review one exact missed answer with the tutor, launch and finish practice from it, and trace that attempt back to the session without changing earlier results. Rename, find, archive and restore the session without recording new study activity.

## Implementation order and verification

Deliver increment 1 first, then increment 2, then increment 3. Shared material editing and local persistence work can be implemented once and extended across increments. Use the existing store and small shared helpers instead of speculative frameworks. Commit coherent changes and update documentation minimally. Do not push or deploy.

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

Do not add permanent test infrastructure to exercise these states. Use isolated dummy records and temporary local verification techniques where needed. If AI is unavailable, verify the visible review context and the request/validation path separately, exercise the unavailable-service recovery, and state that generated-response behavior remains unverified. Never claim a successful model response based only on a build or a simulated result.

The implementation handoff should list delivered behavior, actual browser checks, remaining limitations and any deliberately deferred work. Completion means the three acceptance journeys work with preserved local data. Batch 4 remains a separate larger pass.
