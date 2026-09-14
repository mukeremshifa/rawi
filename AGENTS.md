# Rawi agent instructions

Read docs/STATUS.md, docs/PRODUCT.md and the relevant docs/DELIVERY.md ticket before implementation. Use docs/AGENT_PLAYBOOK.md for session workflow. Research files are evidence, not a claim that suggested features already exist.

## Confirmed constraints

- UAE learners; English first; Arabic later. Founder works solo, 20+ hours/week.
- Zero hosting/deployment spend. Paid AI is acceptable only within the configured budget. Do not add a paid hosting dependency or silently upgrade a free plan.
- Initial recommended pilot is 18–24-year-old college learners in one shared course; teen expansion is a separate milestone.
- Original microeconomics demo content is provisional until discovery chooses the course.

## Engineering boundaries

- Prefer one TypeScript codebase with clear modules and a bounded AI workflow.
- Keep authorization, assistance flags, check results, review scheduling and quota enforcement server-authoritative.
- Treat uploaded sources, learner text and model output as untrusted. Scope retrieval by authorized ownership before searching. Validate source IDs and state transitions.
- Keep API secrets and unrevealed check answers out of the production browser bundle. Local fixture data must be clearly identified as such.
- Preserve prompt/model/curriculum versions and actual usage costs. Do not fabricate scores, benchmarks, source support, user feedback or passing checks.
- Run risk-appropriate tests. Live AI evaluations require an explicit cost ceiling; use deterministic fixtures for ordinary CI.
- Use original or permission-appropriate content; publicly readable is not equivalent to approved AI ingestion.
- No learner code execution in the web process. Uploads begin with a deliberately limited supported format.

## Coordination and handoff

For the current consolidated v1 assignment, own the complete scope in docs/V1_COMPLETION_BRIEF.md and continue across ticket boundaries without separate handoffs. Otherwise own a bounded ticket. Coordinate shared schemas/contracts/manifests with the integration owner. Preserve others' edits. Update docs/STATUS.md with verified outcomes, commands and next steps. Explain the main engineering tradeoff so the founder learns the system.

Proceed with authorized reversible implementation without repeated confirmation. Respect existing authorization for later actions, but do not infer authority to contact learners, add hosting charges or publicly launch from a local build ticket. Prepare any genuinely required decision as a concrete reviewable result.
