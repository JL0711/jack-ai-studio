-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 002 · Admin approval replaces email confirmation
--
--  For the LIVE project, which already ran the original schema.sql:
--  Supabase Dashboard → SQL Editor → New query → paste this whole file → Run.
--  It is safe to run more than once and keeps every existing row. A fresh
--  install does not need it: schema.sql already contains the same changes.
--
--  What it changes
--    • profiles gets approval_status ('pending' | 'approved' | 'rejected'),
--      approved_at and approved_by. Every new sign-up starts as 'pending'.
--    • Existing admin and family rows become 'approved' (only the first time
--      the column is added, so a re-run never re-approves anyone). Existing
--      client rows start as 'pending'; approve them on the 用户 / Users page.
--    • A pending or rejected user can read only their own profile row.
--      Every client and family read/write path also requires approval.
--      A user with role 'admin' always counts as approved.
--    • Only an admin (or this SQL editor) can change approval_status,
--      approved_at or approved_by. Enforced by the profile trigger.
--    • Changing a login email puts an approved non-admin account back to
--      'pending', because projects are matched to clients by email.
--    • profiles joins the supabase_realtime publication so the admin page sees
--      new sign-ups live. Realtime applies RLS, so non-admins only ever
--      receive their own row.
--
--  After it has run, turn off Authentication → Sign In / Providers → Email →
--  "Confirm email". The whole file runs in one transaction: if anything fails,
--  nothing is changed.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Columns
-- ───────────────────────────────────────────────────────────────────────────

alter table public.profiles add column if not exists approved_at timestamptz;
alter table public.profiles add column if not exists approved_by uuid;

-- approval_status is added together with its one-time backfill, so running
-- this again never overrides a later decision (e.g. a family member Jack has
-- since set back to pending).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'approval_status'
  ) then
    alter table public.profiles
      add column approval_status text not null default 'pending'
      constraint profiles_approval_status_check
      check (approval_status in ('pending', 'approved', 'rejected'));

    update public.profiles
       set approval_status = 'approved', approved_at = now()
     where role in ('admin', 'family');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_approval_status_check'
  ) then
    alter table public.profiles add constraint profiles_approval_status_check
      check (approval_status in ('pending', 'approved', 'rejected'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_approved_by_fkey'
  ) then
    alter table public.profiles add constraint profiles_approved_by_fkey
      foreign key (approved_by) references public.profiles (id) on delete set null;
  end if;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 2. Helper: is the caller allowed past the approval gate?
-- ───────────────────────────────────────────────────────────────────────────

-- Admin always counts as approved, whatever approval_status says, so Jack can
-- never lock himself out.
create or replace function public.is_approved()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and (role = 'admin' or approval_status = 'approved')
  );
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 3. Triggers
-- ───────────────────────────────────────────────────────────────────────────

-- New users: role client, approval pending.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, display_name, role, approval_status)
  values (
    new.id,
    lower(new.email),
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 60), ''),
    'client',                                 -- never trust a role from sign-up metadata
    'pending'                                 -- every new account waits for Jack's approval
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Email change: keep profiles.email in sync and, because projects are matched
-- by email, send an approved non-admin account back to 'pending'. (With
-- "Confirm email" off, Supabase applies an email change immediately.)
-- Rejected stays rejected; a change of letter case only keeps the status.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles
     set email = lower(new.email),
         approval_status = case
           when role = 'admin' then approval_status
           when approval_status = 'rejected' then 'rejected'
           when lower(coalesce(old.email, '')) = lower(coalesce(new.email, '')) then approval_status
           else 'pending'
         end
   where id = new.id;
  return new;
end;
$$;

