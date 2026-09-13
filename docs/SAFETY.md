# Rawi safety and data design

This document translates source material into proposed engineering requirements. Jurisdictional applicability depends on the chosen market, operator, users, and deployment purpose; this is a scoped launch map, not a claim of legal compliance. Sources were checked on 13 September 2026.

## UAE launch scope

The launch market is the UAE. Federal Decree-Law No. 26 of 2025 addresses child digital safety for digital platforms operating in or targeting the country. The official government overview describes age verification, privacy defaults, content controls, and conditional restrictions on collecting under-13 data. Education is not an automatic exemption. [10]

The indexed official law text states entry into force on 1 January 2026 and describes a regularization provision for persons already subject at issuance. Do not interpret this as permission for a new app to postpone protections. Detailed classification and implementing requirements need confirmation against the applicable current rules before a teen launch. [12]

For adults, assess the applicable UAE personal-data regime, including any free-zone exceptions, and the basis for international transfers. The federal PDPL addresses cross-border transfer conditions in Articles 22 and 23; a nearby cloud region does not establish compliance. [11] Document where the database, files, backups, logs, authentication, and model processing occur. Do not promise UAE-only data storage or processing on the proposed free stack.

Source access limitation: relevant UAE government overview and law passages were available through indexed official results; direct statute/PDF retrieval returned access errors. This supports identifying the applicable issues, not a completed article-by-article legal assessment. Before collecting real learner data, verify applicable notices, processing arrangements and transfers. Before minors join, resolve age assurance, guardian involvement where required, reporting duties, and platform classification with current UAE guidance.

## Audience and expansion boundary

Recommend an invitation-only 18+ pilot. Record intended audience and recruitment process, and define how to respond if a minor is identified. A birthday checkbox alone does not establish that an app is adult-only. Do not infer age from student status: some college learners are minors.

| Situation | Source-backed consideration | Product implication |
|---|---|---|
| US users under 13 | COPPA covers child-directed services and services with actual knowledge of collecting under-13 personal information. The FTC's amended rule adds protections around disclosure and retention. [1][2] | Under-13 enrollment is outside the proposed release. A future release requires a dedicated consent, minimization, retention, and vendor assessment. |
| UK children | The Children's Code can apply to services likely to be accessed by under-18s, including services outside the UK; target-audience labels are insufficient. [3] | Review actual access and design high-privacy defaults before entering this market. |
| School-provided US education records | FERPA school-official arrangements involve school control of records and restrictions on purpose and redisclosure. [4] | Direct consumer study and school deployment need separate data/contract assessments. Do not market a blanket “FERPA certified” claim. |
| EU institutional assessment | The Commission distinguishes educational systems that affect grades or placement from certain voluntary informal-learning tools. [5] | Keep Rawi's initial progress evidence for learner self-study; assess classification before adding institutional grading, credentials, or placement. |
| OpenAI use with minors | Official guidance requires additional safeguards, discusses age assurance and escalation, and says not to process under-13 or applicable digital-consent-age personal data without API zero data retention. It recommends current flagship models particularly for minors. [6] | A future teen release needs a fresh provider and cost decision, age-appropriate evaluation, reporting, and operational support. Adult cost routing cannot be copied blindly. |

The international table is for future expansion, not a substitute for the UAE assessment. Start with UAE recruitment and do not open worldwide registration by default. The preferred pilot cohort is 18–24; the 17-year-old college and 13–17 high-school groups join only after the teen requirements are implemented and assessed. High-school status alone does not determine age eligibility.

## Data inventory and retention proposal

Collect only what the learning service needs: account identifier, eligibility result appropriate to the pilot, chosen course, attempts, assistance flags, review schedule, and necessary operational events. Avoid school rosters, precise location, full birth dates where not needed, diagnoses, or family profiles. Do not record raw chat or notes in general analytics.

| Data | Initial retention proposal | Deletion behavior |
|---|---|---|
| Login/account details | Account lifetime, subject to a documented inactivity policy | Revoke access and initiate dependent deletion |
| Learning attempts and evidence | Until learner deletion or policy expiry | Delete or irreversibly anonymize only where permitted and accurately described |
| Tutor conversation text | 30 days by default for resuming sessions; validate need in pilot | Remove content, associated search data, and cached copies |
| Source files and chunks | While the learner keeps the course/source | Immediately hide and disable retrieval; complete asynchronous deletion |
| Content-free operational logs | 30 days as a starting target | Expire automatically; restrict access |
| Backups | According to the chosen provider's verified backup policy | Document expiry and reapply deletion tombstones after restore |

These durations are design proposals, not legal retention periods. Reconcile them with actual provider controls before making privacy promises. API non-training commitments and zero retention are different concepts; vendor settings must be checked rather than inferred. [7]

