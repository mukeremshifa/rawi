# Rawi: frontend rebuild brief

## Assignment and authority

Implement a substantial, usable frontend prototype of Rawi: an AI tutor and mentor for students studying courses and preparing for exams. This brief records the owner's agreed direction and is the execution handoff for a fresh session. Start implementing after inspecting the repository; do not stop at another plan or request reconfirmation of these decisions.

Read `AGENTS.md`, `README.md`, and relevant code first. Reuse whatever is useful, but freely replace obsolete frontend layouts, routes, components, schemas, and simulated behavior. The owner explicitly permits a major frontend rebuild. Existing comments and product assumptions are historical context, not requirements to preserve. Do not discard unrelated user changes.

Cover as much of the product below as possible in this implementation. Aim for broad, connected, working coverage across the six areas, not only a shell or one polished lesson. Sequence the work sensibly, but do not treat the first phase as the final deliverable. Use judgment for unspecified details and explain significant tradeoffs afterward.

## Product and example student

Rawi should help a student turn course reading into understanding they can use in an exam. The tutor explains, probes understanding, adapts, and gives feedback. The mentor connects that work to the student's goals, time, and study plan.

Use a fictional introductory history course with coherent sample readings, lecture notes, several topics, and an exam three weeks away. Seed a returning student who has about 45 minutes a day, recognizes material, but struggles with causal explanations, comparing interpretations, and constructing answers without notes. Include a way to experience first-time course setup as well.

Use enough related topics and authored content to support meaningful practice, mixed-topic exams, recurring mistakes, and visible progress. Keep sample historical material internally consistent. Label fictional course materials and simulated tutor feedback clearly; do not invent real scholarly citations.

## Boundaries

- Frontend and local dummy data only. No backend, real AI calls, database, accounts, credentials, deployment, or infrastructure.
- No automated tests, CI, lint setup, or new environment setup. Preserve `npm install` and `npm run dev` as the development path.
- Use scripted responses and local state to simulate adaptive tutoring, question generation, marking, and planning. Do not build a general AI engine or speculative service architecture.
- Local browser persistence is welcome for course settings, study history, saved practice, and unfinished sessions. If used, provide a clear reset-demo action. Keep prototype data on the device.
- Avoid enabling controls that do nothing. Narrow an unsupported capability honestly rather than claiming real ingestion, AI assessment, or exam security.
- Keep documentation minimal. This checkpoint is still a prototype; the owner will decide when to introduce real services and tests.

## Visual and interaction direction

Create a modern study workspace: clear navigation, useful panels, strong hierarchy, restrained color, readable long-form content, and generous space where the student reads or writes. Desktop first, with usable mobile layouts. Choose the detailed design without another approval round.

Use a cohesive course shell, contextual actions, consistent states, and a tutor that can stay connected to the current passage, question, or answer. Avoid crowding every tool into every view. Mobile can switch between reading, tutor, and writing views instead of squeezing columns together.

The existing React/Vite stack and UI primitives are available. Retain them when useful. Do not rebuild technology merely for novelty.

## Product areas

### 1. Overview and course setup

- Allow course creation/editing with name, learning goal, exam date, available study time, and topics/materials. Let students start without uploading anything.
- Show today's suggested work, reasons for recommendations, upcoming exam, due reviews, and resume actions.
- Let the student adjust their goal, schedule, or topic priorities and see a plausible local change to the plan.
- Include a mentor-style check-in/reflection, such as having less time today or finding a topic difficult, that changes the next suggested activity.

### 2. Materials

- Provide a navigable library of readings, lecture notes, and student notes, with readable detail views.
- Support local pasted content and appropriate local text files. Other file types may use clearly identified sample previews; do not pretend unsupported files were parsed.
- Let the student select a passage or use a passage action to ask the tutor, save a note, or practise the related topic.
- Tutor explanations and question reviews should link back to relevant material where appropriate. Students can also begin topic-based learning without providing sources.

### 3. Tutor

- Support contextual conversation alongside a reading or activity, with explanations, examples, simpler explanations, follow-up questions, hints, and student answers.
- Demonstrate the flow: orient -> understand -> recall -> reason -> apply -> reflect/continue.
- Include authored branches for a misunderstanding, a correct response, and a request for another explanation. Accept typed input and provide useful suggested prompts; be honest about the scripted scope.
- Let the tutor launch practice and keep the resulting activity available in Practice.
- Distinguish supported learning from independent assessment. Hints and questions should feel welcome during tutoring. Avoid pervasive punitive warnings about asking for help.
- Show a session summary and a useful next step. Preserve enough local context to resume and demonstrate continuity.

### 4. Practice suite

