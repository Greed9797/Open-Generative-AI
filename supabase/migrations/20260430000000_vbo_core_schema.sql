create extension if not exists "pgsodium";
create extension if not exists "pg_cron";
create extension if not exists "uuid-ossp";

create or replace function public.encrypt_secret(raw_value text)
returns text language plpgsql security definer set search_path = public as $$
begin
  return encode(pgsodium.crypto_secretbox(
    convert_to(raw_value,'utf8'),
    decode(current_setting('app.encryption_nonce'),'hex'),
    decode(current_setting('app.encryption_key'),'hex')
  ),'hex');
end;$$;

create or replace function public.decrypt_secret(encrypted_value text)
returns text language plpgsql security definer set search_path = public as $$
begin
  return convert_from(pgsodium.crypto_secretbox_open(
    decode(encrypted_value,'hex'),
    decode(current_setting('app.encryption_nonce'),'hex'),
    decode(current_setting('app.encryption_key'),'hex')
  ),'utf8');
end;$$;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(user_id, display_name)
  values(new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict (user_id) do nothing;
  return new;
end;$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
drop policy if exists "profiles_own" on public.profiles;
create policy "profiles_own" on public.profiles for all using (auth.uid() = user_id);

create table if not exists public.user_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_name text not null,
  encrypted_key text not null,
  model_identifier text,
  roles text[] not null default '{}',
  is_custom boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists user_api_keys_user_id_idx on public.user_api_keys(user_id);
create index if not exists user_api_keys_roles_idx on public.user_api_keys using gin(roles);
alter table public.user_api_keys enable row level security;
drop policy if exists "api_keys_own" on public.user_api_keys;
create policy "api_keys_own" on public.user_api_keys for all using (auth.uid() = user_id);

create or replace function public.get_decrypted_api_key(p_key_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_row public.user_api_keys;
begin
  select * into v_row from public.user_api_keys
  where id = p_key_id and user_id = auth.uid() and is_active = true;
  if not found then raise exception 'Key not found or inactive'; end if;
  return public.decrypt_secret(v_row.encrypted_key);
end;$$;

create or replace function public.resolve_key_by_role(p_role text)
returns table(id uuid, provider_name text, decrypted_key text, model_identifier text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  select k.id, k.provider_name, public.decrypt_secret(k.encrypted_key), k.model_identifier
  from public.user_api_keys k
  where k.user_id = auth.uid() and k.is_active = true and p_role = any(k.roles)
  order by k.created_at desc limit 1;
end;$$;

create table if not exists public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','running','done','failed')),
  base_image_url text not null,
  rough_prompt text,
  target_model text not null,
  style text,
  orchestrator_plan jsonb,
  segments jsonb not null default '[]',
  cinematography_plan jsonb,
  vision_briefing jsonb,
  preprocessing_results jsonb default '[]',
  postprocessing_results jsonb default '[]',
  final_video_url text,
  log jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists agent_jobs_user_id_idx on public.agent_jobs(user_id);
create index if not exists agent_jobs_status_idx on public.agent_jobs(status);
alter table public.agent_jobs enable row level security;
drop policy if exists "agent_jobs_own" on public.agent_jobs;
create policy "agent_jobs_own" on public.agent_jobs for all using (auth.uid() = user_id);

create table if not exists public.generation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  studio_type text not null check (studio_type in ('image','video','lipsync','cinema','agent')),
  model_id text not null,
  prompt text,
  input_urls text[] default '{}',
  output_url text,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  metadata jsonb default '{}',
  created_at timestamptz default now()
);
create index if not exists generation_history_user_id_idx on public.generation_history(user_id);
create index if not exists generation_history_created_at_idx on public.generation_history(created_at desc);
alter table public.generation_history enable row level security;
drop policy if exists "history_own" on public.generation_history;
create policy "history_own" on public.generation_history for all using (auth.uid() = user_id);

create table if not exists public.video_compositions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled',
  html_content text,
  clips jsonb not null default '[]',
  settings jsonb not null default '{"width":1920,"height":1080,"fps":30}',
  render_url text,
  render_status text default 'draft' check (render_status in ('draft','rendering','done','failed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.video_compositions enable row level security;
drop policy if exists "compositions_own" on public.video_compositions;
create policy "compositions_own" on public.video_compositions for all using (auth.uid() = user_id);

create table if not exists public.user_loras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  trigger_word text not null,
  description text,
  training_images_count int default 0,
  status text not null default 'pending' check (status in ('pending','training','ready','failed')),
  provider text not null default 'replicate',
  provider_training_id text,
  lora_url text,
  base_model text not null default 'flux-dev',
  cost_usd numeric(6,4),
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.user_loras enable row level security;
drop policy if exists "loras_own" on public.user_loras;
create policy "loras_own" on public.user_loras for all using (auth.uid() = user_id);

create table if not exists public.lora_training_images (
  id uuid primary key default gen_random_uuid(),
  lora_id uuid not null references public.user_loras(id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  created_at timestamptz default now()
);
alter table public.lora_training_images enable row level security;
drop policy if exists "lora_images_own" on public.lora_training_images;
create policy "lora_images_own" on public.lora_training_images for all
  using (exists (select 1 from public.user_loras l where l.id = lora_id and l.user_id = auth.uid()));

create table if not exists public.anchor_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lora_id uuid references public.user_loras(id),
  prompt text not null,
  image_url text not null,
  provider text not null,
  cost_usd numeric(6,4),
  created_at timestamptz default now()
);
alter table public.anchor_images enable row level security;
drop policy if exists "anchors_own" on public.anchor_images;
create policy "anchors_own" on public.anchor_images for all using (auth.uid() = user_id);

create table if not exists public.prompt_learnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_model text not null,
  prompt_text text not null,
  score_avg numeric(4,2),
  attempts_count int default 1,
  problems text[] default '{}',
  created_at timestamptz default now()
);
alter table public.prompt_learnings enable row level security;
drop policy if exists "learnings_own" on public.prompt_learnings;
create policy "learnings_own" on public.prompt_learnings for all using (auth.uid() = user_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;$$;

drop trigger if exists t_profiles_updated_at on public.profiles;
create trigger t_profiles_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists t_user_api_keys_updated_at on public.user_api_keys;
create trigger t_user_api_keys_updated_at before update on public.user_api_keys for each row execute function public.touch_updated_at();
drop trigger if exists t_agent_jobs_updated_at on public.agent_jobs;
create trigger t_agent_jobs_updated_at before update on public.agent_jobs for each row execute function public.touch_updated_at();
drop trigger if exists t_video_compositions_updated_at on public.video_compositions;
create trigger t_video_compositions_updated_at before update on public.video_compositions for each row execute function public.touch_updated_at();
drop trigger if exists t_user_loras_updated_at on public.user_loras;
create trigger t_user_loras_updated_at before update on public.user_loras for each row execute function public.touch_updated_at();

select cron.schedule('cleanup-old-jobs','0 3 * * *',$$
  delete from public.agent_jobs where created_at < now() - interval '30 days' and status in ('done','failed');
  delete from public.generation_history where created_at < now() - interval '90 days';
$$)
where not exists (select 1 from cron.job where jobname = 'cleanup-old-jobs');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif']),
  ('agent-uploads', 'agent-uploads', false, 20971520, array['image/jpeg','image/png','image/webp','image/gif']),
  ('renders', 'renders', false, 524288000, array['video/mp4']),
  ('lora-training-images', 'lora-training-images', false, 52428800, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects for select using (bucket_id='avatars');
drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write" on storage.objects for insert with check (bucket_id='avatars' and auth.uid()::text=(storage.foldername(name))[1]);
drop policy if exists "uploads_owner_all" on storage.objects;
create policy "uploads_owner_all" on storage.objects for all using (bucket_id='agent-uploads' and auth.uid()::text=(storage.foldername(name))[1]);
drop policy if exists "renders_owner_all" on storage.objects;
create policy "renders_owner_all" on storage.objects for all using (bucket_id='renders' and auth.uid()::text=(storage.foldername(name))[1]);
drop policy if exists "lora_images_owner_all" on storage.objects;
create policy "lora_images_owner_all" on storage.objects for all using (bucket_id='lora-training-images' and auth.uid()::text=(storage.foldername(name))[1]);
