# Rawi checkpoint 2: student workspace, planning, and reliable study flows

## Assignment and authority

Implement this next frontend checkpoint. Read `AGENTS.md`, `README.md`, this brief, and the relevant code first. The owner has approved these product decisions; start execution without another planning or approval round. Use judgment for unspecified design details.

This brief supersedes conflicting requirements in `IMPLEMENTATION_BRIEF.md`, especially the single-course structure, course-level exam date/study-time fields, and in-exam hints or section feedback. Keep useful existing functionality and modern study-workspace styling. Replace code and layouts where needed, without discarding unrelated user changes.

Deliver broad, connected functionality across this scope. Do not stop after adding navigation or static screens. Keep the app entirely local: dummy data, authored content, scripted AI, and browser persistence. No backend, real AI services, accounts, database, deployment, external calendar integration, automated tests, CI, or environment setup. Preserve `npm install`, `npm run dev`, and the existing production build.

## Product direction

Rawi is a student-wide workspace containing multiple courses. Planning coordinates time and assessment preparation across those courses. Each course retains its own materials, topics, tutoring, practice, exams, and progress.

Keep the reading-heavy course as the richest example. Add enough coherent local content for at least one additional course to demonstrate genuine cross-course planning, activity, and progress. Do not simply relabel the history content as a different subject. All new generation/extraction/planning remains visibly simulated.

**Explicitly deferred:** deeper results-to-tutor personalization. Preserve the current shallow topic-level handoff; do not build answer-aware remediation or redesign the tutor engine for it in this checkpoint.

## 1. Student-wide navigation and course ownership

Add destinations above individual courses:

| Area | Required behavior |
| --- | --- |
| Home | Today's planned work across courses, upcoming assessments, resume actions, streak, recent activity |
| Courses | All courses, concise status, create/open actions |
| Planner | Weekly calendar and daily task list, availability, editable sessions, simulated planning |
| Progress & history | Overall activity and course breakdowns, chronological history, filters, links to original results |

Within a course, preserve Overview, Materials, Tutor, Practice, Exams, and Progress. Add a clear Syllabus/Topics destination or subsection. Keep global and course navigation distinct, show the current course clearly, and make switching/back navigation understandable on desktop and mobile.

Course-scoped routes and records must identify their course. Materials, topics, saved sets, attempts, sessions, and assessments must not leak across courses. Global views intentionally aggregate them. Switching courses must not overwrite an unfinished activity, and deep links/reloads must restore the correct course context. A single active exam is acceptable if starting another cannot silently replace it.

History and progress should derive from actual local activity. Count meaningful completed study activity toward a streak, not page visits, generated sets, or repeatedly submitting the same completion. Define eligible activities and use local calendar days consistently. Keep marks, self-rated recall, and time spent distinguishable; do not combine them into a fabricated global mastery percentage.

## 2. Simplify course settings and correct scrolling

Course settings should hold stable course information such as name, description, and learning goal.

- Remove the single exam-date field. Planned assessments own their dates.
- Remove daily study-time configuration. Availability belongs to the global planner.
- Move the topic editor out of this form into Syllabus/Topics.
- Fix the doubled desktop vertical scrollbar. Ordinary pages should have one main vertical scroll owner. Separate scrolling is acceptable for intentional reading/conversation/exam panels, not nested page/form overflow.

Update all dependent copy, countdowns, suggestions, onboarding, and empty states. Do not leave two competing places to configure time or assessment dates.

## 3. Syllabus-led topics and manual course outline

Make syllabus intake the primary topic setup path:

**Add/paste syllabus -> review proposed outline -> edit -> confirm topics and weeks.**

- Accept pasted syllabus text and supported local text/Markdown files. Keep unsupported PDF/Word handling honest; no new document-parsing infrastructure is required.
- Offer a clearly labeled sample syllabus with a rich, scripted extraction preview. For arbitrary text, use a simple transparent local interpretation or manual fallback; do not pretend a real model understood it.
- Review should allow renaming, adding, removing, ordering, and organizing topics into modules/weeks before confirmation.
- Also support creating and editing a week-by-week outline manually, including without a syllabus.
- Allow later edits while retaining stable topic identities and valid links to materials, planned assessments, and activity history. Explain consequential removals rather than silently orphaning records.
- Do not automatically create topics merely because a file was selected; confirmation of the reviewed outline is the normal product interaction.

