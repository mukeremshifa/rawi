# Rawi

A local prototype of a study workspace: several courses, each with its own
readings, tutoring, practice and exam rehearsal, planned across all of them.

Requires Node.js 22.12+ and npm.

```sh
npm install
npm run dev
```

`npm run dev` starts the page on http://localhost:5173 and a small local API
on 127.0.0.1:8787. The page opens and saved work stays usable without any AI
configuration: AI actions say what is missing instead.

## AI setup (Vertex AI)

Tutoring, question generation and written feedback call Gemini on Vertex AI
through the local API, using Application Default Credentials. No key or
credential ever reaches the browser.

1. In a Google Cloud project with billing linked (and the credits applied to
   that billing account), enable the Vertex AI API:
   `gcloud services enable aiplatform.googleapis.com --project=PROJECT_ID`
2. Give your account the Vertex AI User role (`roles/aiplatform.user`).
3. Log in for local credentials: `gcloud auth application-default login`
4. Create `.env.local` in the project folder (Git ignores it):

   ```
   GOOGLE_CLOUD_PROJECT=PROJECT_ID
   GOOGLE_CLOUD_LOCATION=global
   ```

5. In Cloud Billing, add a budget for the project, and a spend cap on the
   Vertex AI service where your account supports one. A budget alone only
   sends alerts. It does not stop spending.

Restart `npm run dev` after changing `.env.local`.

**Models.** `gemini-3.8-flash` at `LOW` thinking for everything, set by
`RAWI_MODEL` and `RAWI_THINKING_LEVEL`. `gemini-3.5-flash-lite` is available
for chosen tasks with `RAWI_LITE_TASKS` (any of `tutor`, `generate`, `grade`).
The model that actually answered is stored with every tutor turn, generated
question and piece of feedback. Nothing falls back to another model.

**Budget.** The API keeps a ledger in `.rawi/ledger.json` with each request's
tokens and estimated cost. It allows $5 a day and $80 in total by default
(`RAWI_DAILY_BUDGET_USD`, `RAWI_TOTAL_BUDGET_USD`), and reserves each
request's worst case before sending it, so parallel requests cannot overrun
the allowance. Prices default to $0.75 input and $3.75 output per million
tokens for 3.8 Flash (the introductory rate, which the ledger raises to $1.50
and $7.50 from 2027) and $0.30 and $2.50 for 3.5 Flash-Lite. Output includes
thinking tokens. These are estimates, not your credit balance. Other limits:
`RAWI_MAX_CONCURRENT` (2), `RAWI_MAX_RETRIES` (1), `RAWI_MAX_INPUT_TOKENS`
(16000), and `RAWI_MAX_OUTPUT_TUTOR`, `_GENERATE`, `_GRADE`. Nothing is
generated in the background.

## What the AI does, and what stays deterministic

**The tutor** answers from a bounded context: the passage a session was
opened from, passages linked to the topic or sharing its words, the recent
conversation and a line or two about earlier work. Course material is sent as
data, never as instructions. Citations are checked against the passages that
were sent before they become links, and each reply says whether it rests on
your material, goes beyond it, or found the material insufficient. Replies
stream, can be stopped, and a cut-off reply is saved and labelled as
incomplete. A failed request saves your message and offers a retry. There is
no scripted fallback.

**Practice** can be drawn from the question bank or generated from a course's
readable material as flashcards, multiple choice or written recall. The
server and the page both check answer keys, option indices, rubric totals,
topics, sources and course ownership, and only questions that pass are saved,
with the model and material they came from. A saved set keeps its questions,
so reopening it or attempting it again never generates anew.

**Written answers** get AI feedback per rubric point, judged on meaning. The
answer is saved first and marked afterwards, so a failed request loses
nothing and can be retried from the results page. An answer waiting for
feedback counts neither for nor against progress. Exams still show no marks
or feedback until the whole paper is submitted. Written grades from earlier
versions, which matched keywords, are kept as recorded and labelled.

Objective marking, the planner, evidence levels and the syllabus reader are
unchanged rules with no model involved. The prototype reads plain text and
Markdown only. A file it cannot read is recorded as a placeholder and is never
sent as course content.

## The seeded courses

Opening the app for the first time offers a choice: explore two fictional
courses or start with an empty workspace. The demo contains "The Atlantic
World, 1500–1800" and "Statistical Inference for Social Research", with thirteen
readings, a question bank across nine formats, four planned assessments and a
fortnight of history. Returning to `/welcome` preserves established work.

An earlier build also added a CENG 401 course to every workspace. That no
longer happens. A workspace that already holds it keeps all of it, including
its materials, questions, sets, attempts and tutor sessions, because those were
already stored in the browser.

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
- **Tutor**: AI sessions moving through orient, understand, recall, reason,
  apply and reflect, with hints, examples, checks and a summary.
- **Practice**: name a set, draw it from the bank or generate it from your
  materials, and it is saved. Flashcards, quizzes,
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

Setup and activity drafts also survive navigation and reload. A save failure
stays visible with retry and export options. Settings offers versioned workspace
export and validated import, plus local profile, study, appearance and reminder
preferences. Reminders appear inside the app while it is open. They do not send
email or operating system notifications.

Materials can be edited and archived. Earlier cited passages remain available
when an edit changes their text. Saved sets, tutor sessions and rehearsals have
course-specific libraries with search, archive, rename and restore controls.
Answer review sends the tutor the saved response, key, feedback, marks and
assistance used. Review practice and planned remediation keep links to that
attempt. Pending written feedback is never presented as a grade.

**Reset demo**, in Courses, clears everything, including courses you added, and restores the two sample courses.

## Layout

- `server/`: the local API: Vertex AI calls, prompts, validation and the
  spending ledger.
- `src/shared/`: domain types, the API contract, AI context building, marking,
  progress derivation, the planner and the syllabus reader.
- `src/shared/course/`: the two sample courses and their question banks.
- `src/client/store/`: the local state tree, its migration, and course scoping.
- `src/client/features/`: home, courses, planner, history, and the per-course
  areas.
- `src/client/components/`: layout vocabulary, UI primitives, design tokens.

`npm run build` creates a static preview of the page, and `npm run preview`
serves it without the API. There are no test, lint, CI, deployment or database
workflows at this stage.
