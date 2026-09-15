-- Rawi rebuild: concepts, authored content, sessions, and the evidence log.
--
-- ── The one table that must never be updated ────────────────────────────────
--
-- `attempts` is append-only. Not by convention — by a trigger that raises on
-- UPDATE and DELETE. Invariant 4 says a recorded attempt is immutable including
-- the review date anchored to it, and every analytic in the app reads from this
-- table. A rule enforced only in application code is a rule that holds until
-- someone writes a migration script, which is exactly when it matters most.

-- ─── concepts ────────────────────────────────────────────────────────────────
create table if not exists public.concepts (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 200),
  summary           text not null default '',
  -- The authored ConceptContent, validated by src/shared/content.ts before it
  -- is written. JSONB because the content model will change faster than the
  -- schema should, and because nothing queries inside it — the concept's
  -- queryable facts are the columns beside it.
  content           jsonb,
  prerequisite_ids  uuid[] not null default '{}',
  source_ids        uuid[] not null default '{}',

  -- ── Scheduling. Server-owned; see src/server/scheduling/fsrs.ts. ──────────
  fsrs_stability    double precision not null default 0,
  fsrs_difficulty   double precision not null default 0,
  fsrs_elapsed_days integer not null default 0,
  fsrs_scheduled_days integer not null default 0,
  fsrs_reps         integer not null default 0,
  fsrs_lapses       integer not null default 0,
  fsrs_state        text not null default 'new'
                      check (fsrs_state in ('new', 'learning', 'review', 'relearning')),
  last_review_at    timestamptz,
  -- The date a re-check is due. Written from the attempt that earned it and
  -- never recomputed on read (invariant 4).
  due_date          date,

  version           integer not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (workspace_id, name)
);

-- Deliberately absent from this table: any column that could hold a score, a
-- percentage, a mastery estimate or a model confidence. Evidence is derived
-- from `attempts` on read, and there is nowhere to cache a number that would
-- then have to be kept honest (invariant 6).

create trigger concepts_updated_at
  before update on public.concepts
  for each row execute function public.set_updated_at();

-- ─── learning_sessions ───────────────────────────────────────────────────────
-- The full server-side SessionState as JSONB, with `version` as the
-- optimistic-concurrency guard. The browser never sees this row; it sees the
-- projection the contract defines, and the omissions are the point.
create table if not exists public.learning_sessions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  concept_id    uuid not null references public.concepts(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  state         jsonb not null,
  version       integer not null default 1,
  ended_at      timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger learning_sessions_updated_at
  before update on public.learning_sessions
  for each row execute function public.set_updated_at();

-- ─── attempts ────────────────────────────────────────────────────────────────
create table if not exists public.attempts (
  id                     uuid primary key default gen_random_uuid(),
  session_id             uuid not null references public.learning_sessions(id) on delete cascade,
  concept_id             uuid not null references public.concepts(id) on delete cascade,
  workspace_id           uuid not null references public.workspaces(id) on delete cascade,
  user_id                uuid not null references auth.users(id) on delete cascade,
  item_id                text not null,
  family_id              text not null,
  purpose                text not null check (purpose in
                           ('entry','probe','clarification','practice','transfer','review')),
  stage                  text not null check (stage in
                           ('diagnose','teach','practice','check','review','summary')),
  correct                boolean not null,
  -- What was in force AT SUBMISSION, not what the learner did afterwards.
  assistance             text not null check (assistance in ('none','hinted','revealed')),
  -- Invariant 2, as a stored fact rather than a derived one: the log must say
  -- what was concluded at the time, even if the rule is later changed.
  counts_as_independent  boolean not null,
  used_ask               boolean not null default false,
  -- The learner's response, verbatim. What every evidence quote is checked
  -- against, so it cannot be normalised or trimmed on the way in.
  response_text          text not null,
  -- Anchored here, at the moment of the attempt.
  review_due             date,
  -- Makes a retried submission idempotent: replaying a key returns exactly the
  -- attempt originally recorded rather than appending a second one.
  idempotency_key        text not null,
  created_at             timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

comment on table public.attempts is
  'Append-only. Every analytic reads from here; nothing is estimated.';

-- The enforcement. Invariant 4 is a database rule, not a convention.
create or replace function public.reject_attempt_mutation()
returns trigger language plpgsql as $$
begin
  raise exception
    'attempts is append-only (invariant 4): a recorded attempt, including its review date, is immutable';
end;
$$;

create trigger attempts_immutable
  before update or delete on public.attempts
  for each row execute function public.reject_attempt_mutation();

alter table public.concepts enable row level security;
alter table public.learning_sessions enable row level security;
alter table public.attempts enable row level security;

create policy "learner reads own concepts"
  on public.concepts for select using (auth.uid() = user_id);
create policy "learner reads own sessions"
  on public.learning_sessions for select using (auth.uid() = user_id);
create policy "learner reads own attempts"
  on public.attempts for select using (auth.uid() = user_id);

create index if not exists concepts_workspace_idx
  on public.concepts (workspace_id, name);
create index if not exists concepts_due_idx
  on public.concepts (user_id, due_date) where due_date is not null;
create index if not exists learning_sessions_concept_idx
  on public.learning_sessions (user_id, concept_id, updated_at desc);
create index if not exists attempts_concept_idx
  on public.attempts (concept_id, created_at asc);
create index if not exists attempts_workspace_idx
  on public.attempts (workspace_id, created_at desc);
