-- JKLU Resource Archive starter schema.
-- Review before production. Run in Supabase SQL Editor or via Supabase CLI.
create extension if not exists pgcrypto;

create type public.app_role as enum ('owner', 'admin', 'sub_admin', 'contributor', 'student');
create type public.publication_status as enum ('draft', 'pending_review', 'published', 'rejected', 'archived');
create type public.node_kind as enum ('semester', 'subject', 'folder', 'resource');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'student',
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.permission_rules (
  id uuid primary key default gen_random_uuid(),
  role public.app_role not null,
  permission text not null,
  scope_node_id uuid,
  allowed boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(role, permission, scope_node_id)
);

create table public.library_nodes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.library_nodes(id) on delete cascade,
  kind public.node_kind not null,
  name text not null,
  slug text not null,
  description text,
  sort_order integer not null default 0,
  status public.publication_status not null default 'published',
  source_path text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(parent_id, slug)
);

alter table public.permission_rules
  add constraint permission_rules_scope_fk
  foreign key (scope_node_id) references public.library_nodes(id) on delete cascade;

create table public.resources (
  node_id uuid primary key references public.library_nodes(id) on delete cascade,
  original_filename text not null,
  mime_type text,
  size_bytes bigint,
  storage_bucket text,
  storage_path text,
  source_url text,
  checksum text,
  metadata jsonb not null default '{}'::jsonb
);

create table public.review_submissions (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.library_nodes(id) on delete cascade,
  submitted_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  status public.publication_status not null default 'pending_review',
  reviewer_note text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  started_by uuid references auth.users(id),
  source_owner text not null,
  source_repo text not null,
  source_branch text not null default 'main',
  status text not null default 'queued',
  scanned_count integer not null default 0,
  imported_count integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index library_nodes_parent_idx on public.library_nodes(parent_id, sort_order);
create index library_nodes_status_idx on public.library_nodes(status);
create index audit_log_created_idx on public.audit_log(created_at desc);
create index review_submissions_status_idx on public.review_submissions(status, submitted_at desc);

-- Security-definer helpers avoid recursive RLS lookups.
create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer
set search_path = public
as $$
  select coalesce((select role from public.user_roles where user_id = auth.uid()), 'student'::public.app_role);
$$;

create or replace function public.has_role(roles public.app_role[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.current_app_role() = any(roles);
$$;

create or replace function public.can_manage_library()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.has_role(array['owner','admin','sub_admin']::public.app_role[]);
$$;

create or replace function public.can_contribute()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.has_role(array['owner','admin','sub_admin','contributor']::public.app_role[]);
$$;

-- Create profile + default student role on auth signup. Never grant owner from email or client input.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, display_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  insert into public.user_roles(user_id, role) values (new.id, 'student')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.permission_rules enable row level security;
alter table public.library_nodes enable row level security;
alter table public.resources enable row level security;
alter table public.review_submissions enable row level security;
alter table public.audit_log enable row level security;
alter table public.import_jobs enable row level security;

create policy "profiles read own or managers" on public.profiles for select to authenticated
using (id = auth.uid() or public.has_role(array['owner','admin']::public.app_role[]));
create policy "profiles update own" on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

create policy "users read own role; owner/admin can view roles" on public.user_roles for select to authenticated
using (user_id = auth.uid() or public.has_role(array['owner','admin']::public.app_role[]));
-- Intentionally no client INSERT/UPDATE/DELETE policy on user_roles. Role grants require a trusted
-- server-side function/service role or carefully audited owner-only RPC.

create policy "published nodes visible to everyone" on public.library_nodes for select
using (status = 'published' and deleted_at is null);
create policy "staff can read all nodes" on public.library_nodes for select to authenticated
using (public.can_contribute());
create policy "managers insert nodes" on public.library_nodes for insert to authenticated
with check (public.can_manage_library() and created_by = auth.uid() and status in ('draft','published'));
create policy "contributors create drafts" on public.library_nodes for insert to authenticated
with check (public.has_role(array['contributor']::public.app_role[]) and created_by = auth.uid() and status in ('draft','pending_review'));
create policy "managers update nodes" on public.library_nodes for update to authenticated
using (public.can_manage_library()) with check (public.can_manage_library());
create policy "contributors update own unpublished nodes" on public.library_nodes for update to authenticated
using (public.has_role(array['contributor']::public.app_role[]) and created_by = auth.uid() and status in ('draft','rejected'))
with check (public.has_role(array['contributor']::public.app_role[]) and created_by = auth.uid() and status in ('draft','pending_review'));
create policy "owner/admin soft or hard delete nodes" on public.library_nodes for delete to authenticated
using (public.has_role(array['owner','admin']::public.app_role[]));

create policy "published resource metadata visible" on public.resources for select
using (exists(select 1 from public.library_nodes n where n.id = node_id and n.status = 'published' and n.deleted_at is null));
create policy "staff read resource metadata" on public.resources for select to authenticated
using (public.can_contribute());
create policy "managers add resource metadata" on public.resources for insert to authenticated
with check (public.can_manage_library());
create policy "contributors add metadata for own drafts" on public.resources for insert to authenticated
with check (public.has_role(array['contributor']::public.app_role[]) and exists(select 1 from public.library_nodes n where n.id = node_id and n.created_by = auth.uid() and n.status in ('draft','pending_review')));
create policy "managers update resource metadata" on public.resources for update to authenticated
using (public.can_manage_library()) with check (public.can_manage_library());
create policy "managers delete resource metadata" on public.resources for delete to authenticated
using (public.can_manage_library());

create policy "submitter or reviewers read submissions" on public.review_submissions for select to authenticated
using (submitted_by = auth.uid() or public.can_manage_library());
create policy "contributors submit own review items" on public.review_submissions for insert to authenticated
with check (submitted_by = auth.uid() and public.has_role(array['contributor']::public.app_role[]) and status = 'pending_review');
create policy "reviewers update submissions" on public.review_submissions for update to authenticated
using (public.can_manage_library()) with check (public.can_manage_library());

create policy "audit visible to owner and admins" on public.audit_log for select to authenticated
using (public.has_role(array['owner','admin']::public.app_role[]));
-- No direct client inserts to audit_log. Use trusted server-side functions for tamper-resistant records.

create policy "managers read import jobs" on public.import_jobs for select to authenticated
using (public.can_manage_library());
create policy "managers create import jobs" on public.import_jobs for insert to authenticated
with check (public.can_manage_library() and started_by = auth.uid());
create policy "managers update import jobs" on public.import_jobs for update to authenticated
using (public.can_manage_library()) with check (public.can_manage_library());

-- Storage setup:
-- Create a PRIVATE bucket named `archive-files` in Supabase Storage.
-- Add storage policies only after deciding whether downloads are authenticated-only or public.
-- Do not expose the service-role key in Vite/client code. Implement uploads, signed URLs,
-- role grants, review/publish actions and audit writes via trusted Edge Functions/RPCs.
--
-- Owner bootstrap:
-- 1. Sign in once using configured Google OAuth.
-- 2. Copy the verified auth.users UUID from Supabase dashboard.
-- 3. Run this statement manually in SQL editor as project owner, replacing UUID:
--    insert into public.user_roles(user_id, role) values ('YOUR-VERIFIED-USER-UUID', 'owner')
--    on conflict (user_id) do update set role = 'owner';
-- Never expose a client-side control that can grant itself the owner role.
