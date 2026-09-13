# Working on Rawi with agent sessions

## Operating pattern

Use **specification → complete user-facing slice → tests and AI evaluations → independent review → learner observation → next slice**. Keep one integration owner. Run a second or third agent only on bounded independent work, such as UI against an agreed contract, content/eval fixtures, or review. More agents are useful only while ownership stays clear.

Use separate Git branches/worktrees for simultaneous implementation once Git is initialized. Shared-directory agents must own disjoint files and coordinate changes. One owner controls schema migrations, package manifests, shared contracts and integration. Do not run several agents against those files simultaneously.

The development team can use several agents; the product runtime begins with a bounded tutor workflow. Rawi does not need agents debating every student message. The application decides authorization and learning transitions; a model supplies bounded teaching assistance.

## Durable context

Every session reads [STATUS.md](STATUS.md), the relevant [DELIVERY.md](DELIVERY.md) ticket, and [PRODUCT.md](PRODUCT.md). Read [SAFETY.md](SAFETY.md) and [architecture research](../research/architecture.md) when the task touches data, infrastructure or AI. Use the root [AGENTS.md](../AGENTS.md) for enduring constraints.

Research is a dated input. Product decisions live in `PRODUCT.md`; task order lives in `DELIVERY.md`; the actual implementation state and pending decisions live in `STATUS.md`. Update only the relevant files when a decision changes, and remove contradictions. Do not make each session reread the whole research pack.

## Task brief template

```text
Implement Rawi ticket <ID> from docs/DELIVERY.md.
Read AGENTS.md, docs/STATUS.md, docs/PRODUCT.md and the ticket.
Outcome: <one behavior a learner or operator can demonstrate>.
Scope/files: <owned areas; identify shared contracts before editing>.
Dependencies: <completed tickets and interfaces>.
Constraints: UAE, English-first, adult private pilot, zero hosting costs,
paid AI only within configured budget, server-owned learning state.
Acceptance: <observable success and important failure cases>.
Deliver implementation and appropriate verification. Keep unrelated scope out.
Inspect existing work before editing; preserve others' changes.
Update STATUS.md with actual commands, results, limitations and next ticket.
Explain the main tradeoff and one implementation detail I should understand.
```

This is a reusable template; the backlog supplies ticket-specific acceptance criteria. If a packet cannot fit a reviewable change, split it into smaller outcomes and preserve its dependency gate.

## Next implementation session

R01 is implemented and R02A is merged. Use **R02B — help and recovery** in
[NEXT_STEPS.md](NEXT_STEPS.md) for the next session; it includes the reviewed
gaps, acceptance criteria and a separate parallel CI brief. The R01 brief below is historical
context, not an instruction to re-scaffold the repository.

## R01 implementation brief (completed local implementation)

```text
Start Rawi R01 in D:\rawi. Read AGENTS.md, docs/STATUS.md,
docs/PRODUCT.md, docs/DELIVERY.md and research/architecture.md.
Initialize a local Git repository if one does not exist, preserving current docs.
Create a minimal TypeScript/React/Vite application with a lightweight Cloudflare
Worker API skeleton using the verified supported integration. Define practical
module boundaries, environment validation and reproducible commands.
Build one original microeconomics demo lesson: a demand shift versus movement
along a demand curve, with an initial attempt, helpful fixture explanation,
a new independent-check interaction and an evidence summary.
Use local deterministic fixtures and make the fixture status explicit.
The real pilot course is pending discovery; keep lesson content replaceable.
Verify local build, narrow-screen layout and keyboard completion. Add only
meaningful tests for the learning flow. Do not connect paid services or deploy
publicly. End with a working local demo, exact verification results,
updated STATUS.md and a short explanation of the architecture.
```

R00 discovery happens in parallel through founder conversations, using [DISCOVERY.md](DISCOVERY.md). Agents can prepare materials and synthesize notes; actual recruitment and observation must be real, not simulated customer evidence.

## Review session

```text
Review the current Rawi change against ticket <ID> and docs/PRODUCT.md.
Read the actual diff and relevant implementation. Check the critical failure
cases, authorization boundaries, learning evidence rules, costs and recovery.
Run targeted verification where useful. Prioritize actionable findings with
file references and the concrete user impact. Distinguish verified defects
from questions and missing evidence. Do not approve by restating the author.
```

The implementation owner resolves findings, reruns affected checks and integrates the change. Independent review helps catch omissions but does not replace founder understanding. At each milestone, the founder should be able to explain one actual request from browser to database/model and back.

## Definition of done for a session

- The requested behavior works, including its meaningful failure cases.
- Tests or evaluations match the risk of the change, and results are recorded honestly.
- The change stays inside assigned scope; migration or interface changes are explicit.
- A short handoff records what changed, why, how to demonstrate it, remaining limits and the next dependency.
- The founder receives a concise teaching note on the important engineering tradeoff.

Do not ask the founder to re-approve ordinary reversible implementation already authorized in the task. Do not infer authorization to contact learners, spend on hosting, expose private data, or launch publicly from an implementation prompt. Concrete launch decisions should be prepared for review, with existing user authorization honored.
