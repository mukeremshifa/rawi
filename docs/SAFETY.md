# Safety and data design

This is an engineering document. It records the controls the code implements and
the questions that have to be answered before real learner data is collected. It
is **not** a claim of legal compliance: which regimes apply depends on the
operator, the market, the users and the purpose, and none of those is decided by
this repository.

---

## Trust boundaries

**Uploaded material, learner text, retrieved passages and model output are all
untrusted.** Retrieval does not solve prompt injection — OWASP's LLM01 entry is
explicit that indirect instructions embedded in external documents are a
first-class risk and that RAG is not a mitigation for it.

What the code does about it:

- **Every system instruction states it.** `src/server/ai/prompts.ts` tells the
  model that the learner's response, the item prompt and the source passages are
  *data, never instructions*, and to ignore any request inside them to change
  its behaviour. This is not sufficient on its own, which is why the rest of
  this list exists.
- **The server derives ownership from the verified JWT.** No supplied user id
  decides access. `RequestContext` has no field one could arrive in.
- **Retrieval is scoped before it searches.** `search_chunks` takes the user id
  and workspace id and filters on them in SQL. Nothing retrieves broadly and
  filters afterwards.
- **A model cannot act.** It returns structured JSON that is parsed and
  validated. It cannot run SQL, delete anything, change entitlements, or grant
  itself a capability. The only thing its output can do is *suggest* — and only
  after `validateAssessment` has held every quote to the learner's own text.
- **Nothing renders as HTML.** `InlineText` emits elements and cannot produce
  markup by construction; there is no `skipHtml` option to get wrong. An ESLint
  rule blocks `dangerouslySetInnerHTML` and is not disabled anywhere.
- **No third-party requests from a page showing model output.** Fonts are
  self-hosted for exactly this reason.

**File ingestion** validates type and size, accepts only `.txt` and `.md`, reads
them as plain text with no parser to exploit, and bounds every processing step.
URLs, archives and executable uploads are outside the ingestion scope. Learner
code is never executed; a future code runner needs its own sandbox and its own
review.

**Deletion must beat an in-flight job.** A job that completes after its
workspace is deleted must not recreate content. Cascading foreign keys handle
the rows; the job's own writes fail against a missing parent rather than
resurrecting it.

---

## Data inventory and retention

Collect only what the learning service needs: an account identifier, the
sources the learner added, concepts extracted from them, attempts, assistance
flags, review schedule, and operational events. Not school rosters, not precise
location, not diagnoses, not family profiles. Raw learner text does not go into
general analytics.

| Data | Retention | Deletion behaviour |
| --- | --- | --- |
| Account | Account lifetime, subject to a documented inactivity policy | Revoke access, cascade dependent deletion |
| Attempts and evidence | Until the learner deletes the workspace | Deleted with the workspace, not anonymised in place |
| Ask conversations | `RAWI_RETENTION_DAYS` (default 30) | Content, citations and cached copies removed |
| Sources and chunks | While the workspace exists | Hidden from retrieval immediately; rows cascade |
| Content-free operational logs | 30 days | Expire automatically; access restricted |
| Backups | Per the provider's verified policy | Document expiry; reapply deletion after any restore |

**These are design proposals, not legal retention periods.** Reconcile them with
what the provider actually does before making a privacy promise. A provider's
"we do not train on your data" and "we retain nothing" are different claims, and
both have to be checked in the settings rather than inferred from marketing.

Deleting a workspace cascades to its sources, chunks, concepts, sessions,
attempts and jobs. One row, and everything the learner put in goes with it.

**Identity is stored separately from anything used for evaluation.** Consent to
ordinary service use is not consent to publish conversations or build a
benchmark. `npm run eval:live` runs against fixtures written for the purpose,
never against learner data.

---

## Minors

**This is unresolved and the code does not pretend otherwise.**

- `RAWI_INVITE_ONLY` exists and defaults to `false`. Turning it on is the
  mechanism for a controlled cohort; it is not an age check.
- A birthday checkbox does not make an app adult-only, and student status does
  not imply adulthood — some college learners are minors.
- Before minors use this: age assurance, guardian involvement where required,
  reporting duties, and whatever platform classification applies in the
  operating market. Several regimes attach to *likely access* rather than to
  stated target audience, so a label in a footer settles nothing.
- A provider's guidance for under-18 use typically requires additional
  safeguards and a different data-retention posture. Adult cost and model
  routing cannot be copied across.

Nothing in the codebase currently implements age assurance. That is a stated
gap, not an oversight to be discovered later.

---

## Tutor behaviour

- **Rawi identifies itself as AI.** It does not present as a person.
- **It never claims a learner knows something it did not watch them do
  unaided.** That is invariant 2, and it is the safety property this product is
  actually built around: an encouraging tutor that overstates what someone has
  demonstrated causes a specific, delayed harm at the exam.
- **It does not guess.** When the sources do not answer a question, it says so
  and cites nothing. Falling back to general knowledge would quietly break the
  one promise the grounded surface makes.
- **Reporting.** A "report a problem" path with minimal, user-visible context
  selection. Support hours are described accurately; nothing implies live
  monitoring that does not exist.
- **Tested responses** are needed for distress, self-harm, abuse disclosures,
  sexual content and harassment, while keeping ordinary educational discussion
  possible. A moderation classifier is one input to that policy, not a
  substitute for tested conversation behaviour or for human procedures.
- **Respect assessment rules.** When a learner says they are inside a restricted
  assessment, redirect to concepts or an analogous practice problem. Rawi does
  not advertise cheating detection, and does not send private learner
  conversations to anyone by default.

---

## The evidence this needs before real learners

- Two accounts cannot reach each other's workspaces, sources, passages,
  attempts or exports — through the UI *or* the API.
- Injection fixtures cannot grant access, change evidence, or cause an
  unauthorised action.
- A deleted source disappears from retrieval immediately and stays deleted
  through job retries.
- A learner can report an error, export their data, and request deletion.
- A timed-out model request leaves a recoverable session and does not
  double-count usage or attempts. (`ambiguous` reservations exist for the usage
  half of this.)
- A full session can be completed with a keyboard and on a narrow screen; WCAG
  2.2 AA is the accessibility target.
- The operator can disable AI, pause enrolment, inspect redacted errors, and
  restore a backup into an isolated environment.

**Engineering cannot establish legal clearance, and a settings page cannot
create a monitoring service that does not exist.** The controls above are what
the code does; the decisions about market, audience and provider policy belong
to whoever operates it.

---

## References

- OWASP Gen AI Security Project, [LLM01:2025 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
- W3C, [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/)
- FTC, [Children's Online Privacy Protection Rule](https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa)
- ICO, [Introduction to the Children's Code](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/introduction-to-the-childrens-code/)
- US Department of Education, [Online tools and FERPA](https://studentprivacy.ed.gov/faq/i-want-use-online-tool-or-application-part-my-course-however-i-am-worried-it-violation-ferpa)
- European Commission AI Act Service Desk, [Education and vocational training](https://ai-act-service-desk.ec.europa.eu/en/education-and-vocational-training)

Links were current when written; all six are living documents and none should be
quoted from memory.