Store identity separately from eval samples. Consent to ordinary service use must not silently become consent to publish conversations or build a public benchmark. Prefer synthetic or rights-cleared fixtures. Offer an understandable export and deletion flow with status when completion is asynchronous.

## Trust boundaries

Uploaded materials, learner text, retrieved excerpts, and generated output are untrusted. Retrieval does not solve prompt injection; OWASP explicitly describes indirect instructions in external documents and limits of RAG as a mitigation. [8]

For Rawi, this means that the server derives ownership from the authenticated identity; no supplied `user_id` decides access. Retrieval is scoped before search, and citations resolve only to accessible source versions. A model can suggest a teaching response, but it cannot run SQL, delete files, change entitlements, or approve its own tool permissions. Validate structured outputs and render only allowlisted content; suppress untrusted remote images and unsafe links.

File ingestion requires type and size validation, restricted parser execution, content limits, timeouts, and an isolated working directory. URLs and arbitrary executable uploads are outside the first ingestion scope. Never execute learner code in the web application process. A later code runner needs its own bounded sandbox and security review.

Account deletion must also prevent an in-flight ingest job from recreating deleted content. Enforce a deletion/version check before each persisted job result. Retry deduplication and audit identifiers must preserve privacy as well as consistency.

## Tutor behavior and reporting

Clearly identify Rawi as AI. Provide “Report incorrect explanation” and “Report a problem” controls with a minimal, user-visible context selection. Explain support hours accurately; do not imply live crisis monitoring when none exists.

Define tested responses for distress, self-harm, abuse disclosures, sexual content, harassment, and attempts to turn the tutor into an exclusive relationship. Appropriate educational discussion should remain possible. A moderation result is one input to a policy, not a substitute for tested conversation behavior or human support procedures.

Respect course rules. When a learner identifies an active restricted assessment, redirect to concepts or an analogous practice problem. Do not advertise cheating detection, and do not send private learner conversations to parents or institutions by default.

## Required pilot evidence

- Two independent accounts cannot retrieve each other's courses, files, source excerpts, attempts, or exports through either UI or API.
- Injection fixtures cannot grant access, change progress, or cause unauthorized actions.
- A deleted source disappears from retrieval immediately and stays deleted through job retries.
- The learner can report an error, export their data, and request deletion.
- A timed-out model request leaves a recoverable session and does not double-count usage or attempts.
- The lesson can be completed with a keyboard and on a narrow screen; accessibility verification uses WCAG 2.2 AA as the target. [9]
- The pilot owner can disable AI, pause enrollment, inspect redacted errors, and restore a backup to an isolated environment.

The founder owns launch-market and service-policy decisions. Engineering agents implement and test the chosen requirements; they cannot establish legal clearance or an unsupported monitoring service by adding a settings page.

## Sources

1. Federal Trade Commission. [Children's Online Privacy Protection Rule](https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa). Live rule and update index.
2. Federal Trade Commission. [FTC Finalizes Changes to Children's Privacy Rule](https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-finalizes-changes-childrens-privacy-rule-limiting-companies-ability-monetize-kids-data). 16 January 2025. Used for scope of amendments, not a claim about a launch-specific exemption.
3. Information Commissioner's Office. [Introduction to the Children's Code](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/introduction-to-the-childrens-code/). Living guidance.
4. US Department of Education. [Use of online tools and FERPA](https://studentprivacy.ed.gov/faq/i-want-use-online-tool-or-application-part-my-course-however-i-am-worried-it-violation-ferpa). Living guidance.
5. European Commission, AI Act Service Desk. [Education and vocational training](https://ai-act-service-desk.ec.europa.eu/en/education-and-vocational-training). Living classification examples; applicability requires review of intended use.
6. OpenAI. [Under-18 guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance). Living API guidance.
7. OpenAI. [Data controls in the OpenAI platform](https://developers.openai.com/api/docs/guides/your-data). Living API documentation.
8. OWASP Gen AI Security Project. [LLM01:2025 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/). 2025 risk entry.
9. W3C. [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/). Normative standard and current published version at access.
10. UAE Government. [Federal Decree-Law on Child Digital Safety: official overview](https://uaelegislation.gov.ae/en/news/uae-government-issues-a-federal-decree-law-on-child-digital-safety). 26 December 2025. Indexed official page; direct access restricted.
11. UAE Government. [Federal Decree-Law No. 45 of 2021 on Personal Data Protection](https://www.uaelegislation.gov.ae/en/legislations/1972/download). Indexed English law, especially Articles 22–23; full direct download restricted.
12. UAE Government. [Federal Decree-Law No. 26 of 2025 on Child Digital Safety](https://www.uaelegislation.gov.ae/en/legislations/3912/download). Issued 1 October 2025; indexed Articles 18–20 establish the timing described above. Full direct download restricted.
