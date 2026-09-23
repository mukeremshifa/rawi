# Rawi

A local prototype of a study workspace: several courses, each with its own
readings, tutoring, practice and exam rehearsal, planned across all of them.

Requires Node.js 22.12+ and npm.

```sh
npm install
npm run dev
```

Open http://localhost:5173. No accounts, environment files, database, or AI
credentials are needed.

## What is real and what is simulated

Everything runs in the browser. **Tutor responses are authored in advance and
selected by topic and stage — there is no model.** Objective questions are
marked exactly; written answers are checked against an authored rubric by
looking for the words a strong answer usually contains, which the app labels as
simulated wherever it shows such feedback.

**Syllabus reading is line-by-line pattern matching, not comprehension.** It
recognises shapes like "Week 3: Estimation" or a numbered list and proposes an
outline you review before anything is created; text it cannot place produces no
topics and says so. A labelled sample syllabus shows a richer result.

**Planning is a few explainable rules**, not an optimiser: assessment proximity,
topic priority and how thin the evidence is, fitted into the availability you
set. Work that does not fit is listed rather than quietly dropped.

The sample courses, their readings and the authors they quote are fictional.
The prototype reads plain text and Markdown in the browser; it has no PDF or
Word parser, and says so rather than showing invented extracted text.

## The sample courses

Opening the app seeds two courses — "The Atlantic World, 1500–1800", a
reading-heavy survey, and "Statistical Inference for Social Research", a
problem-based methods course. Between them they carry thirteen readings, an
authored question bank across nine question formats, four planned assessments,
a part-planned study week and a fortnight of history, so progress, deadlines,
due reviews and cross-course planning all have something to show. `/welcome`
offers a from-scratch setup instead.

## Areas

Above the courses:

- **Home** — today's planned work across courses, upcoming assessments, resume
  actions, streak and recent activity.
- **Courses** — every course with its status; create, open, archive.
- **Planner** — a weekly calendar and a daily list of the same sessions,
  availability, manual scheduling, and a simulated "Plan my week" you review
  before applying.
- **Progress & history** — activity across courses, per-course breakdowns, and
  a chronological history with filters.

Inside a course:

- **Overview** — this course's suggested work with the reason for each, its next
  assessment, and a check-in that changes what is suggested.
- **Syllabus & topics** — paste a syllabus, read a .txt/.md file, or build a
  week-by-week outline; review and confirm before topics are created.
- **Materials** — readings and notes; select a passage to ask the tutor, save a
  note, or practise the topic.
- **Tutor** — scripted sessions moving through orient → understand → recall →
  reason → apply → reflect, with hints, misconception branches and a summary.
- **Practice** — name a set, generate it, and it is saved; flashcards, quizzes,
  written recall, source analysis and essays, with attempts that survive a
  reload and repeat attempts kept separate.
- **Exams** — planned assessments with their real dates, plus rehearsal
  configurations and a timed exam workspace. **Nothing is marked and no feedback
  appears until the whole paper is submitted.**
- **Progress** — topic evidence, recurring mistakes, and the attempts behind
  every indicator.

## Local data

State is kept in `localStorage` on this device and survives a reload. Data
written by the previous single-course version is upgraded in place: its exam
date becomes a planned assessment and its daily study time becomes planner
availability. Data that genuinely cannot be read is reported with the option to
download it, never silently replaced. **Reset demo**, in Courses, clears
everything and restores the sample courses.

## Layout

- `src/shared/` — domain types, marking, progress derivation, the planner and
  the syllabus reader.
- `src/shared/course/` — the seeded courses, question banks and tutor script.
- `src/client/store/` — the local state tree, its migration, and course scoping.
- `src/client/features/` — home, courses, planner, history, and the per-course
  areas.
- `src/client/components/` — layout vocabulary, UI primitives, design tokens.

`npm run build` creates a static preview; `npm run preview` serves it. There are
no test, lint, CI, deployment or database workflows at this stage.
