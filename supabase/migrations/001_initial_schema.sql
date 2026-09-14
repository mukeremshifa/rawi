-- Rawi R03: initial schema
-- Run via: supabase db push  (or paste into the Supabase SQL editor)
--
-- Design notes:
--  - auth.users is managed by Supabase Auth; we reference it with a FK.
--  - invite_enrollments gates access to the learning app; only invited adult
--    (18+) learners who have an enrollment row can create sessions.
--  - sessions holds the full serialised SessionState JSON. The version column
--    is used as an optimistic-concurrency guard in UPDATE ... WHERE version = $n,
--    matching the contract already set up in learning.ts invariant 4 and
--    lesson-store.ts. When R04 moves to a real transactional store this column
--    is the WHERE-clause guard.
--  - All user-owned rows carry a user_id FK so that ownership checks can be
--    enforced in RLS and in application code.

-- ─── invite_enrollments ──────────────────────────────────────────────────────
-- One row per invited adult learner. The founder inserts rows manually.
-- enrollment_status tracks the lifecycle: invited → enrolled → suspended.
create table if not exists public.invite_enrollments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  enrolled_at   timestamptz not null default now(),
  -- Suspended learners cannot create new sessions but can still read their own.
  enrollment_status text not null default 'enrolled'
    check (enrollment_status in ('enrolled', 'suspended')),
  -- The founder assigns one lesson set per learner during the pilot.
  lesson_id     text,
  -- Free-text note for the founder; never shown to the learner.
  notes         text,
  constraint unique_user_enrollment unique (user_id)
);

comment on table public.invite_enrollments is
  'Invite-only enrollment gate. Only rows with enrollment_status=enrolled may create sessions.';

-- ─── sessions ────────────────────────────────────────────────────────────────
-- One row per learning session. The full SessionState is stored as JSONB so
-- that the schema does not need to change when SessionState fields change during
-- development. When the pilot grows we can promote hot fields to columns.
create table if not exists public.sessions (
  id            text primary key,           -- crypto.randomUUID() from the Worker
  user_id       uuid not null references auth.users(id) on delete cascade,
  lesson_id     text not null,
  state         jsonb not null,             -- full SessionState JSON
  version       integer not null default 1, -- optimistic-concurrency guard
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.sessions is
  'One row per learning session. version is the optimistic-concurrency guard.';

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger sessions_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

-- ─── Row-level security ───────────────────────────────────────────────────────
-- Learners can only read/write their own rows. The service-role key (used by
-- the Worker server) bypasses RLS, which is correct: the Worker enforces
-- ownership in application code before calling Supabase.
alter table public.invite_enrollments enable row level security;
alter table public.sessions enable row level security;

-- Learners can read their own enrollment status (so the app can show it).
create policy "learner reads own enrollment"
  on public.invite_enrollments for select
  using (auth.uid() = user_id);

-- Learners can read their own sessions.
create policy "learner reads own sessions"
  on public.sessions for select
  using (auth.uid() = user_id);

-- The service role (Worker) can do anything; RLS is not enforced for service role.
-- No additional policies needed for server-side writes.

-- ─── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists sessions_user_id_idx on public.sessions (user_id);
create index if not exists sessions_user_lesson_idx on public.sessions (user_id, lesson_id);
-- Support the "Continue" query: most recently updated session per user.
create index if not exists sessions_user_updated_idx on public.sessions (user_id, updated_at desc);