Provide a shared setup flow for choosing topics/materials, activity type, length, difficulty, hints, and feedback timing where relevant. Students can launch practice from the suite, a material, a tutor suggestion, or a previous mistake.

Include working examples of:

- Flashcards: reveal, self-rate recall, move through a deck, and revisit difficult cards.
- Quizzes: multiple choice, multiple select, matching, ordering, and fill-in-the-blank, with suitable answer interactions and explanations.
- Written recall: explain an idea or summarize an argument from memory.
- Source analysis: identify claims, supporting evidence, perspective, or limitations in a passage.
- Essay practice: develop a thesis, construct an outline, compare interpretations, or write a full answer.

Share common activity structure where useful. Include saved/recent sets, session summaries, retrying mistakes, and results that update local history. Controls must change the selected content or behavior; difficulty can select authored question pools. Written feedback can be scripted and rubric-based, visibly identified as simulated.

### 5. Exams

Build a distinct exam builder, active exam workspace, and results/review experience. Include reusable presets and custom configurations.

Expose meaningful controls for:

| Dimension | Controls |
| --- | --- |
| Content | Topics, materials, saved preset |
| Structure | Sections, question types, counts, marks |
| Timing | Overall or section timers, extra-time allowance, untimed rehearsal |
| Resources | Open/closed book, allowed reference material, tutor assistance |
| Navigation | Free movement or sequential questions, backtracking, flagging |
| Submission | Manual finish and automatic submission on timed expiry |
| Feedback | Section feedback or feedback after final submission |

Settings must affect the active exam. Prevent or explain incompatible combinations and question counts beyond the authored pool. Resource restrictions govern the prototype's UI; do not claim proctoring or browser lockdown.

The active environment should prioritize instructions, section/question navigation, answer entry, time remaining, marks, flags, and submission. Preserve answers when moving between questions. Define section-timer expiry behavior and make timed/manual completion lead to one consistent results state. If feedback is released per section, lock that section's submitted answers.

Results should include marks, per-question answers and explanations, topic gaps, and targeted next actions. Written answers need explicit rubrics and explainable simulated feedback. Support discussing a mistake with the tutor, creating focused practice, and taking another exam.

### 6. Progress

- Show topic-level strengths and gaps, recent learning, practice and exam history, recurring mistakes, and review needs.
- Distinguish practice with help, self-rated recall, and independent exam attempts. Avoid claiming precise mastery from sparse activity.
- Let the student inspect what an indicator is based on and open the relevant attempt.
- Activity results should influence the overview and suggested next steps through simple local rules.

## Connected behavior

Use shared local data across areas. A course/topic/question/attempt should retain its identity when opened elsewhere. For example:

1. An exam exposes difficulty comparing two historical arguments.
2. Results recommend a tutor session grounded in relevant passages.
3. The student works through an explanation and targeted practice.
4. Progress records the work, and Overview suggests a later review.
5. A subsequent exam includes a related question.

Also support a first visit, a student getting stuck during learning, and a returning student resuming work. An attractive collection of disconnected screens does not satisfy this brief.

## Execution and verification

Build in coherent increments: shared course shell and data, learning/materials, practice suite, exams, then integration and polish. Adjust that order if useful. Do not postpone every secondary tool until after a narrow demo; broad functional coverage is the owner's priority.

Manually exercise affected behavior in the dev server. Check setup, materials-to-tutor context, adaptive scripted tutoring, every implemented practice format, settings taking effect, answer preservation, exam submission/expiry, results-to-remediation, progress updates, and resuming/resetting local state. Check desktop and a narrow mobile viewport, keyboard access, visible focus, readable content, and empty/loading/error states where relevant. Use short exam durations to verify timers.

Run the existing production build as a final packaging check. Do not add test tooling. Report what was actually checked, distinguish browser verification from build success, and identify any blocked checks honestly.

Commit coherent changes as instructed by `AGENTS.md`; do not push or deploy. Update README only where actual prototype behavior or running instructions changed.

## Completion criteria and final handoff

- All six product areas are reachable in a cohesive modern workspace.
- The seeded course has enough content for varied tutoring, practice, and mixed-topic exam sessions.
- The listed practice formats have usable interactions, feedback, and local history rather than decorative cards.
- Exam configuration changes the simulator's behavior, and submission leads to an inspectable results review.
- At least one complete learning -> practice -> exam -> remediation journey works across shared state.
- The prototype remains fully local, responsive, and runnable with the documented commands.

Finish with a concise account of what was implemented, how to run it, actual verification, main design tradeoffs, and remaining limitations. Identify any requested feature that is incomplete. Do not describe scripted behavior as real AI, or quietly count placeholders as completed features.
