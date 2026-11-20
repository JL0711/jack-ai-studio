-- ⚠ TEST FIXTURE ONLY. NEVER RUN THIS ON SUPABASE.
--
-- A verbatim copy of supabase/schema.sql as it was before admin approval
-- (the version already applied to the live project). test_rls.py loads it to
-- prove that migrations/002_admin_approval.sql upgrades a live database with
-- existing rows correctly. Running it on a real project would put the old,
-- un-gated policies back and undo migration 002.
--
-- ═══════════════════════════════════════════════════════════════════════════
--  Jack AI Studio · Supabase schema
--
--  How to use: Supabase Dashboard → SQL Editor → New query → paste this whole
--  file → Run. It is safe to run again (IF NOT EXISTS / CREATE OR REPLACE /
--  DROP ... IF EXISTS), but it will not change columns of tables that already
--  exist.
--
--  Roles (profiles.role):
--    client  default for every new sign-up; sees only projects whose
--            client_email equals their login email
--    family  read-only overview of everything, including internal updates,
--            but never contact messages or client email addresses
--    admin   Jack; can do everything
--
--  Milestone status codes → labels shown on the site:
--    not_started = 未开始, in_progress = 进行中,
--    pending_approval = 待验收, done = 已完成
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text check (display_name is null or char_length(display_name) <= 60),
  role         text not null default 'client' check (role in ('client', 'family', 'admin')),
  created_at   timestamptz not null default now()
);

create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(btrim(title)) between 1 and 120),
  summary      text not null default '' check (char_length(summary) <= 2000),
  status       text not null default 'planning'
               check (status in ('planning', 'in_progress', 'paused', 'done')),
  progress     integer not null default 0 check (progress between 0 and 100),
  stage        text not null default '' check (char_length(stage) <= 120),
  client_email text check (client_email is null or char_length(client_email) <= 254),
  archived     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists projects_client_email_idx on public.projects (lower(client_email));

create table if not exists public.milestones (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  title        text not null check (char_length(btrim(title)) between 1 and 160),
  due_date     date,
  status       text not null default 'not_started'
               check (status in ('not_started', 'in_progress', 'pending_approval', 'done')),
  payment_note text check (payment_note is null or char_length(payment_note) <= 60),
  sort         integer not null default 0,
  approved_by  uuid references public.profiles (id) on delete set null,
  approved_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists milestones_project_idx on public.milestones (project_id);

create table if not exists public.updates (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 4000),
  visibility  text not null default 'client' check (visibility in ('client', 'internal')),
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists updates_project_idx on public.updates (project_id, created_at desc);

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  author      uuid default auth.uid() references public.profiles (id) on delete set null,
  author_name text,
  body        text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index if not exists comments_project_idx on public.comments (project_id, created_at);

create table if not exists public.contact_messages (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  contact      text not null check (char_length(btrim(contact)) between 3 and 120),
  project_type text not null check (project_type in ('web', 'rag', 'local_ai', 'automation', 'other')),
  budget       text check (budget is null or budget in ('under_500', '500_2000', '2000_5000', 'over_5000', 'unsure')),
  message      text not null check (char_length(btrim(message)) between 10 and 4000),
  handled      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists contact_messages_created_idx on public.contact_messages (created_at desc);


-- ───────────────────────────────────────────────────────────────────────────
-- 2. Helper functions
--    SECURITY DEFINER so they can read profiles/projects without being
--    blocked by (or recursing into) RLS. search_path is pinned so nobody can
--    hijack them with look-alike objects.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_family()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'family');
$$;

-- Lower-cased email from the caller's JWT ('' when signed out).
create or replace function public.current_email()
returns text
language sql stable
set search_path = public, pg_temp
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- True when the caller is the linked client of the project.
create or replace function public.is_project_client(p_project_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id
      and p.client_email is not null
      and public.current_email() <> ''
      and lower(p.client_email) = public.current_email()
  );
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 3. Triggers
-- ───────────────────────────────────────────────────────────────────────────

-- 3a. Create a profile (role = client) for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    lower(new.email),
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 60), ''),
    'client'                                  -- never trust a role from sign-up metadata
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in sync when a user changes their login email.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- 3b. Only an admin may change a role (or email/id). Enforced by a trigger,
--     not just a policy, so it holds even if a policy is loosened later.
--     SECURITY INVOKER on purpose: current_user is then the caller's database
--     role. API users run as 'anon'/'authenticated'; the SQL editor runs as
--     'postgres', so "make me admin" below still works there.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('anon', 'authenticated') or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := 'client';
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'only an admin can change roles' using errcode = '42501';
  end if;
  if new.email is distinct from old.email or new.id is distinct from old.id then
    raise exception 'email and id are managed by Supabase Auth' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields
  before insert or update on public.profiles
  for each row execute function public.protect_profile_fields();

