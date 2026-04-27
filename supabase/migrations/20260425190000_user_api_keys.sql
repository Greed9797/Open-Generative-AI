create extension if not exists pgcrypto with schema extensions;

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

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_api_keys_updated_at on public.user_api_keys;
create trigger user_api_keys_updated_at
before update on public.user_api_keys
for each row execute function public.set_updated_at();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

alter table public.user_api_keys enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "users_own_keys" on public.user_api_keys;
create policy "users_own_keys" on public.user_api_keys
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "no_direct_key_read" on public.user_api_keys;
create policy "no_direct_key_read" on public.user_api_keys
  as restrictive for select
  using (auth.uid() = user_id);

drop policy if exists "users_own_profile" on public.profiles;
create policy "users_own_profile" on public.profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on public.user_api_keys from anon, authenticated;
grant select (id, user_id, provider_name, model_identifier, roles, is_custom, is_active, created_at, updated_at)
  on public.user_api_keys to authenticated;
grant update (roles, is_active, model_identifier, updated_at)
  on public.user_api_keys to authenticated;
grant delete on public.user_api_keys to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;

create or replace function public.insert_api_key(
  p_provider_name text,
  p_raw_key text,
  p_model_identifier text,
  p_roles text[],
  p_is_custom boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  insert into public.user_api_keys (user_id, provider_name, encrypted_key, model_identifier, roles, is_custom)
  values (auth.uid(), p_provider_name, public.encrypt_secret(p_raw_key), p_model_identifier, p_roles, p_is_custom)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.get_encryption_setting(setting_name text, vault_name text)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_value text;
begin
  v_value := current_setting(setting_name, true);
  if v_value is not null
     and v_value <> ''
     and v_value not like 'PLACEHOLDER%'
     and v_value <> 'PLACEHOLDER_REPLACE_IN_VAULT' then
    return v_value;
  end if;

  select decrypted_secret into v_value
  from vault.decrypted_secrets
  where name = vault_name
  limit 1;

  if v_value is null or v_value = '' then
    raise exception 'Missing encryption setting: % or Vault secret: %', setting_name, vault_name;
  end if;

  return v_value;
end;
$$;

create or replace function public.encrypt_secret(raw_value text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
begin
  return extensions.armor(
    extensions.pgp_sym_encrypt(
      raw_value,
      public.get_encryption_setting('app.encryption_key', 'APP_ENCRYPTION_KEY')
    )
  );
end;
$$;

create or replace function public.decrypt_secret(encrypted_value text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
begin
  return extensions.pgp_sym_decrypt(
    extensions.dearmor(encrypted_value),
    public.get_encryption_setting('app.encryption_key', 'APP_ENCRYPTION_KEY')
  );
end;
$$;

create or replace function public.get_decrypted_key(p_key_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_api_keys;
begin
  select * into v_row from public.user_api_keys
  where id = p_key_id and user_id = auth.uid();

  if not found then
    raise exception 'Key not found';
  end if;

  return public.decrypt_secret(v_row.encrypted_key);
end;
$$;

create or replace function public.get_decrypted_key_for_user(p_key_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_api_keys;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden';
  end if;

  select * into v_row from public.user_api_keys
  where id = p_key_id and user_id = p_user_id;

  if not found then
    raise exception 'Key not found';
  end if;

  return public.decrypt_secret(v_row.encrypted_key);
end;
$$;

revoke all on function public.insert_api_key(text, text, text, text[], boolean) from public;
revoke all on function public.insert_api_key(text, text, text, text[], boolean) from anon;
grant execute on function public.insert_api_key(text, text, text, text[], boolean) to authenticated;

revoke all on function public.get_encryption_setting(text, text) from public, anon, authenticated;
revoke all on function public.encrypt_secret(text) from public, anon, authenticated;
revoke all on function public.decrypt_secret(text) from public, anon, authenticated;

revoke all on function public.get_decrypted_key(uuid) from public;
revoke all on function public.get_decrypted_key(uuid) from anon, authenticated;
grant execute on function public.get_decrypted_key(uuid) to service_role;

revoke all on function public.get_decrypted_key_for_user(uuid, uuid) from public;
revoke all on function public.get_decrypted_key_for_user(uuid, uuid) from anon, authenticated;
grant execute on function public.get_decrypted_key_for_user(uuid, uuid) to service_role;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'uploads',
  'uploads',
  true,
  524288000,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','application/octet-stream']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

drop policy if exists "users_read_avatars" on storage.objects;
create policy "users_read_avatars" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "users_upload_own_avatars" on storage.objects;
create policy "users_upload_own_avatars" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "users_update_own_avatars" on storage.objects;
create policy "users_update_own_avatars" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
