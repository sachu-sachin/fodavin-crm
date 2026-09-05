-- Fodavin Business OS — Supabase-specific setup
-- Run this ONCE, AFTER `prisma migrate deploy` has created the public tables.
--   npm run db:setup   (or paste into the Supabase SQL Editor)
--
-- Prisma owns the tables/columns/enums. This file adds the things Prisma
-- doesn't model: the auth.users link + signup trigger, the is_admin() helper,
-- Row Level Security (protects the public anon key at the PostgREST layer),
-- and updated_at maintenance.

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
-- 2. Admin check (used by RLS). SECURITY DEFINER avoids RLS recursion.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = auth.uid() and r.is_admin
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. updated_at maintenance
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
-- 4. Row Level Security
-- App data access goes through Prisma (postgres role, bypasses RLS). These
-- policies protect the *public anon/authenticated keys* exposed via PostgREST.
-- ---------------------------------------------------------------------------
alter table public.roles      enable row level security;
alter table public.profiles   enable row level security;
alter table public.companies  enable row level security;
alter table public.contacts   enable row level security;
alter table public.inquiries    enable row level security;
alter table public.projects     enable row level security;
alter table public.tasks        enable row level security;
alter table public.social_posts enable row level security;
alter table public.payment_milestones enable row level security;
alter table public.documents  enable row level security;
alter table public.time_entries enable row level security;

-- Roles: readable by team; managed by admins.
drop policy if exists "roles readable by team" on public.roles;
create policy "roles readable by team" on public.roles
  for select to authenticated using (true);
drop policy if exists "admins manage roles" on public.roles;
create policy "admins manage roles" on public.roles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Profiles: team directory readable; only admins mutate.
drop policy if exists "profiles readable by team" on public.profiles;
create policy "profiles readable by team" on public.profiles
  for select to authenticated using (true);
drop policy if exists "admins insert profiles" on public.profiles;
create policy "admins insert profiles" on public.profiles
  for insert to authenticated with check (public.is_admin());
drop policy if exists "admins update profiles" on public.profiles;
create policy "admins update profiles" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins delete profiles" on public.profiles;
create policy "admins delete profiles" on public.profiles
  for delete to authenticated using (public.is_admin());

-- Work data: full CRUD for any authenticated employee.
do $$
declare t text;
begin
  foreach t in array array['companies', 'contacts', 'inquiries', 'projects', 'tasks', 'social_posts', 'payment_milestones', 'documents', 'time_entries']
  loop
    execute format('drop policy if exists "team full access" on public.%I', t);
    execute format(
      'create policy "team full access" on public.%I
         for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Storage: private `documents` bucket for uploaded files.
-- The app uploads with the service-role key and serves files exclusively
-- through short-lived signed URLs (/api/documents/[id]), so the bucket must
-- stay private. These policies are the safety net for the anon/authenticated
-- keys, matching the "any signed-in employee" model used for table data.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 10485760)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;

drop policy if exists "team reads documents" on storage.objects;
create policy "team reads documents" on storage.objects
  for select to authenticated using (bucket_id = 'documents');

drop policy if exists "team writes documents" on storage.objects;
create policy "team writes documents" on storage.objects
  for insert to authenticated with check (bucket_id = 'documents');

drop policy if exists "team updates documents" on storage.objects;
create policy "team updates documents" on storage.objects
  for update to authenticated using (bucket_id = 'documents');

drop policy if exists "team deletes documents" on storage.objects;
create policy "team deletes documents" on storage.objects
  for delete to authenticated using (bucket_id = 'documents');