-- 3c. projects.updated_at
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

-- Bump the parent project's updated_at when its milestones or updates change
-- (also wakes realtime listeners on the projects table).
create or replace function public.touch_parent_project()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  update public.projects
     set updated_at = now()
   where id = coalesce(new.project_id, old.project_id);
  return null;
end;
$$;

drop trigger if exists milestones_touch_project on public.milestones;
create trigger milestones_touch_project
  after insert or update or delete on public.milestones
  for each row execute function public.touch_parent_project();

drop trigger if exists updates_touch_project on public.updates;
create trigger updates_touch_project
  after insert or update or delete on public.updates
  for each row execute function public.touch_parent_project();

-- 3d. Re-opening a finished milestone clears its old approval.
create or replace function public.milestone_clear_approval()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status = 'done' and new.status <> 'done' then
    new.approved_by := null;
    new.approved_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists milestones_clear_approval on public.milestones;
create trigger milestones_clear_approval
  before update on public.milestones
  for each row execute function public.milestone_clear_approval();

-- 3e. Comments: the author is always the caller, and author_name is filled in
--     from their profile, so the page never needs to read other profiles
--     (family cannot read profiles, and must not see client emails).
create or replace function public.set_comment_author()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  prof public.profiles;
begin
  if auth.uid() is not null then
    new.author := auth.uid();
  end if;
  select * into prof from public.profiles where id = new.author;
  new.author_name := coalesce(
    nullif(btrim(prof.display_name), ''),
    case when prof.role = 'admin' then 'Jack' else 'Client' end
  );
  return new;
end;
$$;

drop trigger if exists comments_set_author on public.comments;
create trigger comments_set_author
  before insert on public.comments
  for each row execute function public.set_comment_author();

-- Updates: created_by is always the caller.
create or replace function public.set_update_author()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists updates_set_author on public.updates;
create trigger updates_set_author
  before insert on public.updates
  for each row execute function public.set_update_author();


-- ───────────────────────────────────────────────────────────────────────────
-- 4. RPC functions
-- ───────────────────────────────────────────────────────────────────────────

-- 4a. A client approves (确认验收) one of their own milestones that is 待验收.
--     Done as a narrow SECURITY DEFINER function instead of an UPDATE policy,
--     so a client can change exactly these three fields and nothing else.
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

-- 4b. Admin-only full project list, including client_email (see section 6).
create or replace function public.admin_projects()
returns setof public.projects
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query select * from public.projects;
end;
$$;

revoke all on function public.approve_milestone(uuid) from public, anon;
grant execute on function public.approve_milestone(uuid) to authenticated;
revoke all on function public.admin_projects() from public, anon;
grant execute on function public.admin_projects() to authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- 5. Row Level Security
--    (select fn()) wrappers let Postgres evaluate the helper once per query.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.profiles         enable row level security;
alter table public.projects         enable row level security;
alter table public.milestones       enable row level security;
alter table public.updates          enable row level security;
alter table public.comments         enable row level security;
alter table public.contact_messages enable row level security;

-- profiles: you read your own row; admin reads all. You may update your own
-- display_name; the trigger above blocks role/email changes by non-admins.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

-- projects
drop policy if exists "projects_admin_all" on public.projects;
create policy "projects_admin_all" on public.projects
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "projects_family_read" on public.projects;
create policy "projects_family_read" on public.projects
  for select to authenticated
  using ((select public.is_family()));

drop policy if exists "projects_client_read" on public.projects;
create policy "projects_client_read" on public.projects
  for select to authenticated
  using (
    client_email is not null
    and lower(client_email) = lower((select auth.jwt()) ->> 'email')
  );