-- Only an admin may change a role or the approval fields (or email/id).
-- Enforced here, not just in a policy, so it holds even if a policy is
-- loosened later. SECURITY INVOKER on purpose: current_user is then the
-- caller's database role. API users run as 'anon'/'authenticated'; the SQL
-- editor runs as 'postgres', so the commented commands at the end of
-- schema.sql still work there.
-- For allowed changes, approved_at/approved_by are stamped here from now()
-- and auth.uid(), so they cannot be forged.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.role := 'client';
      new.approval_status := 'pending';
      new.approved_at := null;
      new.approved_by := null;
      return new;
    end if;

    if new.role is distinct from old.role then
      raise exception 'only an admin can change roles' using errcode = '42501';
    end if;
    if new.approval_status is distinct from old.approval_status
       or new.approved_at is distinct from old.approved_at
       or new.approved_by is distinct from old.approved_by then
      raise exception 'only an admin can change approval status' using errcode = '42501';
    end if;
    if new.email is distinct from old.email or new.id is distinct from old.id then
      raise exception 'email and id are managed by Supabase Auth' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.approval_status is distinct from old.approval_status then
    if new.approval_status = 'approved' then
      new.approved_at := now();
      new.approved_by := auth.uid();         -- null when run from the SQL editor
    else
      new.approved_at := null;
      new.approved_by := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields
  before insert or update on public.profiles
  for each row execute function public.protect_profile_fields();


-- ───────────────────────────────────────────────────────────────────────────
-- 4. approve_milestone: only approved clients
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.approve_milestone(milestone_id uuid)
returns public.milestones
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  m public.milestones;
  p public.projects;
  me text := public.current_email();
begin
  if auth.uid() is null or me = '' then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not public.is_approved() then
    raise exception 'your account has not been approved yet' using errcode = '42501';
  end if;

  select * into m from public.milestones where id = milestone_id for update;
  if not found then
    raise exception 'milestone not found' using errcode = 'P0002';
  end if;

  select * into p from public.projects where id = m.project_id;
  if p.client_email is null or lower(p.client_email) <> me then
    raise exception 'only this project''s client can approve it' using errcode = '42501';
  end if;
  if p.archived then
    raise exception 'project is archived' using errcode = '42501';
  end if;
  if m.status <> 'pending_approval' then
    raise exception 'milestone is not awaiting approval' using errcode = '22023';
  end if;

  update public.milestones
     set status = 'done', approved_by = auth.uid(), approved_at = now()
   where id = m.id
  returning * into m;
  return m;
end;
$$;

revoke all on function public.approve_milestone(uuid) from public, anon;
grant execute on function public.approve_milestone(uuid) to authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- 5. Row Level Security: every non-admin path also requires is_approved()
--    (profiles_select is unchanged: everyone reads their own row, admin all.)
-- ───────────────────────────────────────────────────────────────────────────

drop policy if exists "projects_family_read" on public.projects;
create policy "projects_family_read" on public.projects
  for select to authenticated
  using ((select public.is_approved()) and (select public.is_family()));

drop policy if exists "projects_client_read" on public.projects;
create policy "projects_client_read" on public.projects
  for select to authenticated
  using (
    (select public.is_approved())
    and client_email is not null
    and lower(client_email) = lower((select auth.jwt()) ->> 'email')
  );

drop policy if exists "milestones_read" on public.milestones;
create policy "milestones_read" on public.milestones
  for select to authenticated
  using (
    (select public.is_approved())
    and ((select public.is_family()) or public.is_project_client(project_id))
  );

drop policy if exists "updates_read" on public.updates;
create policy "updates_read" on public.updates
  for select to authenticated
  using (
    (select public.is_approved())
    and (
      (select public.is_family())
      or (visibility = 'client' and public.is_project_client(project_id))
    )
  );

drop policy if exists "comments_read" on public.comments;
create policy "comments_read" on public.comments
  for select to authenticated
  using (
    (select public.is_approved())
    and ((select public.is_family()) or public.is_project_client(project_id))
  );

drop policy if exists "comments_client_insert" on public.comments;
create policy "comments_client_insert" on public.comments
  for insert to authenticated
  with check (
    (select public.is_approved())
    and author = (select auth.uid())
    and public.is_project_client(project_id)
  );


-- ───────────────────────────────────────────────────────────────────────────
-- 6. Realtime: let the admin page see new sign-ups live
-- ───────────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
     ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;

commit;
