# Rawi

English-first AI learning workspace for UAE students, aimed at a small college
pilot. Helps a learner understand a concept, solve a new problem independently,
and remember it later.

## Read AGENTS.md first

[AGENTS.md](AGENTS.md) is the operating contract — confirmed constraints,
engineering boundaries, coordination and handoff rules. It is short and it
governs. This file is orientation only and does not restate it.

## What this repo actually is right now

**Research and planning. There is no application code, no deployment, and no
`.git` directory.** Nothing here has been built, hosted, purchased, or shown to
a learner. Treat every stack choice as *recommended*, not decided.

Two consequences worth holding onto:

- `research/` is **evidence**, not specification. A feature discussed there is a
  candidate, not a commitment, and never something already built.
- `docs/STATUS.md` is the single source of truth for what is genuinely done.
  Update it with verified outcomes. Do not mark planned work as completed.

## Doc map

| Question | File |
|---|---|
| What is confirmed, open, and actually finished | `docs/STATUS.md` |
| Learner flow, modes, content rules, pilot metrics | `docs/PRODUCT.md` |
| Tickets, dependencies, estimates, readiness gates | `docs/DELIVERY.md` |
| Session workflow and ready-to-paste briefs | `docs/AGENT_PLAYBOOK.md` |
| Interviews, course selection, pilot measurement | `docs/DISCOVERY.md` |
| UAE/minor considerations and concrete controls | `docs/SAFETY.md` |
| The recommendation, evidence, tradeoffs, costs | `research/REPORT.md` |
| Free-tier design, AI costs, evaluation, recovery | `research/architecture.md` |
| Alternatives and positioning | `research/market.md` |
| Studies, limitations, pedagogy | `research/learning.md` |
| External references | `research/SOURCES.md` |

Read the one file the task needs. `research/REPORT.md` (164 lines) is the
longest; the rest are 40–140 lines each.

## Starting work

Begin at ticket **R01** in `docs/DELIVERY.md`; founder discovery (**R00**) runs
alongside it, not before it. Before implementing, read `docs/STATUS.md`,
`docs/PRODUCT.md`, and the specific `docs/DELIVERY.md` ticket — then follow the
session workflow in `docs/AGENT_PLAYBOOK.md`.

Explain the main engineering tradeoff in what you build. The founder is learning
the system, so a decision left unexplained is half-delivered.
