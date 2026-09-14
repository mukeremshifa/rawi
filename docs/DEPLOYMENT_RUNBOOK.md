# Rawi v1 deployment and operations runbook

This is a deployable package, not authorization to launch publicly. Complete the
account, privacy, course-review and pilot-owner checks below before enrolling a
real learner.

## Zero-hosting-cost boundary

- Use Cloudflare Workers Free with Static Assets. Current official limits list
  100,000 Worker requests/day, 10 ms CPU/request, 20,000 static files and free
  static-asset requests. Do not enable the Workers Paid plan.
- Use one existing Supabase Free project. Current official limits include two
  active free projects, 500 MB database, 1 GB storage and 50,000 MAU. Do not add
  compute, IPv4, PITR, custom-domain or other paid add-ons.
- Supabase Free projects can pause after low activity. Check project availability
  before an arranged session; do not generate artificial traffic to avoid pausing.
- These are documentation-level resource checks. The founder must still inspect
  both account billing pages and record that the selected projects are on Free,
  with no billable add-ons, before the first deployment.

Official references: [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase), and
[Supabase project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).

## Prepare and verify

1. Copy `.dev.vars.example` to `.dev.vars` for local configured testing. Keep
   service keys and provider keys out of Git and the browser.
2. Set the operator name/contact, founder Supabase user ID, a real global monthly
   AI cap and a smaller per-learner cap. Missing provider key or caps disables paid
   calls. Keep `RAWI_UPLOADS_ENABLED=false` for the initial pilot.
3. Link the intended Free Supabase project, then preview and apply migrations:

   ```powershell
   npx supabase link --project-ref PROJECT_REF
   npx supabase db push --dry-run
   npx supabase db push
   ```

4. Configure Google OAuth in Supabase and allow only the exact Worker callback
   origin. Create the founder account, copy its Supabase UUID into
   `RAWI_FOUNDER_USER_IDS`, and use the founder enrollment API only after adult
   eligibility is confirmed.
5. Run `npm run verify`, then `npm run deploy:check`. Inspect bundle output and
   verify no answer key or secret is present.
6. Add server secrets interactively: `npx wrangler secret put SUPABASE_SERVICE_KEY`
   and, only after approving an AI ceiling, `npx wrangler secret put OPENAI_API_KEY`.
   Do not pass secret values on the command line.
7. After the release checklist is signed, run `npx wrangler deploy`. The current
   assignment does not authorize that final command.

## Backup and restore

Supabase recommends logical exports for Free projects. Before migrations and
weekly during the pilot, use the session-pooler connection string in a secret
PowerShell environment variable and create role/schema/data dumps:

```powershell
npx supabase db dump --db-url $env:RAWI_DATABASE_URL -f backup/roles.sql --role-only
npx supabase db dump --db-url $env:RAWI_DATABASE_URL -f backup/schema.sql
npx supabase db dump --db-url $env:RAWI_DATABASE_URL -f backup/data.sql --use-copy --data-only
```

Immediately encrypt the `backup` directory with the founder's approved local
encryption tool, store the encrypted copy off-device, then remove the plaintext
copy. A restore rehearsal must target a new non-production project and use
`psql --single-transaction --variable ON_ERROR_STOP=1`; verify session counts,
one owner-scoped resume and one export before calling the rehearsal successful.
See [Supabase backup/restore guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

## Rollback and outage behavior

- List versions with `npx wrangler versions list`; roll back with
  `npx wrangler rollback VERSION_ID`. Migrations are additive so the prior Worker
  continues to read session JSON.
- If Supabase is unavailable, configured mode fails closed and does not invent a
  local save. Tell learners the write was not confirmed.
- If the AI provider times out or the cap is reached, published course content and
  saved learning remain readable. Ambiguous calls retain their reservation.
- If the Workers Free request allowance is exhausted, the authenticated app must
  fail closed. Do not bypass authorization by serving a stale application shell.
- Stop new enrollment at 20 learners, at 80% of either AI cap, when repeated save
  failures occur, or while an unresolved privacy/content-severity issue is open.

## Support and retention

Publish the configured support contact and support hours before enrollment.
Review open issue reports once per pilot day and before each arranged session.
Export operational metrics with denominators; never include raw learner messages
in ordinary summaries. The default retention setting is 30 days. Process learner
export promptly; deletion is immediate and includes sessions, sources, issues,
usage records and enrollment. Do not claim legal approval—the operator/data-
controller and UAE transfer decisions remain external inputs.

## Upload limitation

Pasted text is implemented, deduplicated and owner-scoped behind
`RAWI_UPLOADS_ENABLED`. PDF ingestion returns `pdf_processing_unavailable`.
Reliable text-based PDF parsing would add a large CPU-intensive parser to a
10 ms Free Worker request budget; it is not safe to claim support until a measured
free-tier design and extraction-quality review exist. Scans, handwriting and OCR
remain out of scope.