Custom topics without authored questions should have useful, honest next steps. Do not attach unrelated sample questions to them or claim arbitrary topic generation works.

## 4. Multiple planned assessments per course

Distinguish these objects in both behavior and UI:

1. **Planned assessment:** a real course milestone such as a week-four quiz, week-eight midterm, or final.
2. **Exam configuration:** a saved simulator setup used for rehearsal.
3. **Exam attempt:** one rehearsal run and its eventual results.

Support multiple planned assessments per course, with title, type, date/time, covered topics, optional weighting, and useful notes. Support date-only assessments without inventing a mandatory time. Expose creation/editing from the course Exams area and show assessments in course Overview and the global Planner/Home.

An assessment can link to multiple rehearsal configurations and attempts; standalone rehearsal remains available. A scheduled course quiz is an assessment, while a self-study quiz is a Practice activity.

Changing an assessment date or topic coverage should update relevant displays and planner suggestions. Completed/past assessments should remain inspectable without becoming the default upcoming deadline. Handle courses with no assessments cleanly.

## 5. Full local study planner

Provide both a weekly calendar and a daily task list as views of the same scheduled sessions. Include week/day navigation, course filters, upcoming assessments, and usable narrow-screen layouts.

### Availability and manual planning

- Configure recurring weekly study availability and day-specific exceptions/overrides globally.
- Create, edit, reschedule, and remove a study session with course, date/time, duration, topic(s), activity, and optional assessment target.
- Let students mark sessions complete, skip them, and move missed work. Show completed and overdue work distinctly.
- Link sessions to the appropriate tutor, material, practice set, or exam configuration with context preselected.
- Completing a linked activity should update the linked session once. Unrelated activity must not complete arbitrary planner tasks. Manual completion remains available for offline study.
- Drag-and-drop is optional; accessible edit/reschedule controls are required.

### Simulated “Plan my week”

Generate an editable local proposal using course priorities, availability, upcoming assessments, covered topics, and existing progress/review needs. Explain recommendations briefly.

- Respect existing commitments and available time; do not silently overlap sessions or fill unavailable slots.
- Let students keep/lock existing sessions when regenerating. Do not silently replace manually arranged work or completed sessions.
- Show an inspectable proposal before applying changes. Students can adjust the proposed week themselves.
- If the requested work does not fit, show the shortfall or unscheduled work instead of pretending everything fits.
- Make repeated planning coherent rather than accumulating duplicates.
- A short-time or struggling check-in should connect to the planner's availability/priorities and suggested work, rather than creating another independent schedule.

Use simple explainable rules, not an optimization service. Seed a useful example week spanning multiple courses and multiple upcoming assessments.

## 6. Practice: named generation, automatic saving, resumable attempts

Replace the current Start/Save split with:

**Required title -> activity/content settings -> Generate -> automatically saved set -> set detail/study entry.**

- Make the title a labeled required field. Trim and validate it before generation.
- Remove the separate Save button. A successful simulated generation saves the set exactly once and navigates to it; avoid duplicates from repeated clicks.
- Show a short, honest generation state and a useful failure/empty-pool state where applicable. Do not report successful generation if nothing was created.
- The saved set has a stable identity, title, resolved content, and configuration. Allow renaming and starting another attempt.
- Persist the active attempt separately: answers, position, checked states, feedback timing, hints used, flashcard ratings/revisit queue, and completion state.
- Reloading, navigating away, or switching courses must preserve work, including long written responses. Provide clear Resume actions.
- Completing an attempt records it once, preserves earlier attempts, and updates course/global history and linked planner work.
- Preserve all existing practice formats. Make mixed quiz selection actually exercise different formats where the selected pool permits it; the current default six-question set produces only multiple choice.
- Practice quizzes retain configurable immediate or end-of-set feedback and appropriate hints. Keep assisted practice and self-rated recall distinguishable from exam evidence.

