# Rawi v1: complete implementation and integrated verification

## Assignment

Finish the remaining Rawi v1 in one continuous implementation pass.
Own R04–R09 and all software/materials needed to run R10. Inspect the current
R03 implementation and fix remaining integration defects as part of this pass.
Do not stop after individual tickets, ask for another handoff at milestones,
or end by proposing the next implementation session.

This supersedes the previous ticket-by-ticket and three-session execution order.
Tickets remain a scope checklist, not separate approval gates. The founder
explicitly prioritizes a working integrated product and lower token use.

Read AGENTS.md, STATUS.md, PRODUCT.md, this brief and the relevant DELIVERY.md
rows once. Inspect existing implementation before editing. Latest status records
R03 authoritative saves, exposure and browser auth implemented locally; do not
rebuild these or assume older review findings still apply. Research files are
reference material, not mandatory rereading.

## Definition of the finished v1

An invited UAE adult learner can sign in, open a supported unit, learn with
bounded AI help and attributable sources, practice, pass a fresh independent
check, leave, resume saved progress and complete a distinct delayed review.
Their evidence remains accurate and private. They can report a problem and
export/delete their data. The founder can manage pilot enrollment, inspect
redacted operational/learning summaries, and enforce a real AI budget.

Deliver the functioning product, reproducible setup, integrated checks and
deployment/pilot handoff. Preserve English-first, the one-course starting point,
zero hosting charges and the existing TypeScript architecture.

## Build the complete scope

### Foundation integration

Reuse R03 auth, enrollment, async authoritative storage, conditional writes,
learner-wide exposure and common evidence projection. Finish any missing wiring.
Configured mode must fail closed; enforce ownership before reads/mutations,
await required commits, and reconcile conflicts without inventing saved progress.
The browser must support auth initiation/callback, refresh, sign-out, enrollment
states, resume, readable loading/errors and useful retry behavior.

### R04 — real bounded AI tutor

Implement one provider end to end, using its current official API documentation.
Choose one supported economical model; keep its identifier and verified pricing
configurable. No multi-provider framework or agent orchestration platform.

Use authorized course material and learner context to produce validated teaching
responses with source references. Keep active independent-check answers out of
tutor context. Source text, learner input and model output are untrusted; model
text cannot change access, evidence, review dates or quotas.

Reserve a conservative request budget atomically before every paid call.
Enforce per-learner limits and a global configured monthly cap across concurrent
requests and retries. Set bounded input/output sizes and timeouts. Record actual
provider/model/prompt/curriculum versions, token usage and cost; settle usage and
handle ambiguous failures without releasing reservations unsafely. Never claim
estimated usage is provider-confirmed usage.

Keep deterministic fixture mode, cancellation/retry behavior and a useful
provider-unavailable fallback. Missing keys or spending caps disable paid calls.
Live verification is allowed only under an explicitly supplied cost ceiling.

### R05 — curriculum and sources

Integrate one small original course pack with concepts, explanations, worked
examples, misconceptions, practice and distinct immediate/delayed checks.
Keep existing demo content replaceable. Do not expand to multiple subjects.

Store source IDs, versions, permission basis and reviewer status. Make source
excerpts accessible in the UI. Resolve references against authorized sources;
unsupported claims/citations must fail clearly. Start with simple lexical
retrieval where needed; no vector service unless the actual use case requires it.
Do not fabricate subject-review approval. Flag unreviewed content until a real
competent reviewer signs off.

### R06 — real return and delayed review

Implement Continue, due-review queue, fresh review item selection, saved review
attempts and subsequent deterministic scheduling. Reuse authoritative evidence
rules. Retained-on-review requires a qualifying delayed, correct, unaided attempt;
reopening an answered item is not new evidence. Track assistance and exposure
across sessions. Handle bank exhaustion, retries and timezone boundaries honestly.

### R07 — deliberately limited uploads

Include this previously optional software in this consolidated build:
pasted text and small text-based PDFs, with explicit size/page/type limits.
Keep it behind a feature flag and off for pilot enrollment until extraction and
content-rights readiness are confirmed. Do not add scans, handwriting or OCR.

Provide permission acknowledgment, extraction preview, usable failure states,
authorized private storage and ownership-scoped retrieval. Ingestion must be
bounded, deduplicated and compatible with zero hosting spend; guard deletion and
retry races. If a free deployment constraint prevents safe PDF processing,
finish pasted-text ingestion and record the specific PDF blocker rather than
adding a paid dependency or silently claiming PDF support.

### R08 — essential product operations

