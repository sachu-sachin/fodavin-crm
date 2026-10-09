-- Fodavin Business OS — Supabase-specific setup
-- Run this AFTER Prisma has created the public tables, and again after every
-- schema change (it is idempotent, and section 3 locks down new tables).
--   npm run db:setup   (or paste into the Supabase SQL Editor)
--
-- Prisma owns the tables/columns/enums. This file adds the things Prisma
-- doesn't model: the auth.users link + signup trigger, updated_at
-- maintenance, and the lock that keeps Supabase's Data API out of app data.

-- ---------------------------------------------------------------------------
-- 1. Sync profiles with auth.users via triggers.
-- We intentionally do NOT add a cross-schema FK (profiles.id -> auth.users):
-- Prisma's `db push` introspection cannot represent cross-schema references.
-- Triggers give us the same behaviour (create on signup, delete on removal)
-- while staying invisible to Prisma.
-- ---------------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_id_fkey;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url, role_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.email,
    new.raw_user_meta_data ->> 'avatar_url',
    nullif(new.raw_user_meta_data ->> 'role_id', '')::uuid
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Remove the profile when its auth user is deleted.
create or replace function public.handle_user_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.profiles where id = old.id;
  return old;
end;
$$;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.handle_user_delete();

-- ---------------------------------------------------------------------------
-- 2. updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['companies', 'contacts', 'inquiries', 'projects', 'tasks', 'social_posts', 'payment_milestones', 'documents', 'time_entries']
  loop
    execute format('drop trigger if exists %I_updated_at on public.%I', t, t);
    execute format(
      'create trigger %I_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Keep Supabase's Data API (PostgREST / GraphQL) out of app data.
--
-- The app never touches table data through the Data API: every query goes
-- through Prisma as the `postgres` role (which bypasses RLS) and is
-- authorised in server code against the role permissions in
-- src/lib/permissions.ts. The Data API, however, answers anyone holding the
-- public anon key — plus, once signed in, the employee's own access token,
-- which the browser can read. Any policy or grant to `anon`/`authenticated`
-- here is therefore a way around the role permissions (e.g. a developer
-- reading payment_milestones straight from /rest/v1).
--
-- Rule: RLS on, no policies, no grants. The loop covers every table in
-- `public`, so tables added later are locked as soon as this file is re-run,
-- and the default-privilege change stops them being exposed in the meantime.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

-- Remove the permissive policies earlier versions of this file created.
drop policy if exists "roles readable by team" on public.roles;
drop policy if exists "admins manage roles" on public.roles;
drop policy if exists "profiles readable by team" on public.profiles;
drop policy if exists "admins insert profiles" on public.profiles;
drop policy if exists "admins update profiles" on public.profiles;
drop policy if exists "admins delete profiles" on public.profiles;

do $$
declare t text;
begin
  foreach t in array array['companies', 'contacts', 'inquiries', 'projects', 'tasks', 'social_posts', 'payment_milestones', 'documents', 'time_entries']
  loop
    execute format('drop policy if exists "team full access" on public.%I', t);
  end loop;
end $$;

-- Only those policies used it.
drop function if exists public.is_admin();

-- ---------------------------------------------------------------------------
-- 4. Storage: private `documents` bucket for uploaded files.
-- The app uploads with the service-role key and serves files exclusively
-- through short-lived signed URLs (/api/documents/[id]), so the bucket must
-- stay private and, as with table data, carries no policies for the
-- anon/authenticated keys.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 10485760)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;

drop policy if exists "team reads documents" on storage.objects;
drop policy if exists "team writes documents" on storage.objects;
drop policy if exists "team updates documents" on storage.objects;
drop policy if exists "team deletes documents" on storage.objects;
