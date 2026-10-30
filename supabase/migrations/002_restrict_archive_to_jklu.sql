-- Lock the archive to verified university identities. The app UI also checks this
-- domain, but this migration is the enforcement point for direct Supabase requests.

create or replace function public.is_authorized_jklu_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as u
    where u.id = (select auth.uid())
      and u.email_confirmed_at is not null
      and lower(split_part(u.email, '@', 2)) = 'jklu.edu.in'
  );
$$;

revoke all on function public.is_authorized_jklu_user() from public;
grant execute on function public.is_authorized_jklu_user() to authenticated;

create or replace function public.enforce_jklu_email_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or lower(new.email) !~ '^[^[:space:]@]+@jklu\.edu\.in$' then
    raise exception 'Only @jklu.edu.in accounts may sign in to the resource archive.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_jklu_email_domain on auth.users;
create trigger enforce_jklu_email_domain
  before insert or update of email on auth.users
  for each row execute function public.enforce_jklu_email_domain();

-- Existing broad SELECT policies made published records public to anon callers.
drop policy if exists "published nodes visible to everyone" on public.library_nodes;
drop policy if exists "published resource metadata visible" on public.resources;

create policy "verified JKLU users read published nodes" on public.library_nodes
  for select to authenticated
  using (public.is_authorized_jklu_user() and status = 'published' and deleted_at is null);

create policy "verified JKLU users read published resources" on public.resources
  for select to authenticated
  using (public.is_authorized_jklu_user() and exists (
    select 1 from public.library_nodes n
    where n.id = node_id and n.status = 'published' and n.deleted_at is null
  ));

-- Restrictive policies apply in addition to all existing role policies, so a
-- manually-issued anon/authenticated token cannot bypass the account-domain rule.
create policy "require verified JKLU identity" on public.profiles
  as restrictive for all to authenticated
  using (public.is_authorized_jklu_user())
  with check (public.is_authorized_jklu_user());
create policy "require verified JKLU identity" on public.user_roles
  as restrictive for all to authenticated
  using (public.is_authorized_jklu_user())
  with check (public.is_authorized_jklu_user());
create policy "require verified JKLU identity" on public.permission_rules
  as restrictive for all to authenticated
  using (public.is_authorized_jklu_user())
  with check (public.is_authorized_jklu_user());
create policy "require verified JKLU identity" on public.library_nodes
  as restrictive for all to authenticated
  using (public.is_authorized_jklu_user())
  with check (public.is_authorized_jklu_user());
create policy "require verified JKLU identity" on public.resources
  as restrictive for all to authenticated
  using (public.is_authorized_jklu_user())
  with check (public.is_authorized_jklu_user());
create policy "require verified JKLU identity" on public.review_submissions
  as restrictive for all to authenticated
  using (public.is_authorized_jklu_user())
  with check (public.is_authorized_jklu_user());
create policy "require verified JKLU identity" on public.audit_log
  as restrictive for all to authenticated
  using (public.is_authorized_jklu_user())
  with check (public.is_authorized_jklu_user());
create policy "require verified JKLU identity" on public.import_jobs
  as restrictive for all to authenticated
  using (public.is_authorized_jklu_user())
  with check (public.is_authorized_jklu_user());

-- The source repository must be private and files must be delivered by the
-- authenticated Edge Function. Keep the service-side GitHub token out of Vite.
