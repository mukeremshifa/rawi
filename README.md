# Rawi

A local prototype of an AI tutor and mentor for students preparing for exams.

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
simulated wherever it shows such feedback. The sample course, its readings and
the historians it quotes are fictional.

The prototype reads plain text and Markdown files in the browser. It has no PDF
or Word parser, and says so rather than showing invented extracted text.

## The sample course

Opening the app lands you in a seeded course — "The Atlantic World, 1500–1800" —
with six topics, seven readings, an authored question bank across nine question
formats, and ten days of study history, so progress, due reviews and recurring
mistakes have something to show. `/welcome` offers a from-scratch setup instead.

## Areas

- **Overview** — today's suggested work with the reason for each, exam
  countdown, due reviews, and a check-in that changes what is suggested.
- **Materials** — readings and notes; select a passage to ask the tutor, save a
  note, or practise the topic.
- **Tutor** — scripted sessions moving through orient → understand → recall →
  reason → apply → reflect, with hints, misconception branches and a summary.
- **Practice** — flashcards, quizzes (multiple choice and select, matching,
  ordering, fill-in-the-blank), written recall, source analysis and essays.
- **Exams** — a builder, a timed exam workspace, and results with topic gaps
  and targeted remediation.
- **Progress** — topic evidence, recurring mistakes, and the attempts behind
  every indicator.

## Local data

State is kept in `localStorage` on this device and survives a reload. **Reset
demo** on the Overview or in Course settings clears it and restores the sample
course.

## Layout

- `src/shared/` — domain types, marking, progress derivation.
- `src/shared/course/` — the seeded course, question bank and tutor script.
- `src/client/store/` — the local state tree and derived selectors.
- `src/client/features/` — overview, materials, tutor, practice, exams, progress.
- `src/client/components/` — layout vocabulary, UI primitives, design tokens.

`npm run build` creates a static preview; `npm run preview` serves it. There are
no test, lint, CI, deployment or database workflows at this stage.
