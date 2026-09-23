# Rawi checkpoint 2 corrections

## Assignment

Finish the second frontend checkpoint by correcting the confirmed integration defects below. Read `AGENTS.md`, `README.md`, `IMPLEMENTATION_BRIEF_02.md`, and relevant code first. This brief takes precedence where requirements conflict. The owner has authorized execution, including the nearby consistency fixes listed here. Do not stop at another plan or request reconfirmation.

Retain the current product structure and modern study workspace direction. Keep all behavior local, with dummy data and scripted AI. No backend, real model calls, accounts, deployment, external services, automated tests, CI, or environment setup. Preserve `npm install` and `npm run dev`. Do not discard unrelated work or reset the user's browser data.

Deeper results-to-tutor personalization remains deferred. Keep the current shallow handoff. This is a correction and refinement pass, not a new feature expansion.

## Design rule: punctuation

Do not use em dashes or semicolons in first-party prose. Use a colon, comma, period, or rephrase the sentence. Do not substitute double hyphens or another long dash as a workaround.

Apply the rule throughout the existing interface, including labels, headings, placeholders, descriptions, tooltips, validation, notifications, empty states, generated planner explanations, sample course content, tutor scripts, feedback, and accessibility labels. Apply it to first-party documentation, prose comments touched by this work, and the final handoff. Record a concise version in `AGENTS.md` so future work follows it.

Treat this as an editorial rule. Preserve punctuation required by programming syntax, entities, file formats, and commands. Do not rewrite imported user material, user-entered titles, notes, or answers. Review first-party strings deliberately rather than running a blind replacement over code or stored user data. Existing persisted demo text should be refreshed only when it is reliably identifiable as unmodified authored content.

## 1. Make planning respect actual deadlines

Confirmed problem: for the sample statistics quiz on September 28 at 10:00, planning the assessment week proposed preparation that evening and a rehearsal on October 1. Assessment proximity affects ranking, but placement ignores the deadline.

Relevant starting point: `src/shared/planner.ts`, especially candidate creation and the placement loop.

- Preparation associated with an assessment must end before that assessment starts, including same-day times.
- For date-only assessments, use a clearly stated conservative rule, such as finishing preparation by the previous day. Do not invent an assessment time.
- Evaluate deadlines against the dates being planned. A future week must not receive preparation for an assessment that has already happened by that week.
- If preparation cannot fit before its deadline, list it as unscheduled with the real reason. Do not silently relabel it, place it after the exam, or claim the week covers it.
- Exclude elapsed time today from automatic placement. A plan generated in the afternoon cannot allocate this morning's availability.
- Treat assessments with a known time and duration as occupied time. Avoid scheduling study over those assessments.
- Keep availability exceptions, existing commitments, manually edited sessions, locked sessions, and completed work intact during regeneration.
- Ensure regenerating with a course filter cannot remove or replace another course's sessions unintentionally.

### Nearby planner consistency fixes

- Show all unscheduled work, or provide an explicit expansion control. The current code truncates the list to eight while reporting a larger total.
- Give accurate reasons for unscheduled work. A per-course daily cap is different from having no free time, and a reserve budget is different from no available slot.
- Use the same time and conflict calculations for automatic planning and manual rescheduling. Manual overrides may be allowed with a clear warning, but automatic planning must not silently introduce conflicts.
- Preserve the distinction between ordinary ongoing study and preparation linked to a particular assessment.
- Revalidate a proposal before applying it if availability, assessments, or commitments changed after generation. Do not apply a stale proposal over new commitments.

## 2. Repair saved practice navigation and migration

Confirmed problem: the saved-set Open button still navigates to `/practice/new`, which is no longer a valid route. It also targets setup instead of the saved set's identity.

Relevant starting points:

- `src/client/features/practice/PracticeHomePage.tsx`
- `src/client/features/practice/PracticeSetPage.tsx`
- `src/client/store/store.tsx`

Every saved-set entry must open its course-scoped set detail page. From there, Resume restores its unfinished attempt and Start creates a separate attempt as designed. Keep the set's name, settings, content, and earlier results intact. Do not regenerate a new set merely because the user opened one.

Confirmed migration problem: the old Comparison drill becomes a set with zero questions and a disabled Start button. Migration supplies an empty question list, while the detail page never resolves it from the preserved configuration.

- Recover legacy config-only sets by resolving their preserved settings against the correct course's authored question pool, then persist that content once.
- Cover both an original version-one store and a store already upgraded by the faulty version-two migration. Fixing only the original migration will not repair affected users.
- Preserve set identity, title, settings, attempt history, and user edits. Do not attach unrelated questions or silently broaden its filters.
- If no matching content remains, explain why and provide a concrete edit/regenerate recovery path that retains the existing record and history.
- Make recovery repeatable without duplicate sets or changing resolved content on each reload.
- Inspect handling of old unfinished exam data. If it cannot safely resume under the new rules, retain a recoverable snapshot and explain the limitation rather than silently dropping it or claiming independent evidence.

## 3. Fix course-scoped source links and audit navigation

Confirmed problem: source citations from exam results and practice feedback open `/materials/...` and land on the 404 page. `SourceLink` in `src/client/components/domain.tsx` still uses the old route shape.