-- milestones
drop policy if exists "milestones_admin_all" on public.milestones;
create policy "milestones_admin_all" on public.milestones
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "milestones_read" on public.milestones;
create policy "milestones_read" on public.milestones
  for select to authenticated
  using ((select public.is_family()) or public.is_project_client(project_id));

-- updates: clients only see visibility = 'client'
drop policy if exists "updates_admin_all" on public.updates;
create policy "updates_admin_all" on public.updates
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "updates_read" on public.updates;
create policy "updates_read" on public.updates
  for select to authenticated
  using (
    (select public.is_family())
    or (visibility = 'client' and public.is_project_client(project_id))
  );

-- comments: clients read and write on their own projects; family reads all
drop policy if exists "comments_admin_all" on public.comments;
create policy "comments_admin_all" on public.comments
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "comments_read" on public.comments;
create policy "comments_read" on public.comments
  for select to authenticated
  using ((select public.is_family()) or public.is_project_client(project_id));

drop policy if exists "comments_client_insert" on public.comments;
create policy "comments_client_insert" on public.comments
  for insert to authenticated
  with check (author = (select auth.uid()) and public.is_project_client(project_id));

-- contact_messages: anyone may send one (with limits); only admin reads.
drop policy if exists "contact_insert" on public.contact_messages;
create policy "contact_insert" on public.contact_messages
  for insert to anon, authenticated
  with check (
    handled = false
    and char_length(btrim(name)) between 1 and 80
    and char_length(btrim(contact)) between 3 and 120
    and char_length(btrim(message)) between 10 and 4000
    and (budget is null or char_length(budget) <= 20)
  );

drop policy if exists "contact_admin_all" on public.contact_messages;
create policy "contact_admin_all" on public.contact_messages
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));


-- ───────────────────────────────────────────────────────────────────────────
-- 6. Table / column privileges
--
--  Hiding projects.client_email from family (and everyone else):
--  RLS filters ROWS, not columns, so a policy cannot hide one column from the
--  family role while showing her the rest of the row. Instead we use a
--  column-level grant: the API role `authenticated` may SELECT every projects
--  column EXCEPT client_email. Any query that touches client_email
--  (including select=*) fails with "permission denied". RLS still decides
--  which rows each user sees. Admin reads client_email only through the
--  admin_projects() function above, which checks is_admin() first.
--  The client policy can still compare client_email, because column
--  privileges apply to the columns a query reads, not to policy expressions.
--
--  ⚠ If you add a column to projects later, also run:
--     grant select (new_column) on public.projects to authenticated;
-- ───────────────────────────────────────────────────────────────────────────

-- Signed-out visitors (anon) get nothing except inserting contact messages.
revoke all on public.profiles, public.projects, public.milestones,
              public.updates, public.comments, public.contact_messages from anon;
grant insert on public.contact_messages to anon;

grant select, update on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated;

revoke select on public.projects from authenticated;
grant select (id, title, summary, status, progress, stage, archived, created_at, updated_at)
  on public.projects to authenticated;
grant insert, update, delete on public.projects to authenticated;

grant select, insert, update, delete on public.milestones, public.updates,
      public.comments, public.contact_messages to authenticated;

-- TRUNCATE ignores RLS, so nobody on the API side gets it.
revoke truncate, references, trigger on public.profiles, public.projects, public.milestones,
       public.updates, public.comments, public.contact_messages from authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- 7. Realtime (live refresh of progress, updates and comments)
--    Realtime applies the same RLS: each user only receives rows they can read.
-- ───────────────────────────────────────────────────────────────────────────

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['projects', 'milestones', 'updates', 'comments', 'contact_messages'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 8. Make me admin / make family
--    First sign up on the site and confirm the email, then run ONE of these
--    lines here in the SQL editor with the real email address filled in.
-- ───────────────────────────────────────────────────────────────────────────

-- make me admin:
-- update public.profiles set role = 'admin' where email = lower('...');

-- make family:
-- update public.profiles set role = 'family' where email = lower('...');

-- check who has which role:
-- select email, role, created_at from public.profiles order by created_at;
