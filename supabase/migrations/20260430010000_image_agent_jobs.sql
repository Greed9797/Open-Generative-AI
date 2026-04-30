create table if not exists image_agent_jobs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','running','done','failed')),
  prompt text not null,
  workflow text not null default 'general',
  target_model text not null,
  target_count int not null default 1 check (target_count between 1 and 30),
  aspect_ratio text default '1:1',
  reference_images jsonb not null default '[]',
  reference_briefing jsonb,
  outputs jsonb not null default '[]',
  qa_summary jsonb,
  log jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists image_agent_jobs_user_id_idx on image_agent_jobs(user_id);
create index if not exists image_agent_jobs_status_idx on image_agent_jobs(status);
create index if not exists image_agent_jobs_created_at_idx on image_agent_jobs(created_at desc);

alter table image_agent_jobs enable row level security;
drop policy if exists "image_agent_jobs_own" on image_agent_jobs;
create policy "image_agent_jobs_own" on image_agent_jobs for all using (auth.uid() = user_id);

create table if not exists image_prompt_learnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_model text not null,
  workflow text not null default 'general',
  prompt_text text not null,
  score numeric(4,2),
  problems text[] default '{}',
  output_url text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists image_prompt_learnings_user_model_idx on image_prompt_learnings(user_id, target_model);
create index if not exists image_prompt_learnings_score_idx on image_prompt_learnings(score desc);

alter table image_prompt_learnings enable row level security;
drop policy if exists "image_prompt_learnings_own" on image_prompt_learnings;
create policy "image_prompt_learnings_own" on image_prompt_learnings for all using (auth.uid() = user_id);

create table if not exists image_agent_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null,
  output_index int not null,
  rating text not null,
  notes text,
  output_url text,
  qa_score numeric(4,2),
  created_at timestamptz default now()
);

create index if not exists image_agent_feedback_user_id_idx on image_agent_feedback(user_id);
create index if not exists image_agent_feedback_job_id_idx on image_agent_feedback(job_id);

alter table image_agent_feedback enable row level security;
drop policy if exists "image_agent_feedback_own" on image_agent_feedback;
create policy "image_agent_feedback_own" on image_agent_feedback for all using (auth.uid() = user_id);
