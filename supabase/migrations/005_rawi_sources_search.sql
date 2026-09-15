-- Rawi rebuild: sources, chunks, and full-text retrieval.
--
-- ── Why tsvector and not pgvector ───────────────────────────────────────────
--
-- Embeddings would double the AI cost surface and make a source unsearchable
-- until a model call succeeds, for a corpus that is one learner's own course
-- material — small, and lexically very close to the questions asked of it.
-- `websearch_to_tsquery` + `ts_rank_cd` needs no extension beyond what Supabase
-- ships and no spend at all.
--
-- The application talks to this through a `Retriever` interface, so swapping in
-- pgvector later is a new implementation rather than a rewrite of every caller.

-- ─── sources ─────────────────────────────────────────────────────────────────
create table if not exists public.sources (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  -- Denormalised from the workspace so RLS and ownership checks do not need a
  -- join on the hot path. It is redundant, and that is the point: the check
  -- that runs most often should be the cheapest one to read.
  user_id          uuid not null references auth.users(id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 160),
  kind             text not null check (kind in ('pasted', 'upload')),
  status           text not null default 'ingesting'
                     check (status in ('ingesting', 'ready', 'failed')),
  -- The extracted plain text. v1 accepts .txt and .md only; extraction is a
  -- plain-text read, no PDF and no OCR.
  extracted_text   text not null default '',
  character_count  integer not null default 0 check (character_count >= 0),
  -- NULL while ingesting, not 0. "We have not counted yet" and "it has no
  -- content" are different facts and only one of them is alarming.
  chunk_count      integer check (chunk_count is null or chunk_count >= 0),
  -- Storage path in the private `sources` bucket, for uploads.
  storage_path     text,
  sha256           text not null,
  created_at       timestamptz not null default now(),
  -- The same file twice in one workspace is a mistake, not an intention.
  unique (workspace_id, sha256)
);

comment on table public.sources is
  'Learner-supplied material. Everything the tutor says is grounded in these.';

-- ─── source_chunks ───────────────────────────────────────────────────────────
-- One retrievable passage. The unit a citation points at, which is why
-- `ordinal` is stable: a citation that survives re-ingestion has to name
-- something that does not move.
create table if not exists public.source_chunks (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid not null references public.sources(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  ordinal       integer not null check (ordinal >= 0),
  text          text not null,
  -- Generated rather than trigger-maintained: a generated column cannot drift
  -- from its source text, and a trigger can be forgotten on a bulk insert.
  search        tsvector generated always as (to_tsvector('english', text)) stored,
  unique (source_id, ordinal)
);

comment on column public.source_chunks.search is
  'Generated, so it cannot drift from the text it indexes.';

alter table public.sources enable row level security;
alter table public.source_chunks enable row level security;

create policy "learner reads own sources"
  on public.sources for select
  using (auth.uid() = user_id);

create policy "learner reads own chunks"
  on public.source_chunks for select
  using (auth.uid() = user_id);

create index if not exists sources_workspace_idx
  on public.sources (workspace_id, created_at desc);

-- The retrieval index. Scoped queries filter on (user_id, workspace_id) FIRST
-- and then rank, so ownership is a WHERE clause rather than a post-filter.
create index if not exists source_chunks_search_idx
  on public.source_chunks using gin (search);

create index if not exists source_chunks_scope_idx
  on public.source_chunks (user_id, workspace_id);

-- ─── retrieval ───────────────────────────────────────────────────────────────
-- Scoping is inside the function, not left to the caller. A retrieval helper
-- that trusts its caller to add the ownership predicate is one refactor away
-- from leaking one learner's notes into another learner's answer.
create or replace function public.search_chunks(
  p_user_id uuid,
  p_workspace_id uuid,
  p_query text,
  p_limit integer default 6
)
returns table (
  id uuid,
  source_id uuid,
  source_title text,
  ordinal integer,
  text text,
  score real
)
language sql
stable
as $$
  select
    c.id,
    c.source_id,
    s.title as source_title,
    c.ordinal,
    c.text,
    ts_rank_cd(c.search, websearch_to_tsquery('english', p_query)) as score
  from public.source_chunks c
  join public.sources s on s.id = c.source_id
  where c.user_id = p_user_id
    and c.workspace_id = p_workspace_id
    and s.status = 'ready'
    and c.search @@ websearch_to_tsquery('english', p_query)
  order by score desc, c.ordinal asc
  limit greatest(1, least(p_limit, 20));
$$;
