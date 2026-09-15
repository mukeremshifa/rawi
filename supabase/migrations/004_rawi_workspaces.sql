-- Rawi rebuild: workspaces.
--
-- Migrations 001–003 are applied to the live project and are immutable. This
-- and 005–007 are additive.
--
-- Two patterns carried forward from 001, deliberately:
--
--  1. `user_id` on every owned row, with RLS on every table. Ownership is
--     enforced in BOTH places. The service-role key the Worker uses bypasses
--     RLS, which is correct — but it means the defence that actually runs in
--     production is the one in the handler, so RLS here is the second lock,
--     not the only one.
--
--  2. Optimistic concurrency through a `version` column and
--     `UPDATE … WHERE version = $n`. Two tabs are not hypothetical in a
--     learning app: the tab you left open yesterday will submit against a
--     session that has moved on, and that has to be a rejection rather than a
--     silent overwrite.

-- ─── workspaces ──────────────────────────────────────────────────────────────
-- A subject being learned. Every source, concept, session and attempt belongs
-- to exactly one and is always named explicitly; nothing defaults to "the
-- current workspace", because a defaulted scope is how an ownership bug goes
-- quiet.
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  -- One line the learner wrote about what they are trying to understand.
  intent      text check (intent is null or char_length(intent) <= 500),
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.workspaces is
  'A subject being learned. The only first-class scope in Rawi.';

create trigger workspaces_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

alter table public.workspaces enable row level security;

create policy "learner reads own workspaces"
  on public.workspaces for select
  using (auth.uid() = user_id);

create index if not exists workspaces_user_idx
  on public.workspaces (user_id, updated_at desc);
