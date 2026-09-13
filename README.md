# Rawi

An English-first AI learning workspace for UAE students, beginning with a small college pilot. The product helps learners understand a concept, solve a new problem independently and remember it later.

This repository currently contains research and an implementation plan. No application has been built or deployed.

## Start here

1. Read the [research and product strategy](research/REPORT.md) for the recommendation, evidence, tradeoffs and costs.
2. Use the [product specification](docs/PRODUCT.md) and [delivery backlog](docs/DELIVERY.md) for implementation scope.
3. Start the first implementation session with the ready-to-paste brief in the [agent playbook](docs/AGENT_PLAYBOOK.md).
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
| [Product](docs/PRODUCT.md) | Learner flow, modes, content rules and pilot metrics |
| [Delivery](docs/DELIVERY.md) | Tickets, dependencies, estimates and readiness gates |
| [Agent playbook](docs/AGENT_PLAYBOOK.md) | Implementation and review session prompts |
| [Discovery](docs/DISCOVERY.md) | Interviews, course selection and pilot measurement |
| [Safety and data](docs/SAFETY.md) | UAE/minor considerations and concrete controls |
| [Competition](research/market.md) | Current alternatives and positioning hypotheses |
| [Learning evidence](research/learning.md) | Original studies, limitations and pedagogy |
| [Architecture](research/architecture.md) | Free-tier design, AI costs, evaluation and recovery |
| [Source index](research/SOURCES.md) | External references used across the pack |

Implementation sessions follow [AGENTS.md](AGENTS.md). Begin with R01; R00 founder discovery runs alongside it. Update status with verified outcomes rather than treating planned features as completed work.
