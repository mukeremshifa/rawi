# Frontend audit, 29 September 2026

Direction: complete the desktop study experience using local state and dummy data. The next milestone is a student setting up their own course, starting a useful activity, and returning without losing context or work.

## Scope and confidence

Reviewed the README, routes, state handling, course setup, materials, tutor, practice, exams, planner and history code. Checked the new-student journey in a separate Vite preview on port 5174, with two audit courses isolated from the owner's port 5173 workspace. Inspected the course overview visually at a 1280 by 720 desktop viewport.

Browser checks covered course creation, syllabus parsing and confirmation, linked and unlinked readings, passage-to-tutor navigation, unavailable AI, practice setup, empty exams and exam builder, planner without availability, history, reload and course switching. Saved course, topics and readings remained after reload. No application code was changed and no automated tests were added.

The API was unavailable during the audit. Successful AI generation, streaming, grading, completed practice and timed exam runs were not revalidated. Their implementations were inspected where relevant. This is a workflow audit, not a full accessibility, responsive or regression certification.

## What already exists

- The course and student-wide navigation structure is established. It does not need another redesign to support the next milestone.
- Topic creation includes proposal review, editing and priorities. Materials already have text search and type filters.
- A linked reading opens a tutor session with its passage visible. The unavailable-AI state explains the problem and offers a status retry.
- Saved practice sets already have rename, deletion, repeat attempts and resume implementations. Exam configurations, assessment dates and planner sessions also have substantial management flows.
- History distinguishes completed work from merely opening screens. Results pages already offer retries and tutor links, and progress derives from recorded attempts.

## Ranked findings

| Priority | Finding and evidence | Next action |
| --- | --- | --- |
| P1 | **File entry is blocked.** In Add material, clicking Add a file leaves Paste text selected. Browser reproduced. `AddMaterialDialog.tsx:250` derives the tab from origin, but its change handler only handles returning to paste. | Give input mode its own state. Verify entering and switching both ways, cancellation, validation and a supported text file. |
| P1 | **An unlinked material has no repair path.** Topic linking is optional on creation. Saving without a topic and pressing Ask the tutor produces a toast telling the student to link it, but the reader has no edit or linking control. Browser reproduced. See `MaterialPage.tsx:167`. | Allow editing title, content, type and topic links after saving. Put a direct linking action in the blocked state. Preserve passage identity or explicitly handle existing citations when editing content. |
| P1 | **Tutor history crosses course boundaries.** A session created in Course A appears in Course B. Resume constructs a Course B URL and opens Not here. Browser reproduced with two audit courses. `TutorHomePage.tsx:29` reads all sessions and filters only by completion state. | Scope both open and past sessions to the current course. Check empty-state logic and resume links together. |
| P1 | **Setup advice contradicts available actions.** Empty Materials says tutoring and practice work from topics alone, then Tutor disables those topics without readable material. Empty Exams recommends a fifteen-minute quick check even when no presets exist. Both browser reproduced. See `MaterialsPage.tsx:94` and `ExamsHomePage.tsx:401`. | Make empty states reflect actual course capabilities, with a specific next action. Do not tell a student to open content that does not exist. |
| P2 | **Onboarding loses momentum after topics.** Confirmation stays on the syllabus page, prominently offering outline replacement. Material instructions are prose without a direct continuation. Plan my week with no availability produces a zero-session proposal. Browser observed. Initial state also seeds demo courses automatically, while `/welcome` is a separate route, confirmed in code. | Give new workspaces an explicit entry choice and courses a resumable setup checklist. Offer the next missing step directly. Ask for availability before proposing a week. Keep setup skippable. |
| P2 | **Unsaved configuration work disappears.** Changing the exam name, navigating to Exams, and reopening the builder restores My exam with no warning. Browser reproduced. The builder keeps its draft in component state at `ExamBuilderPage.tsx:108`. | Define draft behavior across long forms, beginning with exam configuration and syllabus editing. Prefer resumable local drafts. Allow saving an incomplete draft separately from starting a valid exam. |
| P2 | **Practice availability is discovered too late.** A new course advertises essay and source-analysis activities without a bank supplying them. Switching an essay setup to AI silently selects multiple choice. Browser reproduced. AI currently supports only three formats. | Show which formats are ready and what is missing at entry. Explain any required activity change rather than silently changing the student's choice. Backend format expansion is a separate decision. |
| P2 | **Study handoffs carry only part of the context.** Tutor-to-practice sends `from=sessionId`, but PracticeSetup does not consume it. Results-to-tutor passes a question and recent marks, without the exact submitted answer and detailed feedback. Code verified in `TutorSessionPage.tsx:613`, `PracticeSetupPage.tsx:179` and `tutor/engine.ts:112`. | Preserve originating session and attempt context. Show the exact answer and feedback being reviewed. Treat deeper personalization as a new feature, since the earlier correction brief explicitly deferred it. |
| P2 | **Saving can fail silently.** The catch in `store.tsx:1035` suppresses storage-write errors, so a student can continue with work that will not survive reload. Code verified, failure not induced in the browser. | Expose an unsaved state with retry and a local recovery/export action. This does not require a backend. |
| P3 | **Everyday management is uneven.** Materials cannot be edited, and saved excerpt notes cannot be expanded in place. Tutor history has no rename, search or archive flow. Code verified. Global account/settings routes are absent. | Finish content management first, then session organization and a small settings area with locally functional preferences. |

The welcome route also calls workspace replacement actions directly, without the confirmation used by Reset demo in Courses. Code verified in `SetupPage.tsx:52` and `:74`. First-run choices should not silently replace an established workspace when someone revisits that route.

## Recommended sequence

1. **Repair the first study journey.** Fix file-tab switching and tutor course isolation. Add material topic editing and direct recovery actions. Correct capability-dependent empty states and practice choices. Done when a student can create a course, confirm topics, add or repair a reading, and open the intended study activity without a dead end or another course's content.
2. **Complete onboarding and content management.** Add a persistent course setup checklist covering topics, materials, optional assessment dates and availability. Finish material and note editing. Define first-run versus returning-user welcome behavior. Done when setup can be paused, resumed and corrected without recreating content.
3. **Complete the returning-student experience.** Preserve form drafts, surface failed saves, retain study handoff context, and add tutor session organization. Done when switching courses, leaving a form, reloading and returning to a result all preserve understandable context and recoverable work.
4. **Finish the desktop product shell.** Add a focused settings area, then check keyboard use, focus, long content, empty and error states, and desktop window sizes consistently. Use explicit local fixtures for AI success, interruption and failure states if needed, without presenting simulated output as real AI. Done when these states are reviewable without depending on live services.

The first implementation batch should be item 1. It repairs verified blockers and reuses the existing product structure. It should not expand into a new visual system, billing, deployment or document parsing. Account and subscription flows can be designed once the core daily-use journey is complete and the paid offering is defined.