Implement invite-only enrollment, issue reporting, learner export/delete, basic
retention controls and a redacted founder support view. Keep founder routes
server-authorized. Include minimal learning events needed for pilot activation,
completion, return and delayed evidence; show counts with denominators and
distinguish synthetic fixtures from real observations.

Provide visible privacy/eligibility information using known facts and explicit
configuration for missing operator details. Do not invent a legal sign-off.
Avoid a large admin dashboard, marketing site, payments or unrelated polish.

### R09 — integrated readiness and deployment package

Make install, dev, fixture mode, migrations, build and verification reproducible.
Add lightweight offline CI using the integrated commands. Include environment
templates, secure secret setup, deployment configuration, rollback, backup/restore,
quota/outage behavior and support instructions.

Verify the selected accounts/plans and resource choices can run with zero hosting
spend before provisioning/deployment. Do not upgrade plans or add billable hosting
resources. Prepare a concrete deployment result and commands. This brief does not
authorize public launch, changes to billing, or contacting learners. Honor any
more specific deployment authorization already present in the implementation
session; otherwise finish the deployable artifact and list release actions once.

### R10 — pilot-ready, not simulated pilot results

Build the pilot-facing app and the tools/materials for the 10–20-person adult UAE
pilot: onboarding instructions, founder observation checklist, support/reporting,
metrics summary/export, seven-day review procedure and findings template.
R00 discovery can select the real course without blocking original fixture code.

R10 includes actual recruitment, learner use and delayed follow-up. These cannot
be completed by writing software or generating synthetic sessions. Label R10
“ready for pilot” only when ready; never mark real observations completed or
invent participant feedback. Do not contact anyone without explicit authorization.

## One integrated verification pass

Build connected features first; use focused checks while coding only when they
resolve a concrete issue. Preserve existing meaningful regressions.

When the product is integrated, run lint/typecheck, existing tests, production
build and a small real-browser end-to-end suite together. Fix failures and rerun
affected checks; rerun the final integrated gate after the fixes. Do not repeat
the entire suite after documentation edits or create coverage targets.

Cover the risks that determine whether this v1 works:
- Two synthetic ordinary identities: own save/resume, cross-owner denial, cold
  cache, direct permitted database access, conflict and failed-save recovery.
- Full learn/help/practice/fresh-check journey, refresh/retry, honest wrong/assisted
  labels, exposure persistence and a clock-controlled delayed review.
- Concurrent AI reservations, caps, retries/ambiguous failures, timeout fallback,
  malformed model output and unsupported or unauthorized source references.
- Bounded uploads, failed extraction, ownership and deletion where enabled.
- Export/delete, founder authorization, secret/check-answer confidentiality,
  keyboard completion and narrow-screen layout.
- Runtime smoke/profile and a representative hosted journey where credentials
  and deployment authorization permit. Distinguish mocked/local checks from
  actual hosted verification and real UAE-device/network observations.

Use deterministic AI fixtures in ordinary tests. Prepare a compact live eval set;
run it only with an explicit cost ceiling. Report unrun checks as unrun.
Do not substitute fetch-only tests for browser acceptance.

## Autonomy and token discipline

- One implementation owner, continuous execution through the whole scope.
  Do not create separate agent sessions or delegate by default.
- Make ordinary reversible decisions and fixes autonomously. No approval loops
  for local implementation, test failures or routine refactoring.
- Do not repeat research, audits, giant logs or ticket-by-ticket reports. Retrieve
  only current documentation needed for the selected integration.
- Keep progress updates short and meaningful; update STATUS.md at substantive
  checkpoints, not for every edit. Use context checkpoints to continue the same
  assignment, not as a reason to stop and ask for another prompt.
- If credentials, budget, provider activation or human decisions are missing,
  batch the missing inputs into one concise request and continue all independent
  implementation with fixtures/local setup. Do not guess credentials or ceilings.
- Do not declare done while software remains that can be completed locally.
  External blockers must be specific; complete the rest of the app and setup
  rather than returning only a plan.
- Avoid uploads beyond the bounded scope, teen access, Arabic, multiple subjects,
  voice, social features, payments and new infrastructure experiments.

## Final handoff — one report

Provide:
1. What the working v1 includes and how to run/demo it.
2. Exact integrated verification results, with local/hosted/live-AI distinctions.
3. One short list of remaining external inputs and deployment/pilot actions.
4. Material known limitations and the real status of R04–R10.

Update STATUS.md and DELIVERY.md consistently. R10 human participation is not a
software task to fabricate. End with the implemented product and evidence, not
a new series of proposed implementation tickets.
