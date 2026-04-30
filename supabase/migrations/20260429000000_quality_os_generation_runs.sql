create extension if not exists vector;

create table if not exists public.generation_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null unique,
  user_id uuid,
  tenant_id uuid,
  project_id uuid,
  requested_model text,
  provider_model text,
  effective_provider text,
  key_ref text,
  fallback_used boolean not null default false,
  fallback_reason text,
  prompt_hash text,
  original_prompt text,
  compiled_prompt text,
  raw_payload jsonb not null default '{}'::jsonb,
  seed integer,
  resolution text,
  duration_seconds integer,
  aspect_ratio text,
  status text not null default 'submitted',
  latency_ms integer,
  estimated_cost numeric,
  output_url text,
  audit jsonb not null default '{}'::jsonb,
  quality_score numeric,
  human_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generation_runs_user_created_idx
  on public.generation_runs (user_id, created_at desc);

create index if not exists generation_runs_prompt_hash_idx
  on public.generation_runs (prompt_hash);

create index if not exists generation_runs_audit_gin_idx
  on public.generation_runs using gin (audit);

create table if not exists public.generation_knowledge (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  project_id uuid,
  source_type text not null,
  title text,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(3072),
  approved boolean,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generation_knowledge_scope_idx
  on public.generation_knowledge (tenant_id, project_id, source_type);

create index if not exists generation_knowledge_content_fts_idx
  on public.generation_knowledge using gin (to_tsvector('simple', coalesce(title, '') || ' ' || content));

create index if not exists generation_knowledge_metadata_gin_idx
  on public.generation_knowledge using gin (metadata);

create index if not exists generation_knowledge_embedding_idx
  on public.generation_knowledge using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create table if not exists public.generation_benchmark_reviews (
  id uuid primary key default gen_random_uuid(),
  run_id text not null references public.generation_runs(run_id) on delete cascade,
  reviewer_id uuid,
  prompt_adherence integer check (prompt_adherence between 0 and 10),
  identity_continuity integer check (identity_continuity between 0 and 10),
  motion_quality integer check (motion_quality between 0 and 10),
  aesthetics integer check (aesthetics between 0 and 10),
  artifacts integer check (artifacts between 0 and 10),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.generation_runs enable row level security;
alter table public.generation_knowledge enable row level security;
alter table public.generation_benchmark_reviews enable row level security;

drop policy if exists "Users can read own generation runs" on public.generation_runs;
create policy "Users can read own generation runs"
  on public.generation_runs for select
  using (auth.uid() = user_id);

drop policy if exists "Users can read own benchmark reviews" on public.generation_benchmark_reviews;
create policy "Users can read own benchmark reviews"
  on public.generation_benchmark_reviews for select
  using (
    exists (
      select 1 from public.generation_runs r
      where r.run_id = generation_benchmark_reviews.run_id
        and r.user_id = auth.uid()
    )
  );