- Resolve the source's owning course and link to its course-scoped material and passage anchor.
- Verify citations from practice feedback, exam results, and tutoring, plus material-to-tutor and material-to-practice links.
- A source link must open the correct material and bring the cited passage into view.
- If a source was removed, show a useful unavailable-source state rather than an enabled broken link.
- Audit remaining links and imperative navigation for obsolete single-course URLs. Inspect saved sets, resume actions, history, notifications, and planner launch actions in particular.
- Preserve course ownership on deep links and back navigation. Do not solve missing context by sending users silently to whichever course was last active.

Use shared route helpers where useful, without adding speculative routing infrastructure.

## 4. Carry planner context through activity completion

Confirmed problem: opening the seeded Rehearse quiz 2 conditions session, submitting its exam, and returning to Planner leaves the scheduled session unfinished. The launch URL contains a session ID, but exam creation and final results do not carry it through. Tutor creation also ignores the planner parameter.

Relevant starting points:

- Planner launch links and `SessionDialog.tsx`
- `ExamsHomePage.tsx`, `ExamBuilderPage.tsx`, and the exam engine
- `NewTutorSession.tsx` and tutor completion
- The store's `completeLinkedSession` transition

Carry explicit planner context from launch through configuration, saved set/run creation, reload, resume, and completion. Include the correct planned assessment target where one was selected.

- An exam link that names a configuration should clearly open or select that configuration. Do not discard it on the landing page.
- A completed linked exam or practice attempt completes its planned session exactly once and links the history records together.
- A tutor session that reaches its completed learning state should also complete its linked planner session. Opening the tutor or immediately leaving it must not count as completed study.
- Reading and offline study retain an explicit completion action. Merely opening a material does not mark the session complete.
- Unrelated work must not complete another session because its course or topic happens to match.
- Validate the session's course and linked target before completion. Stale, deleted, or mismatched links must not complete unrelated tasks.
- Reloading, double submission, returning to results, or repeating an attempt must not duplicate history, move an earlier completion date, or inflate the streak.
- Starting an unrelated new attempt must not accidentally inherit an old planner link from stale navigation state.

Check that course history, global history, planner status, and streak agree after completion.

## 5. Make suggestions executable with available local content

Confirmed problem: automatic planning proposed Learn From association to cause for the statistics course, but the scripted tutor only supports the history course.

- Check available capabilities before recommending an activity, not only whether a topic has question records.
- Offer tutoring only when an authored script exists. Otherwise choose an appropriate reading, supported practice format, or clearly described manual-study task.
- A flashcard recommendation requires matching flashcards, not just any question for that topic.
- Generated rehearsal sessions need a usable launch path with the intended course, assessment, and configuration context. Do not leave actionable-looking entries without an action.
- If nothing suitable exists, show the missing-content reason and a useful setup action.
- Apply this consistently to Home, course Overview, Planner, and check-in recommendations.

Prefer useful fallbacks over expanding the tutor engine. No deeper answer-aware tutoring is requested.

## 6. Refine the planner layout and feedback consistency

The desktop weekly grid currently squeezes session cards into narrow columns, causing titles to spill into neighboring days.

- Give weekly cards a compact layout designed for their available width. Time, title, course identification, status, and actions must remain readable and contained.
- Use an appropriate minimum column width and horizontal calendar scrolling or a responsive view change if needed. Do not shrink text until it becomes difficult to read.
- Retain one main vertical scroll owner for ordinary pages. An intentional horizontal calendar scroll is acceptable.
- Check the weekly view at medium laptop widths as well as wide desktop. Keep the daily list and mobile layout usable with long titles and multiple sessions.
- Keep full titles accessible when truncating. Actions must remain reachable by keyboard and touch.

While checking results, fix the existing recommendation-copy mismatch where a topic with the lowest percentage is described as having cost the most marks. Make the ranking and its explanation agree. Do not deepen the tutor handoff.

## Verification and delivery

Use the dev server for manual checks. Do not add automated tests or new tooling. Use isolated local demo state for destructive/reset scenarios so the owner's existing data stays intact.

Verify these representative flows:

1. Plan a week containing a timed assessment, a date-only assessment, an already-past deadline, unavailable days, and existing sessions. Preparation stays before deadlines and all unmet work is explained.
2. Plan today after some availability has elapsed. Nothing new appears in the past. Regenerate and apply without duplicates or unintended changes to other courses.
3. Open a newly generated saved set from the library, resume it after reload, and start another attempt with earlier results intact.
4. Recover both original legacy sets and already-migrated empty sets. Repeat reloads without duplication or data loss.
5. Follow source citations from practice, exam results, and tutoring to the correct course and passage. Check unavailable-source behavior.
6. Launch a named exam configuration from Planner, complete it, and verify the session, history, and streak. Repeat for linked practice and a completed tutor flow. Verify unrelated work completes nothing.
7. Generate recommendations for both seeded courses and a custom topic without authored content. Each suggestion has a supported action or an honest fallback.
8. Inspect planner cards at desktop, laptop, and mobile widths, including long titles, crowded days, and keyboard navigation.
9. Recheck core exam rules. Answers persist, free navigation crosses open sections, optional section locking works, and no hints or feedback appear before final submission. Exercise a short timer expiry and confirm one completed result.
10. Review first-party copy for the punctuation rule, including scripted responses and planner explanations. Check source literals and rendered examples, not just the new brief.

Run `npm run build` and check browser runtime errors. Inspect nearby issues only within this brief's scope. Avoid a broad redesign or speculative optimization pass.

Update documentation minimally, commit coherent changes, and do not push or deploy. The final handoff should state what was fixed, what was actually checked, and any unresolved limitations. Distinguish browser verification from build success. Do not claim completion for unverified or still-broken flows.
