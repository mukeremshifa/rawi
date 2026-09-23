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
selected by topic and stage, and there is no model.** Objective questions are
marked exactly. Written answers are checked against an authored rubric by
looking for the words a strong answer usually contains, which the app labels as
simulated wherever it shows such feedback.

**Syllabus reading is line-by-line pattern matching, not comprehension.** It
recognises shapes like "Week 3: Estimation" or a numbered list and proposes an
outline you review before anything is created. Text it cannot place produces no
topics and says so. A labelled sample syllabus shows a richer result.

**Planning is a few explainable rules**, not an optimiser: assessment proximity,
topic priority and how thin the evidence is, fitted into the availability you
set. Preparation for an assessment is placed before that assessment starts, and
a date-only assessment is treated conservatively as needing preparation finished
the day before rather than being given an invented time. Work that does not fit
is listed, with the reason it did not fit, rather than quietly dropped.

**Recommendations are checked against the content that exists.** The tutor is
offered only for topics an authored script covers, a flashcard round only where
there are flashcards, and a topic with nothing behind it gets an honest setup
prompt instead of a link into an empty activity.

The sample courses, their readings and the authors they quote are fictional.
The prototype reads plain text and Markdown in the browser. It has no PDF or
Word parser, and says so rather than showing invented extracted text. One
seeded course carries real lecture text that was converted outside the app,
and it is labelled as imported rather than fictional, which is a different
statement from Rawi having learned to read PDFs. It has not.

## The seeded courses

Opening the app seeds three courses. Two are fictional samples: "The Atlantic
World, 1500–1800", a reading-heavy survey, and "Statistical Inference for
Social Research", a problem-based methods course. Between them they carry
thirteen readings, an authored question bank across nine question formats, four
planned assessments, a part-planned study week and a fortnight of history, so
progress, deadlines, due reviews and cross-course planning all have something
to show. `/welcome` offers a from-scratch setup instead.

The third, "CENG 401: Network Servers and Architectures", is real. Its three
materials are the lecture decks converted to Markdown outside the app and
seeded in, so the words are the lecturer's rather than written for the
prototype. It carries ten topics, 82 authored questions, four ready-to-start
practice sets, two rehearsal configurations and one planned assessment, and it
starts with no study history at all, because none has happened yet. Its
assessment records a date and deliberately no start time or duration, because
those were never supplied and inventing them would be a fact the prototype made
up. The rehearsal settings are study choices and say so: they do not claim to
reproduce the real paper's format.

## Areas

Above the courses:

- **Home**: today's planned work across courses, upcoming assessments, resume
  actions, streak and recent activity.
- **Courses**: every course with its status, plus create, open and archive.
- **Planner**: a weekly calendar and a daily list of the same sessions,
  availability, manual scheduling, and a simulated "Plan my week" you review
  before applying.
- **Progress & history**: activity across courses, per-course breakdowns, and
  a chronological history with filters.

Inside a course:

- **Overview**: this course's suggested work with the reason for each, its next
  assessment, and a check-in that changes what is suggested.
- **Syllabus & topics**: paste a syllabus, read a .txt/.md file, or build a
  week-by-week outline, reviewed and confirmed before topics are created.
- **Materials**: readings and notes. Select a passage to ask the tutor, save a
  note, or practise the topic.
- **Tutor**: scripted sessions moving through orient → understand → recall →
  reason → apply → reflect, with hints, misconception branches and a summary.
- **Practice**: name a set, generate it, and it is saved. Flashcards, quizzes,
  written recall, source analysis and essays, with attempts that survive a
  reload and repeat attempts kept separate.
- **Exams**: planned assessments with their real dates, plus rehearsal
  configurations and a timed exam workspace. **Nothing is marked and no feedback
  appears until the whole paper is submitted.**
- **Progress**: topic evidence, recurring mistakes, and the attempts behind
  every indicator.

## Local data

State is kept in `localStorage` on this device and survives a reload. Data
written by the previous single-course version is upgraded in place: its exam
date becomes a planned assessment and its daily study time becomes planner
availability. A saved practice set from that version stored only its settings,
and it is resolved against its own course's questions on upgrade so that it can
actually be opened. An unfinished exam from that version cannot resume under the
current exam rules, so it is kept and offered as a download with the reason
stated rather than dropped. Data that genuinely cannot be read is reported with
the option to download it, never silently replaced.

A seeded course added by a later build reaches a workspace that already exists,
rather than only a fresh one. That pass adds records whose ids are missing and
changes nothing else, so it can run on every load without duplicating anything,
and your attempts, renamed sets and edits in every course survive it. A
workspace you deliberately emptied through "Start fresh" stays empty.

**Reset demo**, in Courses, clears everything and restores the seeded courses.

## Layout

- `src/shared/`: domain types, marking, progress derivation, the planner and
  the syllabus reader.
- `src/shared/course/`: the seeded courses, question banks and tutor scripts.
- `src/client/store/`: the local state tree, its migration, and course scoping.
- `src/client/features/`: home, courses, planner, history, and the per-course
  areas.
- `src/client/components/`: layout vocabulary, UI primitives, design tokens.

`npm run build` creates a static preview, and `npm run preview` serves it. There are
no test, lint, CI, deployment or database workflows at this stage.
