-- Rawi R03 follow-up: atomically preserve learner-wide check exposure when a
-- new session is created. Two concurrent starts for the same learner/lesson
-- serialize on a transaction-scoped advisory lock, so they cannot both claim
-- the same authored item as fresh.

create or replace function public.create_learning_session(
  p_id text,
  p_user_id uuid,
  p_lesson_id text,
  p_state jsonb,
  p_check_item_ids text[]
)
returns setof public.sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inherited_exposure text[];
  selected_item text;
  active_item text;
begin
  if coalesce(array_length(p_check_item_ids, 1), 0) = 0 then
    raise exception 'at least one check item is required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_lesson_id, 0)
  );

  select coalesce(array_agg(candidate.item_id order by candidate.ordinality), '{}')
    into inherited_exposure
  from unnest(p_check_item_ids) with ordinality as candidate(item_id, ordinality)
  where exists (
    select 1
    from public.sessions existing
    cross join lateral jsonb_array_elements_text(
      coalesce(existing.state -> 'exposedCheckIds', '[]'::jsonb)
    ) as exposed(item_id)
    where existing.user_id = p_user_id
      and existing.lesson_id = p_lesson_id
      and exposed.item_id = candidate.item_id
  );

  select candidate.item_id
    into selected_item
  from unnest(p_check_item_ids) with ordinality as candidate(item_id, ordinality)
  where not (candidate.item_id = any(inherited_exposure))
  order by candidate.ordinality
  limit 1;

  active_item := coalesce(selected_item, p_check_item_ids[1]);
  p_state := jsonb_set(p_state, '{activeCheckId}', to_jsonb(active_item));
  p_state := jsonb_set(
    p_state,
    '{exposedCheckIds}',
    to_jsonb(
      case
        when selected_item is null then inherited_exposure
        else array_append(inherited_exposure, selected_item)
      end
    )
  );
  p_state := jsonb_set(
    p_state,
    '{questions}',
    (p_state -> 'questions') || jsonb_build_object(
      active_item,
      jsonb_build_object(
        'questionId', active_item,
        'assistance', case when selected_item is null then 'revealed' else 'none' end,
        'hintsUsed', 0,
        'submitted', false
      )
    )
  );

  return query
    insert into public.sessions (id, user_id, lesson_id, state, version)
    values (p_id, p_user_id, p_lesson_id, p_state, (p_state ->> 'version')::integer)
    returning *;
end;
$$;

revoke all on function public.create_learning_session(text, uuid, text, jsonb, text[])
  from public, anon, authenticated;
grant execute on function public.create_learning_session(text, uuid, text, jsonb, text[])
  to service_role;

comment on function public.create_learning_session(text, uuid, text, jsonb, text[]) is
  'Creates one session while atomically claiming the learner lesson next unexposed authored check item.';
