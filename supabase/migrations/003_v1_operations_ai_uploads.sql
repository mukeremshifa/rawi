-- Rawi v1: bounded AI usage, private learner sources, issue reporting and
-- deletion/export support. Apply after 001 and 002.

alter table public.invite_enrollments
  add column if not exists adult_eligibility_confirmed boolean not null default false;

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  usage_month date not null,
  provider text not null,
  model text not null,
  prompt_version text not null,
  curriculum_version text not null,
  reserved_micros_usd bigint not null check (reserved_micros_usd >= 0),
  actual_micros_usd bigint check (actual_micros_usd >= 0),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  status text not null check (status in ('reserved', 'settled', 'ambiguous')),
  response_json jsonb,
  failure_category text,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (user_id, idempotency_key)
);

create table if not exists public.learner_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  kind text not null check (kind = 'pasted-text'),
  extracted_text text not null check (char_length(extracted_text) between 1 and 50000),
  sha256 text not null,
  permission_acknowledged boolean not null,
  status text not null default 'ready' check (status in ('ready', 'quarantined')),
  created_at timestamptz not null default now(),
  unique (user_id, sha256)
);

create table if not exists public.issue_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text references public.sessions(id) on delete set null,
  category text not null check (category in ('content', 'technical', 'privacy', 'other')),
  description text not null check (char_length(description) between 1 and 2000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);

alter table public.ai_usage enable row level security;
alter table public.learner_sources enable row level security;
alter table public.issue_reports enable row level security;

create policy "learner reads own usage" on public.ai_usage for select
  using (auth.uid() = user_id);
create policy "learner reads own sources" on public.learner_sources for select
  using (auth.uid() = user_id);
create policy "learner reads own issues" on public.issue_reports for select
  using (auth.uid() = user_id);

create index if not exists ai_usage_month_user_idx
  on public.ai_usage (usage_month, user_id);
create index if not exists learner_sources_user_idx
  on public.learner_sources (user_id, created_at desc);
create index if not exists issue_reports_user_idx
  on public.issue_reports (user_id, created_at desc);

create or replace function public.reserve_ai_usage(
  p_user_id uuid,
  p_idempotency_key text,
  p_provider text,
  p_model text,
  p_prompt_version text,
  p_curriculum_version text,
  p_reserved_micros_usd bigint,
  p_global_cap_micros_usd bigint,
  p_learner_cap_micros_usd bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month date := date_trunc('month', now() at time zone 'UTC')::date;
  v_existing public.ai_usage;
  v_global bigint;
  v_learner bigint;
  v_created public.ai_usage;
begin
  if p_reserved_micros_usd <= 0 or p_global_cap_micros_usd <= 0 or p_learner_cap_micros_usd <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'global_cap');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rawi-ai:' || v_month::text, 0));

  select * into v_existing from public.ai_usage
    where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.status = 'settled' and v_existing.response_json is not null then
      return jsonb_build_object('ok', true, 'replay', true, 'reservation', to_jsonb(v_existing));
    end if;
    return jsonb_build_object('ok', false, 'reason', 'in_progress');
  end if;

  select coalesce(sum(coalesce(actual_micros_usd, reserved_micros_usd)), 0)
    into v_global from public.ai_usage where usage_month = v_month;
  select coalesce(sum(coalesce(actual_micros_usd, reserved_micros_usd)), 0)
    into v_learner from public.ai_usage where usage_month = v_month and user_id = p_user_id;

  if v_global + p_reserved_micros_usd > p_global_cap_micros_usd then
    return jsonb_build_object('ok', false, 'reason', 'global_cap');
  end if;
  if v_learner + p_reserved_micros_usd > p_learner_cap_micros_usd then
    return jsonb_build_object('ok', false, 'reason', 'learner_cap');
  end if;

  insert into public.ai_usage (
    user_id, idempotency_key, usage_month, provider, model,
    prompt_version, curriculum_version, reserved_micros_usd, status
  ) values (
    p_user_id, p_idempotency_key, v_month, p_provider, p_model,
    p_prompt_version, p_curriculum_version, p_reserved_micros_usd, 'reserved'
  ) returning * into v_created;

  return jsonb_build_object('ok', true, 'replay', false, 'reservation', to_jsonb(v_created));
end;
$$;

create or replace function public.settle_ai_usage(
  p_user_id uuid,
  p_reservation_id uuid,
  p_status text,
  p_actual_micros_usd bigint default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_response_json jsonb default null,
  p_failure_category text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  if p_status not in ('settled', 'ambiguous') then
    raise exception 'invalid settlement status';
  end if;
  update public.ai_usage set
    status = p_status,
    actual_micros_usd = case when p_status = 'settled' then p_actual_micros_usd else null end,
    input_tokens = p_input_tokens,
    output_tokens = p_output_tokens,
    response_json = p_response_json,
    failure_category = p_failure_category,
    settled_at = now()
  where id = p_reservation_id and user_id = p_user_id and status = 'reserved';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

create or replace function public.delete_learner_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sessions integer;
  v_sources integer;
  v_issues integer;
  v_usage integer;
begin
  delete from public.issue_reports where user_id = p_user_id;
  get diagnostics v_issues = row_count;
  delete from public.learner_sources where user_id = p_user_id;
  get diagnostics v_sources = row_count;
  delete from public.ai_usage where user_id = p_user_id;
  get diagnostics v_usage = row_count;
  delete from public.sessions where user_id = p_user_id;
  get diagnostics v_sessions = row_count;
  delete from public.invite_enrollments where user_id = p_user_id;
  return jsonb_build_object(
    'sessions', v_sessions, 'sources', v_sources,
    'issues', v_issues, 'usage', v_usage
  );
end;
$$;

create or replace function public.apply_retention(
  p_retention_days integer,
  p_delete boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cutoff timestamptz;
  v_sessions integer;
  v_sources integer;
  v_issues integer;
  v_usage integer;
begin
  if p_retention_days < 1 or p_retention_days > 365 then
    raise exception 'invalid retention period';
  end if;
  v_cutoff := now() - make_interval(days => p_retention_days);
  select count(*) into v_sessions from public.sessions where updated_at < v_cutoff;
  select count(*) into v_sources from public.learner_sources where created_at < v_cutoff;
  select count(*) into v_issues from public.issue_reports where created_at < v_cutoff;
  select count(*) into v_usage from public.ai_usage where created_at < v_cutoff;
  if p_delete then
    delete from public.issue_reports where created_at < v_cutoff;
    delete from public.learner_sources where created_at < v_cutoff;
    delete from public.ai_usage where created_at < v_cutoff;
    delete from public.sessions where updated_at < v_cutoff;
  end if;
  return jsonb_build_object(
    'cutoff', v_cutoff, 'deleted', p_delete,
    'sessions', v_sessions, 'sources', v_sources,
    'issues', v_issues, 'usage', v_usage
  );
end;
$$;

revoke all on function public.reserve_ai_usage(uuid, text, text, text, text, text, bigint, bigint, bigint)
  from public, anon, authenticated;
revoke all on function public.settle_ai_usage(uuid, uuid, text, bigint, integer, integer, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.delete_learner_data(uuid)
  from public, anon, authenticated;
revoke all on function public.apply_retention(integer, boolean)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, text, text, text, text, text, bigint, bigint, bigint)
  to service_role;
grant execute on function public.settle_ai_usage(uuid, uuid, text, bigint, integer, integer, jsonb, text)
  to service_role;
grant execute on function public.delete_learner_data(uuid)
  to service_role;
grant execute on function public.apply_retention(integer, boolean)
  to service_role;
