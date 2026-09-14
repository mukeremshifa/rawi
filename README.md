# Rawi

An English-first AI learning workspace for UAE students, beginning with a small college pilot. The product helps learners understand a concept, solve a new problem independently and remember it later.

This repository contains the integrated v1 application and pilot preparation
materials. It includes invitation-only authentication, authoritative Supabase
saves, a bounded source-linked tutor, distinct delayed review, issue reporting,
export/delete, redacted founder metrics, and feature-flagged pasted-text sources.
Nothing is publicly deployed, no paid AI evaluation has been run, and no learner
participation is claimed.

## Running it locally

Requires Node 20 or later.

```bash
npm install
# Vite and Wrangler need their binaries; approve the blocked install scripts:
npm install-scripts approve esbuild
npm install-scripts approve workerd

npm run dev:api:fixture # Worker API on http://127.0.0.1:8787, offline fixture mode
npm run dev       # browser app on http://localhost:5173 (proxies /api)
```

Two processes in development; in production the Worker serves the built assets, so the browser origin is unchanged.

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest — learning invariants and API behavior |
| `npm run build` | Typecheck, then build to `dist/client` |
| `npm run acceptance` | Fetch-level deterministic journey |
| `npm run e2e` | Real Chromium mobile/keyboard journey |
| `npm run verify` | Full local integrated fixture gate |
| `npm run deploy:check` | Production build and Wrangler dry run; does not deploy |
| `npm run eval:live` | Opt-in paid AI eval; requires an explicit cost ceiling |

Use `.dev.vars.example` for configured Supabase/OpenAI mode. Paid tutoring fails
closed unless a provider key and both monthly caps are present. The provisional
original microeconomics pack is not subject-reviewed; uploads remain off for the
pilot. Read [deployment and operations](docs/DEPLOYMENT_RUNBOOK.md) before any
release action.

## Start here

1. Read the [research and product strategy](research/REPORT.md) for the recommendation, evidence, tradeoffs and costs.
2. Use the [product specification](docs/PRODUCT.md) and [delivery backlog](docs/DELIVERY.md) for implementation scope.
3. Read the [current status](docs/STATUS.md), [deployment runbook](docs/DEPLOYMENT_RUNBOOK.md), and [pilot runbook](docs/PILOT_RUNBOOK.md).
4. Run founder discovery alongside development using the [interview and pilot protocol](docs/DISCOVERY.md).

## Working constraints

- UAE college contacts are 17–24; proposed first pilot is 10–20 learners from the 18–24 subset. Teen/high-school support follows a separate release.
- English primary; Arabic later. Select one shared course through discovery; microeconomics is only the provisional demo subject.
- Solo founder, 20+ hours/week. Real learner pilot and engineering depth are both priorities.
- Hosting/deployment cost must remain zero. Paid AI usage requires a configured budget; existing subscription credit eligibility is unverified.
- Recommended stack: React/TypeScript/Vite, a lightweight Cloudflare Worker API and Supabase Free, within verified plan limits.

## Project documents

| Document | Purpose |
|---|---|
| [Current status](docs/STATUS.md) | Confirmed constraints, open decisions and actual progress |
| [Next steps](docs/NEXT_STEPS.md) | GitHub snapshot, reproduced gaps and next implementation brief |
| [Product](docs/PRODUCT.md) | Learner flow, modes, content rules and pilot metrics |
| [Delivery](docs/DELIVERY.md) | Tickets, dependencies, estimates and readiness gates |
| [Agent playbook](docs/AGENT_PLAYBOOK.md) | Implementation and review session prompts |
| [Discovery](docs/DISCOVERY.md) | Interviews, course selection and pilot measurement |
| [Safety and data](docs/SAFETY.md) | UAE/minor considerations and concrete controls |
| [Competition](research/market.md) | Current alternatives and positioning hypotheses |
| [Learning evidence](research/learning.md) | Original studies, limitations and pedagogy |
| [Architecture](research/architecture.md) | Free-tier design, AI costs, evaluation and recovery |
| [Source index](research/SOURCES.md) | External references used across the pack |

Implementation sessions follow [AGENTS.md](AGENTS.md). Founder discovery, subject
review, legal/operator configuration, account-plan confirmation, capped live AI
evaluation, deployment authorization and actual pilot participation remain real
external work; fixture results are never presented as learner evidence.
