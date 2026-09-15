-- Rawi rebuild: jobs, the ask log, and the AI ledger retargeted to Vertex.

-- ─── jobs ────────────────────────────────────────────────────────────────────
-- Source ingestion and concept extraction are stepped work. Each Worker
-- invocation advances ONE bounded step and returns; the client polls.
--
-- No Queues and no Durable Objects. Both add cost or operational surface, and
-- what this workload actually needs is a row with a cursor in it — which
-- Postgres already is. The cost of the polling approach is a little client
-- chatter; the cost of the alternative is a second runtime to reason about.
create table if not exists public.jobs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('ingest-source', 'extract-concepts')),
  status        text not null default 'queued'
                  check (status in ('queued', 'running', 'succeeded', 'failed')),
  -- A human sentence ("Reading your source"), not a step number.
  stage         text not null default 'Queued',
  units_done    integer not null default 0 check (units_done >= 0),
  -- NULL until the total is genuinely known. GeneratingState draws a breathing
  -- bar for NULL and a filled one for a number, because "no progress yet" and
  -- "0% done" are different promises.
  units_total   integer check (units_total is null or units_total >= 0),
  -- Where the next step resumes: a character offset into the source text, or
  -- an index into the concept list. Owned by the job's runner.
  cursor        jsonb not null default '{}'::jsonb,
  -- What the job is about: the source id, or nothing for extraction.
  subject_id    uuid,
  error_code    text,
  error_message text,
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger jobs_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- ─── ask_log ─────────────────────────────────────────────────────────────────
-- Every grounded question, with what it was answered from.
--
-- `session_id` being non-null is what makes an Ask *support*: the session's
-- active item has already had its assistance raised, and this row is the
-- record of why. Invariant 2 depends on being able to show that later.
create table if not exists public.ask_log (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  session_id    uuid references public.learning_sessions(id) on delete set null,
  item_id       text,
  question      text not null,
  answer        text not null,
  citations     jsonb not null default '[]'::jsonb,
  grounded      boolean not null,
  created_at    timestamptz not null default now()
);

-- ─── the AI ledger, retargeted ───────────────────────────────────────────────
-- 003 created `ai_usage` against OpenAI. The columns are provider-agnostic; the
-- CHECK on `provider` was not, so this widens it rather than creating a second
-- ledger — one place to read total spend is worth more than a clean namespace.
alter table public.ai_usage
  add column if not exists location text;

comment on column public.ai_usage.location is
  'Vertex location, so a regional price difference is attributable after the fact.';

-- The reserve function from 003 already takes provider and model as arguments
-- and does the cap check and the insert in one atomic statement, which is the
-- property that matters: two Workers reserving concurrently against the same
-- cap is not hypothetical. It is reused unchanged.

alter table public.jobs enable row level security;
alter table public.ask_log enable row level security;

create policy "learner reads own jobs"
  on public.jobs for select using (auth.uid() = user_id);
create policy "learner reads own asks"
  on public.ask_log for select using (auth.uid() = user_id);

create index if not exists jobs_workspace_idx
  on public.jobs (workspace_id, created_at desc);
create index if not exists jobs_pending_idx
  on public.jobs (user_id, status) where status in ('queued', 'running');
create index if not exists ask_log_workspace_idx
  on public.ask_log (workspace_id, created_at desc);

-- ─── Storage ─────────────────────────────────────────────────────────────────
-- The private `sources` bucket is created in the dashboard (docs/OPERATIONS.md
-- step 2) because bucket creation is not part of `supabase db push`. These
-- policies scope it once it exists: a learner may only touch objects under
-- their own id, and the Worker (service role) bypasses them.
--
-- Wrapped in a DO block so `supabase db push` does not fail on a project where
-- the bucket has not been created yet — the policies are additive and will be
-- created by a later push.
do $$
begin
  if exists (select 1 from storage.buckets where id = 'sources') then
    execute $policy$
      create policy "learner reads own source objects"
        on storage.objects for select
        using (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text);
    $policy$;
  end if;
exception
  when duplicate_object then null;
  when insufficient_privilege then null;
end
$$;
