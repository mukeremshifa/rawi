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

- `npm run build` and `npx tsc --noEmit` passed. Vite reports the existing
  large-bundle warning.
- Playwright drove isolated Chromium contexts against the dev server on port
  5174. The owner's browser data was untouched. Runtime errors were monitored.
- Entry checks covered empty setup, demo choice, revisited welcome, long course
  drafts, confirmed topics, skipped guidance and returnable availability setup.
- Material checks covered both input modes, text and Markdown files, unsupported
  placeholders, size and read failures, retained drafts, topic repair and choice,
  editable quoted notes, earlier cited evidence, archive, restore and deletion.
- The study journey covered saved answers, reload, exact missed-answer review,
  tutor drafts, tutor-origin practice, repeat attempts, scheduling, rescheduling
  and an exact planner launch that completes its original follow-up once.
- Exam checks covered full-paper feedback rules, persisted answers, protected
  active runs, replacement prevention, immutable result snapshots, expiration
  and one completion record. Written feedback failure and retry retained answers.
- Recovery checks covered actual export downloads, explicit import replacement,
  malformed JSON, cross-course references, malformed retained passages, quota
  failure, retry, unreadable stored data and older workspace migration.
- Management checks covered course and topic deletion impacts, archived deep
  links, preserved history, wrong-course recovery, profile and study preferences,
  shared availability, enabled reminders, read/dismiss and rescheduled reminders.
- A temporary large workspace contained four courses, 64 additional materials,
  64 additional sets, five weeks of history, 50 extra tutor messages and crowded
  planner days. All-items access, filters and exact passage/message search passed.
- A keyboard-only journey covered empty setup, topic confirmation, material
  editing, Escape focus return, global search, scheduling and profile settings.
- Light and dark layouts were checked at 1024 by 768, 1280 by 800, 1440 by 900,
  640 by 400 and 390 by 844. Primary dialog actions remained reachable, Tab
  stayed inside dialogs and horizontal page overflow checks passed.
- Actual Chromium profile zoom at 200% passed core page overflow and dialog
  reachability checks in both themes, with a measured 2x scale. Its temporary
  browser profile was kept outside the project to avoid triggering dev reloads.
- Axe scans found no WCAG A/AA violations in the sampled Home, planner, profile,
  tutor and Add material dialog pages. This is a sampled scan, not a complete
  accessibility certification.
- Clearly labelled temporary local AI response fixtures covered success,
  streaming, interruption, cancellation, navigation, budget failure, generation
  rejection and retry. Fixture model provenance stayed explicit. No live model
  requests were made and no fixture was added to the product runtime.

Browser verification exposed and fixed lost planner session links, active-exam
replacement clearing drafts, misleading unsupported generation, inaccessible
route headings and conversation scrolling, dialog animation and focus return,
narrow layout overflow and dark-theme warning contrast. Recovery import also
rejects existing cross-course references and malformed retained passage content.

## Limits

Live Gemini quality and service integration were not exercised in this pass.
Import validates current record structure and ownership, but does not constitute
an exhaustive schema for every historical format or arbitrary draft field.

File reading remains limited to plain text and Markdown. Unsupported files are
labelled placeholders and excluded from AI source context. Reminders are in-app
only. Authentication, billing, cloud synchronization, external reminder delivery
and deployment remain outside this local prototype.

Temporary verification files remain untracked in `.verification` because
automatic approval review blocked their deletion. No permanent tests, CI or
deployment workflow was committed. Nothing was pushed or deployed.
