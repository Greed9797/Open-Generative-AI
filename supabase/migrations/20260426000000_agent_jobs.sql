create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.agent_jobs (
  id text primary key,
  status text not null default 'pending',
  base_image_url text,
  rough_prompt text,
  target_model text,
  style text,
  segments jsonb not null default '[]',
  orchestrator_plan text,
  final_video_url text,
  log jsonb not null default '[]',
  user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only service_role reads/writes. No user-level RLS needed.
alter table public.agent_jobs enable row level security;

drop trigger if exists agent_jobs_updated_at on public.agent_jobs;
create trigger agent_jobs_updated_at
  before update on public.agent_jobs
  for each row execute function public.set_updated_at();

-- Index for user job listing
create index if not exists agent_jobs_user_id_created_at
  on public.agent_jobs (user_id, created_at desc);

-- Index for status filtering (deduplication check)
create index if not exists agent_jobs_status
  on public.agent_jobs (status)
  where status in ('pending', 'running');
