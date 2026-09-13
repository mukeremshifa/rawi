# Rawi: architecture, AI quality, and operating economics

Research checked 13 September 2026; revised for the founder's confirmed constraints: solo builder, 20+ hours/week, no preferred stack, zero deployment/hosting spend, and willingness to pay for AI and development. Reachable learners are UAE college students aged 17–24 across business, social science, economics, and introductory mathematics/sciences. Select one reachable course first; introductory CS is not the recruitment default. No infrastructure has been purchased or application implemented. Under-18 participation remains gated on the separate safety/privacy decision. Prices are USD before tax.

## Recommendation

Build one TypeScript application: React/Vite static frontend, a small Hono API on Cloudflare Workers Free, and Supabase Free for Postgres/Auth/private storage. Start with diagnostic question, learner attempt, hint, another attempt, independent check, and scheduled review. Keep heavy document processing out of the free Worker. Add a queue only when asynchronous work becomes necessary.

This is a zero-hosting-cost invitation pilot with production engineering practices, not a promise of paid-production availability. The architecture teaches security, transactions, retrieval, evaluation, deployment, and recovery without unnecessary services. Twenty hours a week supports sustained iteration; it does not remove the need to validate learning and recruit a narrow cohort.

Cloudflare documents React/Vite plus an API Worker, and Hono has an official Workers deployment guide. Use one repository, package manager, and lockfile; a free `workers.dev` address; local builds initially; and ordinary SQL migrations. Keep framework versions and the Worker compatibility date explicit. [React/Vite on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/), [Hono on Workers](https://hono.dev/docs/getting-started/cloudflare-workers).

## Free infrastructure limits and tradeoffs

| Component | Current free allowance | Design consequence |
| --- | --- | --- |
| Worker API | 100,000 requests/day; 10 ms CPU/request; 128 MB memory | Thin API; profile actual authentication, validation, and stream handling |
| Static assets | Free unlimited asset requests | Serve the frontend directly; avoid running Worker code for every asset |
| Supabase | 500 MB database/project; 1 GB files; 5 GB egress plus 5 GB cached egress; two active projects | Small curated corpus, short telemetry retention, bounded uploads |
| Queues, when needed | 10,000 operations/day; fixed 24-hour retention | Small job messages and recoverable Postgres job ledger |

These are service allowances, not Rawi capacity forecasts. Network waiting does not count toward Worker CPU time, but JSON processing and stream transformations do. A slow AI call can therefore fit, while PDF parsing or a large validation payload may fail. Test the full request against the real Free runtime before committing to streaming behavior. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [static asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [Supabase pricing](https://supabase.com/pricing), [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/).

Keep Workers and Supabase explicitly on Free; enable no paid add-ons, R2 subscription, paid workflow provider, custom domain purchase, or automatic upgrade. Supabase explicitly says Free users are not charged; persistent excess can restrict service. Free Worker limits likewise fail requests instead of providing paid capacity. Stop uploads and recruitment before reaching limits. The default response to insufficient capacity is reducing pilot scope, not approving hosting spend. [Supabase cost control](https://supabase.com/docs/guides/platform/cost-control), [quota restrictions](https://supabase.com/docs/guides/platform/billing-faq), [Workers request limits](https://developers.cloudflare.com/workers/platform/limits/).

Commercial eligibility: the reviewed Workers and Supabase terms do not establish a blanket noncommercial-only restriction. Treat this as a bounded reading of current terms, not guaranteed eligibility for every monetization pattern. Cloudflare's agreement specifically restricts collecting/processing card details on free-service properties; this pilot has no checkout. [Cloudflare agreement](https://www.cloudflare.com/terms/), [Supabase terms](https://supabase.com/terms).

Vercel Hobby is explicitly noncommercial; Vercel Pro, Railway subscriptions, paid Supabase, and Inngest upgrades violate the present hosting constraint. D1 is a viable future consolidation experiment, but replacing managed authentication and Postgres retrieval adds work with little pilot benefit. [Vercel Hobby restrictions](https://vercel.com/docs/plans/hobby).

Use Google OAuth plus an application enrollment allowlist initially. Supabase documents that its default SMTP is restricted and unsuitable for general production email; do not assume free magic links will onboard arbitrary students. Keep SMS and email reminders out of the pilot. [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google).

## Application boundaries

Keep five internal modules: identity and access, course content, learning, tutor, and operations. Modules expose application functions with validated inputs; they should not reach into each other's tables casually. Route handlers translate HTTP into those functions. The browser renders learning activity and streams tutor text, while the server authorizes every action and commits canonical state.

Use Postgres for courses, concepts, prerequisite edges, source versions, questions, attempts, sessions, review items, and usage records. Retain question version, expected answer or rubric, and grading method with each attempt. Record whether an answer was independent, hinted, or revealed. A learner opening a solution must not count as demonstrating mastery.

The model may propose feedback and evidence about an answer. Deterministic application rules decide whether that evidence is sufficient to record a result, advance an activity, or schedule review. Start with a transparent skill status such as unseen, practicing, and ready for review. Avoid displaying a precise mastery percentage before it is calibrated against independent performance.

Store original documents privately, keeping page identifiers, source version, processing version, and stable chunk IDs. Supabase's pgvector extension stores embeddings and supports vector similarity search. Keep ordinary SQL relationships and authorization alongside retrieval rather than adding a separate vector database immediately. [Supabase pgvector documentation](https://supabase.com/docs/guides/database/extensions/pgvector).

## A bounded tutor request

For each learner turn, authenticate, authorize the course/session, reserve an estimated usage budget, load the current activity, retrieve permitted evidence, make the model call, validate the result, and persist its outcome. Give each turn an idempotency key. Preserve learner input across a refresh or failed response. A retry should resume or replace the failed attempt visibly rather than silently generate duplicate turns.

Use a typed model response containing learner-facing feedback, suggested next action, relevant concept IDs, and source references. Treat these as proposals. Validate IDs against server-provided allowlists, check citations exist in retrieved material, and reject malformed transitions. Structured output solves a formatting problem; OpenAI explicitly notes that it can still contain mistakes. [Structured outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs).

Retrieval should first restrict results by authorized course and source version. Compare simple lexical retrieval with lexical plus semantic retrieval on real course questions. Preserve enough neighboring context for definitions, equations, and exceptions. A valid citation is more than an existing page: the cited passage must support the explanation. When evidence is missing, ask for the missing material or explain the limitation instead of inventing a reference.

For the first pilot, preprocess a small licensed course pack locally and review its questions. Later, allow browser-side extraction from text PDFs with page mapping and a learner preview. Treat extracted text as untrusted input; validate size, ownership, and structure server-side. Avoid promising OCR, equation extraction, or diagram understanding. Initial science material should use manually checked equations, units, figures, and solutions.

Cloudflare Queues can later dispatch bounded embedding batches. Ordinary delivery commonly takes three operations: write, read, delete; retries add more. Store job status, source version, and progress in Postgres because free messages expire after 24 hours. Use unique constraints, bounded retries, and a reconciliation command to replay unfinished jobs. Queue availability does not remove Worker CPU limits. [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/).

## Provider and model policy

Define application capabilities such as `generateTutorTurn`, `evaluateAttempt`, and `embedSources`. Keep provider model names, request conversion, usage extraction, timeouts, and errors in adapters. Do not implement a universal agent framework. The initial adapter can use OpenAI's Responses API, which official OpenAI documentation recommends for new projects. [Responses migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses).

Compare a lower-cost and stronger candidate on Rawi's actual course questions, including prose explanations and quantitative mistakes. For adults, choose the least expensive configuration clearing quality gates; do not apply that policy automatically to 17-year-olds. Reserve escalation for explicit verification failures. Model self-reported confidence alone must not trigger trust or advancement.

A fallback provider must pass the same contract and evaluation suite before serving learners. Never switch silently to an unevaluated cheaper model during an outage. Keep routing configurable by task and cohort, with an emergency disable switch. Record provider, model/snapshot where available, prompt version, corpus version, and route decision so regressions can be traced. Teen routing must follow the later age-specific product and provider review.

## Quality is a release gate

Maintain repository-owned fixtures and an evaluation runner. OpenAI's official guidance recommends task-specific evaluation and human calibration; it also currently says its hosted Evals platform will become read-only on 31 October 2026 and shut down on 30 November 2026. The evaluation discipline is useful; that hosted product is not a sensible new dependency for Rawi. [Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices).

Start with approximately 80–120 reviewed cases: correct and partially correct answers, common misconceptions, ambiguous questions, missing source evidence, contradictory notes, requests to reveal answers immediately, and malicious instructions inside uploaded content. These counts are proposed starting scopes, not statistically sufficient proof of learning effectiveness. Keep a separate holdout set, repeat selected cases to detect variability, and add real failures after appropriate redaction.

| Layer | What to measure | Initial release decision |
| --- | --- | --- |
| Software | Authorization, state transitions, idempotency, deletion, quota accounting | All critical invariants pass |
| Retrieval | Whether supporting evidence appears in the retrieved set | Review failures separately from generation failures |
| Tutor | Correctness, hint usefulness, appropriate progression, source support | No critical errors in the reviewed release set; investigate every regression |
| Operations | Successful turn rate, latency, ingestion completion, cost per completed session | Stay inside a written pilot budget and service target |
| Learning | Independent transfer questions and delayed checks | Compare outcomes with a defined baseline before making efficacy claims |

Use exact checking for numeric or multiple-choice answers where appropriate, with documented tolerances and units. Use rubric-based model grading only where necessary, calibrated against a human reviewer. A second model is useful for triage but is not an authoritative answer key. Likewise, an attractive conversation or high satisfaction score does not establish learning.

Run deterministic tests on ordinary changes. Run the small AI regression suite when prompts, models, retrieval, grading, or relevant content changes. Run broader comparisons before releases that affect tutor behavior. Keep evaluation spend separately visible. This gives future agent sessions fast feedback without paying for a large model benchmark after every CSS edit.

## Unit economics before subscription pricing

For a request, estimate:

`C_request = (T_uncached × P_input + T_cached × P_cached + T_billable_output × P_output) / 1,000,000 + C_tools`

Include any billable reasoning tokens in the provider's reported output total without double-counting them. Then calculate:

`C_session = sum(all request attempts, grading, retrieval embedding, and tool charges)`

`C_month = fixed services + session count × average C_session + ingestion + storage/egress + evaluation + support`

Illustrations using 4,000 uncached input and 800 billable output tokens per call:

| Candidate, not selection | Input/output per million | One call | 20-call session |
| --- | --- | --- | --- |
| GPT-5.4 Mini | $0.75 / $4.50 | $0.0066 | $0.132 |
| GPT-5.6 Terra | $2 / $12 | $0.0176 | $0.352 |

These are dated arithmetic examples, not measured tutoring performance or an under-18 recommendation. [Mini pricing](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [official model comparison](https://developers.openai.com/api/docs/models/compare).

At the Mini illustration, 20 learners doing eight sessions/month produce $21.12 in those calls; 100 doing 12 produce $158.40. Extra grading, retries, reasoning, images, and evaluation increase costs. Hosting remains $0 within the free configuration. Track AI API billing separately from development subscriptions; do not assume a coding/chat subscription supplies API credits. Confirm actual API access and balance before integration.

Reserve budget atomically before a request; reconcile actual usage afterward. Cap upload size, pages, context, generated output, concurrent requests, and sessions per account. Use stable prompt prefixes where suitable, concise retrieved context, summaries with provenance, and pre-generated reviewed exercises. Do not reduce critical teaching quality merely to meet an arbitrary token target.

## Operational failures to design for

| Failure | Required behavior |
| --- | --- |
| Provider timeout or throttling | Bounded retry with backoff, preserved learner input, visible retry state, qualified fallback only |
| Stream disconnects | Mark incomplete output; never grade it as a completed interaction |
| Duplicate job or submission | Unique constraints and idempotent transitions prevent duplicate attempts or charges |
| Bad document extraction | Quarantine the source and explain why it cannot yet be used |
| Model invents a citation | Reject invalid references; surface unsupported evidence for review |
| Cross-account data access | Negative authorization tests cover queries, downloads, and retrieval |
| Budget exhaustion | Stop new expensive actions gracefully while keeping prior work readable |
| Broken release | Feature flag and application rollback; backward-compatible database migration |

Enable row-level policies on learner data and private storage, and test them using two separate accounts. Supabase documents that privileged secret keys can bypass row-level security; server code using such access must independently enforce ownership and must never expose those credentials to browsers. [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).

Capture request IDs, timings, token usage, failure categories, prompt versions, and evidence IDs. Keep ordinary telemetry free of raw learner messages by default. Maintain a restricted, short-retention quality-review path when needed. Alert on persistent turn failures, failed ingestion, unusual spend, and authorization anomalies rather than every transient retry.

Supabase Free can pause for low activity over seven days and lacks automatic database backups. Check availability before arranged sessions; do not simulate traffic to evade the plan. Export encrypted database backups locally on a documented schedule and before migrations; preserve source files separately and rehearse a restore. Database backups do not contain Storage objects. This is the main reliability tradeoff of the zero-hosting pilot. [Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [backup guidance](https://supabase.com/docs/guides/platform/backups).

## Session-sized implementation order

Treat each item as a bounded task with a demonstrable outcome; split anything too large before coding. These are work packets, not a calendar promise.

1. Establish the course, concept map, reviewed questions, baseline learning task, and initial evaluation fixtures.
2. Scaffold React/Vite plus Hono, environment validation, local checks, and Free deployment; verify CPU headroom before adding features.
3. Add authentication, course enrollment, schema migrations, and tests proving two users cannot cross access boundaries.
4. Build the complete learning loop using fixed responses; prove attempt tracking and independent checks work.
5. Add the provider adapter, tutor prompt, schema validation, usage records, and a runnable AI evaluation report.
6. Add curated retrieval with source navigation; inspect evidence correctness on the reviewed questions.
7. Add bounded document extraction, queue/job recovery, deletion, and failure screens behind a feature flag only if the cohort needs uploads.
8. Add review scheduling and a useful progress screen driven by actual attempts.
9. Exercise quotas, outage behavior, load representative of the pilot, accessibility, rollback, and restore.
10. Run a small eligible UAE college pilot in one reachable course, review outcomes, and expand only inside verified capacity and age safeguards.

Each agent session should receive one objective, allowed files, contracts, acceptance criteria, and verification commands. End with a small reviewed change and evidence of behavior. Parallelize independent research, UI work against stable interfaces, or test fixtures; give one owner control of shared migrations and integration. The builder should be able to explain every trust boundary and state transition before accepting the work.
