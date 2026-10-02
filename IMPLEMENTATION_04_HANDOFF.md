# Brief 04 handoff

## Delivered

- First-visit demo or empty-workspace choice, safe returning welcome, and a
  course setup checklist derived from topics, readable coverage, assessments
  and the shared availability record.
- Reversible material input modes, retained add-material drafts, explicit topic
  repair and choice, editable readings and notes, archive and restore, and
  retained earlier passages when cited text changes.
- Course-scoped libraries for tutor sessions, practice sets and rehearsal
  configurations, with search, filters, sorting, rename, archive, restore and
  deliberate deletion. Removed topics retain historical labels. Active runs
  protect their course, set or configuration from deletion.
- Durable setup and activity drafts, visible storage failure with retry and
  export, validated recovery import, preserved stored questions, immutable
  exam result configuration snapshots and idempotent completion records.
- Exact answer review with response, key, feedback, marks, assistance and
  pending status, passed through the tutor request and server validation.
  Tutor-origin practice and repeat attempts preserve their origin. Scheduled
  missed-question review keeps its exact target through rescheduling.
- Local profile and workspace settings, future study defaults, one shared
  availability source, theme, reading size, motion and in-app reminders.
  Workspace search links to matching passages and tutor messages. Home lists
  unfinished activities across courses.
- Shared dialog containment, route heading focus, ordinary page scroll
  restoration, retained list filters and contextual unavailable-target recovery.

The main tradeoff is one local state tree and shared lightweight controls.
Drafts and earlier cited passages increase browser storage use. The visible
save failure and workspace export provide recovery, without adding a backend.

## Actually checked

- `npm run build` passed. Vite reports the existing large-bundle warning.
- `npx tsc --noEmit` passed.
- The isolated Vite server on port 5174 and local API status endpoint returned
  HTTP 200. No owner browser workspace was changed.
- Temporary in-memory verification used four courses, over forty materials
  and sets, long titles, five weeks of history and pending written feedback.
- Store and request checks covered empty-workspace data, duplicate attempt
  completion, exact answer context, server rejection of wrong-course review,
  retained planner review targets, tutor organization without planner
  completion, valid export/import and malformed import rejection.
- Static React renders covered welcome, Home, courses, history, planner,
  availability, reminders, settings, course setup, materials, practice, exams,
  tutor and results. Additional checks covered revisited welcome, course-scoped
  tutor lists and wrong-course result recovery.
- Temporary verification files were removed. No permanent tests, CI or
  deployment workflow was added.

## Outstanding verification and limits

No manual browser checks were performed. Automatic approval review denied Edge
access, and the owner chose to leave browser checks unverified. Static rendering
does not verify event handling, reload recovery, file pickers, keyboard focus,
runtime console errors, dialog scrolling or layout at the requested viewport
sizes and zoom. Those acceptance checks remain outstanding.

No live model calls or simulated response fixtures were used. The answer-aware
request and validation path was checked, but generated replies, streaming,
interruption, cancellation, retry and written feedback behavior remain
unverified in the browser. The full reading-to-tutor-to-practice-to-scheduled
review journey therefore has not been demonstrated interactively.

Storage-quota failure, malformed nested historical data, older workspace
migration, cited-material deletion, crowded planner layout, reminder timing
and rescheduling, and keyboard-only settings and search need browser checks.
Import validates record structure before replacement, but it is not an
exhaustive schema validator for every historical format or draft field.

File reading remains limited to plain text and Markdown. Unsupported files are
labelled placeholders and are excluded from AI source context. Reminders are
in-app only. Authentication, billing, cloud synchronization, external reminder
delivery and deployment remain outside this local prototype.

All four increments have implementation changes. Full acceptance is pending
the outstanding interactive checks above. Nothing was pushed or deployed.