## 7. Exam simulator: full-paper assessment conditions

**No hints, tutor assistance, answer explanations, correctness indicators, grades, or feedback during an exam. Release grades and feedback only after the entire paper is submitted.**

Remove the obsolete tutor-assistance and section-feedback controls, copy, and behavior. Preserve meaningful configuration for content, formats, sections, timing, extra time, allowed reference materials/open-book rules, navigation, flagging, and section locking. Keep flashcards/self-rating in Practice rather than counting them as independent exam performance.

### Navigation and locking

- Free navigation must work between both questions and sections when the sections remain open.
- Moving to another section does not itself finish or lock the current section.
- Add an explicit setting controlling whether finishing a section locks its answers. Communicate the consequence before the finish action.
- A locked section may be inspected read-only without revealing correctness or explanations before full submission.
- For per-section timing, expiry must lock that section's answers and apply a clear transition. Explain or constrain conflicting combinations of timing, navigation, and optional locking.
- Keep forward-only mode only if its restrictions are clearly stated and consistently enforced.
- Flags should help students locate and revisit eligible questions, including across sections, before final submission.

### Persistence and completion

- Persist answers, flags, current location, deadlines, section status, and configuration with the run.
- Reloading or leaving the page must not reset deadlines or grant new time. Define per-section timing clearly and avoid silently restarting an expired section when returning.
- Manual submission and timer expiry must produce one consistent completed attempt, exactly once. The final review should account for the full paper's unanswered/flagged questions, not just the current section.
- Only after full submission expose marks, rubrics, explanations, topic gaps, and the existing shallow tutor/practice links.
- Fix assistance tracking wherever hints remain in Practice. Preserve previously recorded assisted evidence. Old unfinished runs with unknown assistance history must not silently become independent exam evidence; use an honest compatibility rule and explain it if needed.

## 8. Local data continuity and integration

Adapt the current single-course local store to course-owned records and global planning. Keep the implementation appropriate for a local prototype.

- Version local data and preserve existing useful course, material, set, and attempt data when upgrading. Convert the old exam date into a planned assessment and old study-time preference into an initial planner preference where sensible.
- Do not silently wipe existing browser data to make the new structure work. Provide a clear recovery/reset choice if a stored state genuinely cannot be restored.
- Retain the explicit reset-demo action with clear scope.
- Ensure global/course views agree about completed work, upcoming assessments, and resume state.
- Deduplicate near-identical plan suggestions. Fix invalid HTML nesting warnings in affected shared page layouts.

## Delivery and verification

Implement in coherent increments: course ownership/global shell; syllabus and assessments; planner; practice lifecycle; exam rules; integration and polish. Adjust order as useful, but complete the requested scope rather than only the shell.

Manually check the dev server, without adding automated tests or tooling:

- Two courses can be opened, edited, and switched without content/history leakage.
- Existing single-course local data upgrades without an unexplained reset.
- Ordinary desktop pages do not have doubled vertical scrollbars; mobile navigation and planner views are usable.
- Syllabus review and manual weekly outline editing produce valid, editable topics.
- Multiple assessments appear with correct course, dates, coverage, and planner links.
- Weekly/daily planner views agree; availability, manual sessions, rescheduling, completion, and plan regeneration behave as described.
- Practice requires a title, generates/saves once, preserves every active format's work on reload, resumes after navigation, and keeps repeat attempts separate.
- Exam navigation spans eligible sections; finish/locking settings take effect; answers and timers survive reload; no feedback is revealed before full submission.
- Use short timer durations to exercise actual overall and section expiry, including returning after a deadline. Verify one final result and consistent history.
- Linked activity completion updates planner/history/streak once, with assisted practice and exam results distinguished.

Run `npm run build`. Report actual browser checks separately from build success, and identify anything not verified. Keep README changes minimal and accurate. Commit coherent changes; do not push or deploy.

The final handoff should explain what was implemented, the main design tradeoffs, verification, and remaining limitations. Do not count decorative controls, dead-end routes, or unsupported scripted behavior as completed features.
