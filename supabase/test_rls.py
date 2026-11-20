#!/usr/bin/env python3
"""
Runs schema.sql and migrations/002_admin_approval.sql against a real local
Postgres and checks the RLS rules.

Setup (once):
    python3 -m venv .venv-rls
    .venv-rls/bin/pip install pgserver "psycopg[binary]"
Run:
    .venv-rls/bin/python supabase/test_rls.py
Or against your own throwaway Postgres (NOT your Supabase project):
    .venv-rls/bin/python supabase/test_rls.py --dsn postgresql://postgres@localhost/test
Negative control (deliberately weakens one rule; the run must then FAIL):
    .venv-rls/bin/python supabase/test_rls.py --weaken client-read
    .venv-rls/bin/python supabase/test_rls.py --weaken approval-guard

`pgserver` ships a Postgres binary, so nothing needs to be installed system-wide.
It has wheels for Python 3.9-3.12 only, so make the venv with one of those.

Scenarios, each in its own new database:
  fresh    test/supabase_stub.sql + schema.sql twice + the migration twice,
           then the full rule suite
  upgrade  stub + test/schema_before_approval.sql (what the live project ran)
           + the migration twice, then the same full rule suite
  live     stub + the old schema + existing rows (admin, family, clients,
           project data), then the migration: backfill, rows kept, decisions
           survive a re-run, the new schema.sql can still be re-run
The fresh and upgraded databases must also end up with identical columns,
constraints, policies, functions, triggers, grants and publication.
"""
from __future__ import annotations

import argparse
import json
import sys
import tempfile
import uuid
from pathlib import Path

import psycopg

HERE = Path(__file__).resolve().parent
SCHEMA = HERE / "schema.sql"
MIGRATION = HERE / "migrations" / "002_admin_approval.sql"
BASELINE = HERE / "test" / "schema_before_approval.sql"
STUB = HERE / "test" / "supabase_stub.sql"

APPROVAL_ERR = "only an admin can change approval status"
NOT_APPROVED_ERR = "has not been approved"


class User:
    def __init__(self, name: str, email: str):
        self.name = name
        self.email = email
        self.id = str(uuid.uuid4())


ANON = "anon"
SUPER = None  # the SQL editor / postgres superuser


class Results:
    def __init__(self):
        self.passed = 0
        self.failed: list[str] = []


class Harness:
    def __init__(self, dsn: str, results: Results, label: str):
        self.conn = psycopg.connect(dsn, autocommit=True)
        self.results = results
        self.label = label

    # Runs one statement as a given user inside its own transaction (rolled back on error).
    def run(self, who, query: str, params=None):
        with self.conn.transaction():
            with self.conn.cursor() as cur:
                if who is ANON:
                    cur.execute("select set_config('request.jwt.claims', %s, true)", [json.dumps({"role": "anon"})])
                    cur.execute("set local role anon")
                elif who is not SUPER:
                    claims = {"sub": who.id, "email": who.email, "role": "authenticated"}
                    cur.execute("select set_config('request.jwt.claims', %s, true)", [json.dumps(claims)])
                    cur.execute("set local role authenticated")
                cur.execute(query, params)
                if cur.description:
                    return cur.fetchall()
                return cur.rowcount

    def script(self, text: str):
        """Runs a whole .sql file the way the Supabase SQL editor does (no wrapping transaction)."""
        self.conn.execute(text)

    def try_run(self, who, query: str, params=None):
        """Returns (result, error)."""
        try:
            return self.run(who, query, params), None
        except psycopg.Error as e:
            return None, e

    def check(self, name: str, ok: bool, detail: str = ""):
        if ok:
            self.results.passed += 1
            print(f"  PASS  {name}")
        else:
            self.results.failed.append(f"[{self.label}] {name}")
            print(f"  FAIL  {name}  {detail}")

    def expect_error(self, name: str, who, query: str, params=None, contains: str | None = None):
        """Passes only if the statement fails (and, if given, the message contains `contains`)."""
        res, err = self.try_run(who, query, params)
        if err is None:
            self.check(name, False, f"(expected an error, got {res!r})")
        elif contains and contains not in str(err):
            self.check(name, False, f"(wrong error: {err})")
        else:
            self.check(name, True)
        return err

    def expect_ok(self, name: str, who, query: str, params=None):
        res, err = self.try_run(who, query, params)
        self.check(name, err is None, f"(error: {err})")
        return res

    def expect_script_ok(self, name: str, text: str):
        try:
            self.script(text)
            self.check(name, True)
        except psycopg.Error as e:
            self.check(name, False, f"(error: {e})")

    def sign_up(self, *users: User, meta: dict | None = None):
        """What Supabase Auth does on sign-up: insert into auth.users (the trigger creates the profile)."""
        for u in users:
            self.run(SUPER, "insert into auth.users (id, email, raw_user_meta_data) values (%s, %s, %s)",
                     [u.id, u.email, json.dumps(meta if meta is not None else {"display_name": u.name.title()})])

    def approval(self, u: User):
        """(approval_status, approved_at, approved_by) as stored, read as the superuser."""
        return self.run(SUPER, "select approval_status, approved_at, approved_by::text from public.profiles where id = %s",
                        [u.id])[0]

    def close(self):
        self.conn.close()


def count(h: Harness, who, table: str) -> int:
    return h.run(who, f"select count(*) from public.{table}")[0][0]


def sees_nothing(h: Harness, who, label: str):
    """The approval gate: no projects, milestones, updates or comments at all."""
    for table in ("projects", "milestones", "updates", "comments"):
        n = count(h, who, table)
        h.check(f"{label} sees no {table}", n == 0, f"(saw {n})")


# ---------------------------------------------------------------------------
# Negative controls: deliberately weaken one rule to prove the suite notices.
# ---------------------------------------------------------------------------

def weaken(h: Harness, which: str):
    if which == "client-read":
        # The client project policy without its approval gate.
        h.script("""
            drop policy if exists "projects_client_read" on public.projects;
            create policy "projects_client_read" on public.projects
              for select to authenticated
              using (client_email is not null
                     and lower(client_email) = lower((select auth.jwt()) ->> 'email'));
        """)
    elif which == "approval-guard":
        # The profile trigger without its approval-field check.
        src = h.run(SUPER, "select pg_get_functiondef('public.protect_profile_fields()'::regprocedure)")[0][0]
        needle = f"raise exception '{APPROVAL_ERR}' using errcode = '42501';"
        assert needle in src, "approval guard not found in protect_profile_fields()"
        h.script(src.replace(needle, "null;"))
    else:
        raise SystemExit(f"unknown --weaken {which!r}")
    print(f"  !!    NEGATIVE CONTROL: weakened {which!r}; failures below are expected")


# ---------------------------------------------------------------------------
# Structural fingerprint: the fresh and upgraded databases must match.
# ---------------------------------------------------------------------------

FINGERPRINT_QUERIES = {
    "columns": """select table_name, column_name, data_type, is_nullable, coalesce(column_default, '')
                  from information_schema.columns where table_schema = 'public' order by 1, 2""",
    "constraints": """select conrelid::regclass::text, conname, pg_get_constraintdef(oid)
                      from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2""",
    "indexes": "select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1, 2",
    "rls": """select relname, relrowsecurity, relforcerowsecurity from pg_class
              where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1""",
    "policies": """select tablename, policyname, cmd, roles::text, coalesce(qual, ''), coalesce(with_check, '')
                   from pg_policies where schemaname = 'public' order by 1, 2""",
    "functions": """select p.proname, pg_get_functiondef(p.oid), coalesce(p.proacl::text, '')
                    from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1""",
    "triggers": """select tgrelid::regclass::text, tgname, pg_get_triggerdef(oid) from pg_trigger
                   where not tgisinternal order by 1, 2""",
    "table grants": """select table_name, grantee, privilege_type from information_schema.role_table_grants
                       where table_schema = 'public' order by 1, 2, 3""",
    "column grants": """select table_name, column_name, grantee, privilege_type from information_schema.column_privileges
                        where table_schema = 'public' and grantee in ('anon', 'authenticated') order by 1, 2, 3, 4""",
    "publication": """select tablename from pg_publication_tables
                      where pubname = 'supabase_realtime' order by 1""",
}


def fingerprint(h: Harness) -> dict[str, list]:
    return {k: h.run(SUPER, q) for k, q in FINGERPRINT_QUERIES.items()}


# ---------------------------------------------------------------------------
# The full rule suite (runs on the fresh and on the upgraded database).
# ---------------------------------------------------------------------------

def run_suite(h: Harness):
    admin = User("admin", "jack@example.test")
    family = User("family", "family@example.test")
    alice = User("alice", "alice@example.test")
    bob = User("bob", "bob@example.test")
    carol = User("carol", "carol@example.test")
    h.sign_up(admin, family, alice, bob, carol)
    # Sign-up metadata trying to grant itself admin (or approval) must be ignored.
    sneaky = User("sneaky", "sneaky@example.test")
    h.sign_up(sneaky, meta={"role": "admin", "approval_status": "approved", "display_name": "x"})

    rows = h.run(SUPER, "select role from public.profiles where id = %s", [alice.id])
    h.check("signup trigger creates a profile with role client", rows == [("client",)], repr(rows))
    rows = h.run(SUPER, "select role from public.profiles where id = %s", [sneaky.id])
    h.check("role in signup metadata is ignored", rows == [("client",)], repr(rows))
    h.check("new sign-ups start pending, with no approval stamp", h.approval(alice) == ("pending", None, None),
            repr(h.approval(alice)))
    h.check("approval_status in signup metadata is ignored", h.approval(sneaky)[0] == "pending", repr(h.approval(sneaky)))

    # "make me admin" / "make family" from the SQL editor (runs as postgres)
    h.expect_ok("SQL editor can make admin", SUPER,
                "update public.profiles set role = 'admin' where email = lower(%s)", [admin.email])
    h.expect_ok("SQL editor can make family", SUPER,
                "update public.profiles set role = 'family' where email = lower(%s)", [family.email])
    h.check("admin's own approval_status is still 'pending' here (admin counts as approved anyway)",
            h.approval(admin)[0] == "pending", repr(h.approval(admin)))
    h.check("a role change alone does not approve the family account", h.approval(family)[0] == "pending",
            repr(h.approval(family)))

    # ---- seed data as admin, through RLS ---------------------------------
    print("\nAdmin (approval_status still 'pending': allowed everything anyway)")
    pa, pb, pc = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
    h.expect_ok("admin can create projects", admin,
                """insert into public.projects (id, title, progress, stage, status, client_email) values
                   (%s, 'Alice project', 20, 'build', 'in_progress', 'Alice@Example.TEST'),
                   (%s, 'Bob project', 50, 'test', 'in_progress', 'bob@example.test'),
                   (%s, 'Internal project', 0, '', 'planning', null)""", [pa, pb, pc])
    ma1, ma2, ma3, mb1 = (str(uuid.uuid4()) for _ in range(4))
    h.expect_ok("admin can create milestones", admin,
                """insert into public.milestones (id, project_id, title, status, payment_note, due_date, sort) values
                   (%s, %s, 'A1', 'pending_approval', '30%%', current_date + 3, 1),
                   (%s, %s, 'A2', 'in_progress', null, current_date + 10, 2),
                   (%s, %s, 'A3', 'pending_approval', null, null, 3),
                   (%s, %s, 'B1', 'pending_approval', '30%%', current_date + 5, 1)""",
                [ma1, pa, ma2, pa, ma3, pa, mb1, pb])
    h.expect_ok("admin can post client-visible and internal updates", admin,
                """insert into public.updates (project_id, body, visibility) values
                   (%s, 'A visible', 'client'), (%s, 'A internal', 'internal'),
                   (%s, 'B visible', 'client'), (%s, 'B internal', 'internal')""", [pa, pa, pb, pb])
    rows = h.run(SUPER, "select count(*) from public.updates where created_by = %s", [admin.id])
    h.check("updates.created_by is set to the admin", rows == [(4,)], repr(rows))
    h.expect_ok("admin can comment", admin,
                "insert into public.comments (project_id, body) values (%s, 'Hi from Jack')", [pa])
    rows = h.run(SUPER, "select author_name from public.comments where author = %s", [admin.id])
    h.check("admin comment gets author_name", rows == [("Admin",)], repr(rows))
    rows = h.expect_ok("admin_projects() returns client_email for admin", admin,
                       "select id, client_email from public.admin_projects() order by title")
    h.check("admin sees all 3 projects with emails",
            rows is not None and len(rows) == 3 and ("Alice@Example.TEST" in [r[1] for r in rows]), repr(rows))
    rows = h.run(admin, "select public.is_approved()")
    h.check("is_approved() is true for admin even while approval_status = 'pending'", rows == [(True,)], repr(rows))

    # ---- anonymous visitor ------------------------------------------------
    print("\nAnonymous visitor")
    h.expect_ok("anon can insert a contact message", ANON,
                """insert into public.contact_messages (name, contact, project_type, budget, message)
                   values ('Visitor', 'wechat: abc', 'rag', '500_2000', 'I need a document Q&A tool.')""")
    h.expect_error("anon cannot read contact messages", ANON, "select * from public.contact_messages")
    h.expect_error("anon cannot insert a too-short message", ANON,
                   """insert into public.contact_messages (name, contact, project_type, message)
                      values ('V', 'x@y.z', 'web', 'short')""")
    h.expect_error("anon cannot insert a too-long name", ANON,
                   """insert into public.contact_messages (name, contact, project_type, message)
                      values (repeat('n', 81), 'x@y.z', 'web', 'long enough message')""")
    h.expect_error("anon cannot insert a pre-handled message (policy)", ANON,
                   """insert into public.contact_messages (name, contact, project_type, message, handled)
                      values ('V', 'x@y.z', 'web', 'long enough message', true)""", contains="row-level security")
    h.expect_error("anon cannot insert an unknown project type", ANON,
                   """insert into public.contact_messages (name, contact, project_type, message)
                      values ('V', 'x@y.z', 'hack', 'long enough message')""")
    h.expect_error("anon cannot read projects", ANON, "select id from public.projects")
    h.expect_error("anon cannot read updates", ANON, "select id from public.updates")
    h.expect_error("anon cannot read profiles", ANON, "select id from public.profiles")
    h.expect_error("anon cannot call approve_milestone", ANON, "select public.approve_milestone(%s)", [ma1])
    h.expect_error("anon cannot call admin_projects", ANON, "select * from public.admin_projects()")
    h.expect_error("anon cannot read milestones", ANON, "select id from public.milestones")

    # ---- pending accounts --------------------------------------------------
    print("\nPending accounts (signed up, not approved yet)")
    sees_nothing(h, alice, "pending client whose email matches client_email")
    rows = h.run(alice, "select id from public.projects where id = %s", [pa])
    h.check("pending client cannot read her matching project by id", rows == [], repr(rows))
    rows = h.run(alice, "select id from public.milestones where project_id = %s", [pa])
    h.check("pending client cannot read its milestones by project id", rows == [], repr(rows))
    h.expect_error("pending client cannot comment on the project that matches her email", alice,
                   "insert into public.comments (project_id, body) values (%s, 'let me in')", [pa],
                   contains="row-level security")
    h.expect_error("pending client cannot call approve_milestone", alice,
                   "select public.approve_milestone(%s)", [ma1], contains=NOT_APPROVED_ERR)
    rows = h.run(SUPER, "select status from public.milestones where id = %s", [ma1])
    h.check("milestone untouched by the pending client", rows == [("pending_approval",)], repr(rows))
    rows = h.run(alice, "select id::text, approval_status from public.profiles")
    h.check("pending client reads only her own profile row", rows == [(alice.id, "pending")], repr(rows))
    h.check("pending client reads no contact messages", count(h, alice, "contact_messages") == 0)
    h.expect_error("pending client cannot read client_email", alice, "select client_email from public.projects",
                   contains="permission denied")
    h.expect_error("pending client cannot call admin_projects()", alice, "select * from public.admin_projects()")
    rows = h.run(alice, "select public.is_approved()")
    h.check("is_approved() is false for a pending client", rows == [(False,)], repr(rows))

    sees_nothing(h, family, "pending family")
    rows = h.run(family, "select id::text from public.profiles")
    h.check("pending family reads only her own profile row", rows == [(family.id,)], repr(rows))
    h.expect_error("pending family cannot comment", family,
                   "insert into public.comments (project_id, body) values (%s, 'x')", [pa], contains="row-level security")

    # ---- no self-approval -------------------------------------------------
    print("\nNo self-approval")
    for col, value in (("approval_status", "'approved'"), ("approved_at", "now()"), ("approved_by", "id")):
        h.expect_error(f"pending client cannot set her own {col}", alice,
                       f"update public.profiles set {col} = {value} where id = %s", [alice.id], contains=APPROVAL_ERR)
    h.expect_error("pending client cannot approve herself together with a name change", alice,
                   "update public.profiles set display_name = 'A', approval_status = 'approved' where id = %s",
                   [alice.id], contains=APPROVAL_ERR)
    h.expect_error("pending client cannot mark herself rejected either (any change is blocked)", alice,
                   "update public.profiles set approval_status = 'rejected' where id = %s", [alice.id],
                   contains=APPROVAL_ERR)
    h.expect_error("a blanket update by a pending user fails on her own row", alice,
                   "update public.profiles set approval_status = 'approved'", contains=APPROVAL_ERR)
    h.expect_error("pending client cannot upsert her profile as approved", alice,
                   """insert into public.profiles (id, email, role, approval_status) values (%s, %s, 'client', 'approved')
                      on conflict (id) do update set approval_status = 'approved'""",
                   [alice.id, alice.email], contains="permission denied")
    h.expect_error("pending client cannot delete (and so re-create) her profile", alice,
                   "delete from public.profiles where id = %s", [alice.id], contains="permission denied")
    h.expect_error("pending client cannot change her email in auth.users", alice,
                   "update auth.users set email = 'bob@example.test' where id = %s", [alice.id],
                   contains="permission denied")
    n = h.run(family, "update public.profiles set approval_status = 'approved' where id = %s", [alice.id])
    h.check("a non-admin cannot approve someone else (the row is not even visible)", n == 0, repr(n))

    rows = h.run(SUPER, """select p.proname from pg_proc p
                           where p.pronamespace = 'public'::regnamespace
                             and p.prorettype <> 'trigger'::regtype
                             and has_function_privilege('authenticated', p.oid, 'execute')
                           order by 1""")
    rpcs = [r[0] for r in rows]
    expected_rpcs = ["admin_projects", "approve_milestone", "current_email", "is_admin", "is_approved",
                     "is_family", "is_project_client"]
    h.check("the RPCs a signed-in user can call are exactly the reviewed list", rpcs == expected_rpcs, repr(rpcs))
    for fn, args in (("current_email", ""), ("is_admin", ""), ("is_family", ""), ("is_approved", ""),
                     ("is_project_client", f"'{pa}'::uuid")):
        h.expect_ok(f"pending client may call read-only {fn}()", alice, f"select public.{fn}({args})")
    h.expect_error("pending client: approve_milestone() refuses", alice, "select public.approve_milestone(%s)", [ma3])
    h.expect_error("pending client: admin_projects() refuses", alice, "select * from public.admin_projects()")
    rows = h.run(SUPER, """select p.proname from pg_proc p
                           where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype
                           order by 1""")
    for (fn,) in rows:
        h.expect_error(f"trigger function {fn}() cannot be called as an RPC", alice, f"select public.{fn}()")
    h.check("after all of that, alice is still pending with no stamp", h.approval(alice) == ("pending", None, None),
            repr(h.approval(alice)))

    # ---- admin approves ---------------------------------------------------
    print("\nAdmin approves")
    n = h.expect_ok("admin approves alice (plain update, allowed by profiles_update)", admin,
                    "update public.profiles set approval_status = 'approved' where id = %s", [alice.id])
    h.check("approval update touched 1 row", n == 1, repr(n))
    st, at, by = h.approval(alice)
    h.check("trigger stamps approved_at and approved_by = the admin", st == "approved" and at is not None and by == admin.id,
            repr((st, at, by)))
    rows = h.run(alice, "select id from public.projects")
    h.check("after approval, the same client sees exactly her own project", rows == [(uuid.UUID(pa),)], repr(rows))
    rows = h.run(alice, "select title from public.milestones order by title")
    h.check("... and only its milestones", rows == [("A1",), ("A2",), ("A3",)], repr(rows))
    rows = h.run(alice, "select body from public.updates order by body")
    h.check("... and only its client-visible updates", rows == [("A visible",)], repr(rows))
    rows = h.run(alice, "select body from public.comments")
    h.check("... and only its comments", rows == [("Hi from Jack",)], repr(rows))
    h.expect_error("an approved client still cannot change her approval fields", alice,
                   "update public.profiles set approved_at = now() - interval '1 year' where id = %s", [alice.id],
                   contains=APPROVAL_ERR)
    h.expect_ok("admin approves carol while trying to forge the stamp", admin,
                """update public.profiles set approval_status = 'approved', approved_by = %s,
                          approved_at = '2000-01-01' where id = %s""", [family.id, carol.id])
    st, at, by = h.approval(carol)
    h.check("the stamp cannot be forged: approved_by/approved_at come from the trigger",
            st == "approved" and by == admin.id and at.year > 2000, repr((st, at, by)))

    # ---- rejected accounts ------------------------------------------------
    print("\nRejected accounts")
    h.expect_ok("admin rejects bob", admin, "update public.profiles set approval_status = 'rejected' where id = %s",
                [bob.id])
    h.check("rejected: status rejected, no stamp", h.approval(bob) == ("rejected", None, None), repr(h.approval(bob)))
    sees_nothing(h, bob, "rejected client whose email matches client_email")
    h.expect_error("rejected client cannot comment", bob,
                   "insert into public.comments (project_id, body) values (%s, 'hi')", [pb],
                   contains="row-level security")
    h.expect_error("rejected client cannot call approve_milestone", bob,
                   "select public.approve_milestone(%s)", [mb1], contains=NOT_APPROVED_ERR)
    h.expect_error("rejected client cannot restore himself to pending", bob,
                   "update public.profiles set approval_status = 'pending' where id = %s", [bob.id],
                   contains=APPROVAL_ERR)
    rows = h.run(bob, "select id::text, approval_status from public.profiles")
    h.check("rejected client reads only his own profile row", rows == [(bob.id, "rejected")], repr(rows))
    h.expect_ok("admin restores bob to pending", admin,
                "update public.profiles set approval_status = 'pending' where id = %s", [bob.id])
    h.check("restored: back to pending", h.approval(bob) == ("pending", None, None), repr(h.approval(bob)))
    h.check("restored-to-pending client still sees no projects", count(h, bob, "projects") == 0)
    h.expect_ok("admin approves bob", admin,
                "update public.profiles set approval_status = 'approved' where id = %s", [bob.id])
    rows = h.run(bob, "select id from public.projects")
    h.check("approved bob sees exactly his project", rows == [(uuid.UUID(pb),)], repr(rows))

    print("\nFamily approval")
    h.expect_ok("admin approves family", admin,
                "update public.profiles set approval_status = 'approved' where id = %s", [family.id])
    h.check("approved family sees every project", count(h, family, "projects") == 3)

    # ---- client -----------------------------------------------------------
    print("\nClient (alice)")
    rows = h.run(alice, "select id from public.projects")
    h.check("client sees only her own project (email match is case-insensitive)", rows == [(uuid.UUID(pa),)], repr(rows))
    rows = h.run(alice, "select id from public.projects where id = %s", [pb])
    h.check("client cannot see another client's project", rows == [], repr(rows))
    rows = h.run(alice, "select body from public.updates order by body")
    h.check("client sees only her client-visible updates (no internal, none of bob's)", rows == [("A visible",)], repr(rows))
    rows = h.run(alice, "select title from public.milestones order by title")
    h.check("client sees only her project's milestones", rows == [("A1",), ("A2",), ("A3",)], repr(rows))
    rows = h.run(alice, "select count(*) from public.contact_messages")
    h.check("client cannot read contact messages", rows == [(0,)], repr(rows))
    h.expect_error("client cannot read client_email column", alice, "select client_email from public.projects")
    h.expect_error("client cannot call admin_projects()", alice, "select * from public.admin_projects()")
    rows = h.run(alice, "select id, email, role from public.profiles")
    h.check("client reads only her own profile", len(rows) == 1 and str(rows[0][0]) == alice.id, repr(rows))

    h.expect_error("client cannot change her own role (trigger)", alice,
                   "update public.profiles set role = 'admin' where id = %s", [alice.id],
                   contains="only an admin can change roles")
    rows = h.run(SUPER, "select role from public.profiles where id = %s", [alice.id])
    h.check("client role unchanged after attempt", rows == [("client",)], repr(rows))
    h.expect_error("client cannot change her profile email", alice,
                   "update public.profiles set email = 'x@y.z' where id = %s", [alice.id])
    n = h.expect_ok("client can change her own display_name", alice,
                    "update public.profiles set display_name = 'Alice A.' where id = %s", [alice.id])
    h.check("display_name update touched 1 row", n == 1, repr(n))
    n = h.run(alice, "update public.profiles set display_name = 'hacked' where id = %s", [bob.id])
    h.check("client cannot edit someone else's profile", n == 0, repr(n))

    n = h.run(alice, "update public.projects set progress = 100 where id = %s", [pa])
    rows = h.run(SUPER, "select progress from public.projects where id = %s", [pa])
    h.check("client cannot change her project's progress", n == 0 and rows == [(20,)], f"rows={n} progress={rows}")
    n = h.run(alice, "update public.milestones set status = 'done' where id = %s", [ma1])
    h.check("client cannot update milestones directly", n == 0, repr(n))
    h.expect_error("client cannot insert milestones", alice,
                   "insert into public.milestones (project_id, title) values (%s, 'x')", [pa])
    h.expect_error("client cannot post updates", alice,
                   "insert into public.updates (project_id, body) values (%s, 'x')", [pa])
    h.expect_error("client cannot create projects", alice,
                   "insert into public.projects (title, client_email) values ('mine', %s)", [alice.email])
    n = h.run(alice, "delete from public.comments")
    h.check("client cannot delete comments", n == 0, repr(n))

    h.expect_ok("client can comment on her own project", alice,
                "insert into public.comments (project_id, body) values (%s, 'Looks good')", [pa])
    rows = h.run(SUPER, "select author::text, author_name from public.comments where body = 'Looks good'")
    h.check("comment author/author_name come from the caller", rows == [(alice.id, "Alice A.")], repr(rows))
    h.expect_error("client cannot comment on another client's project", alice,
                   "insert into public.comments (project_id, body) values (%s, 'hi')", [pb],
                   contains="row-level security")
    h.expect_ok("client posting as someone else is forced to herself", alice,
                "insert into public.comments (project_id, author, body) values (%s, %s, 'spoof')", [pa, bob.id])
    rows = h.run(SUPER, "select author::text from public.comments where body = 'spoof'")
    h.check("spoofed comment author was replaced with the caller", rows == [(alice.id,)], repr(rows))
    h.expect_error("client cannot post an empty comment", alice,
                   "insert into public.comments (project_id, body) values (%s, '   ')", [pa])

    print("\napprove_milestone")
    h.expect_error("client cannot approve another client's milestone", alice,
                   "select public.approve_milestone(%s)", [mb1], contains="only this project's client")
    rows = h.run(SUPER, "select status from public.milestones where id = %s", [mb1])
    h.check("bob's milestone unchanged", rows == [("pending_approval",)], repr(rows))
    h.expect_error("client cannot approve a milestone that is not 待验收", alice,
                   "select public.approve_milestone(%s)", [ma2], contains="not awaiting approval")
    h.expect_ok("client approves her own 待验收 milestone", alice, "select public.approve_milestone(%s)", [ma1])
    rows = h.run(SUPER, "select status, approved_by::text, approved_at is not null from public.milestones where id = %s", [ma1])
    h.check("approval recorded who and when", rows == [("done", alice.id, True)], repr(rows))
    h.expect_error("approving the same milestone twice fails", alice, "select public.approve_milestone(%s)", [ma1],
                   contains="not awaiting approval")
    h.expect_error("admin cannot approve on the client's behalf", admin, "select public.approve_milestone(%s)", [mb1])
    h.expect_error("family cannot approve", family, "select public.approve_milestone(%s)", [mb1])
    h.expect_error("unknown milestone id fails", alice, "select public.approve_milestone(%s)", [str(uuid.uuid4())])
    h.expect_ok("bob approves his own milestone", bob, "select public.approve_milestone(%s)", [mb1])

    h.expect_ok("admin re-opens a finished milestone", admin,
                "update public.milestones set status = 'pending_approval' where id = %s", [ma1])
    rows = h.run(SUPER, "select approved_by, approved_at from public.milestones where id = %s", [ma1])
    h.check("re-opening clears the old approval", rows == [(None, None)], repr(rows))

    h.expect_ok("admin archives alice's project", admin, "update public.projects set archived = true where id = %s", [pa])
    h.expect_error("client cannot approve on an archived project", alice, "select public.approve_milestone(%s)", [ma3],
                   contains="archived")
    rows = h.run(alice, "select archived from public.projects where id = %s", [pa])
    h.check("client can still view her archived project", rows == [(True,)], repr(rows))
    h.run(admin, "update public.projects set archived = false where id = %s", [pa])

    # ---- other client -----------------------------------------------------
    print("\nOther clients")
    rows = h.run(bob, "select id from public.projects")
    h.check("bob sees only his project", rows == [(uuid.UUID(pb),)], repr(rows))
    rows = h.run(bob, "select body from public.updates order by body")
    h.check("bob sees only his client-visible update", rows == [("B visible",)], repr(rows))
    rows = h.run(bob, "select count(*) from public.comments")
    h.check("bob cannot read alice's comments", rows == [(0,)], repr(rows))
    rows = h.run(carol, "select count(*) from public.projects")
    h.check("a client with no linked project sees none", rows == [(0,)], repr(rows))

    # ---- family -----------------------------------------------------------
    print("\nFamily (approved)")
    rows = h.run(family, "select id, title, progress, stage, status, archived from public.projects")
    h.check("family reads all projects (without client_email)", len(rows) == 3, repr(rows))
    h.expect_error("family cannot read client_email", family, "select client_email from public.projects",
                   contains="permission denied")
    h.expect_error("family cannot select * from projects (would include client_email)", family, "select * from public.projects")
    rows = h.run(family, "select count(*) from public.updates where visibility = 'internal'")
    h.check("family reads internal updates", rows == [(2,)], repr(rows))
    rows = h.run(family, "select count(*) from public.milestones")
    h.check("family reads all milestones", rows == [(4,)], repr(rows))
    rows = h.run(family, "select count(*) from public.comments")
    h.check("family reads all comments", rows[0][0] >= 3, repr(rows))
    rows = h.run(family, "select count(*) from public.contact_messages")
    h.check("family cannot read contact messages", rows == [(0,)], repr(rows))
    rows = h.run(family, "select email from public.profiles")
    h.check("family cannot read other users' profiles/emails", rows == [(family.email,)], repr(rows))
    h.expect_error("family cannot call admin_projects()", family, "select * from public.admin_projects()")
    h.expect_error("family cannot create projects", family, "insert into public.projects (title) values ('x')")
    n = h.run(family, "update public.projects set progress = 99")
    h.check("family cannot update projects", n == 0, repr(n))
    n = h.run(family, "delete from public.milestones")
    h.check("family cannot delete milestones", n == 0, repr(n))
    h.expect_error("family cannot post updates", family,
                   "insert into public.updates (project_id, body) values (%s, 'x')", [pa])
    h.expect_error("family cannot comment", family,
                   "insert into public.comments (project_id, body) values (%s, 'x')", [pa],
                   contains="row-level security")
    n = h.run(family, "update public.contact_messages set handled = true")
    h.check("family cannot mark messages handled", n == 0, repr(n))
    h.expect_error("family cannot change her own role (trigger)", family,
                   "update public.profiles set role = 'admin' where id = %s", [family.id],
                   contains="only an admin can change roles")
    h.expect_error("approved family cannot change her approval fields", family,
                   "update public.profiles set approved_by = null where id = %s", [family.id], contains=APPROVAL_ERR)

    # ---- admin inbox and roles -------------------------------------------
    print("\nAdmin inbox and roles")
    rows = h.run(admin, "select name, handled from public.contact_messages")
    h.check("admin reads the contact inbox", rows == [("Visitor", False)], repr(rows))
    n = h.run(admin, "update public.contact_messages set handled = true")
    h.check("admin marks a message handled", n == 1, repr(n))
    rows = h.run(admin, "select count(*) from public.profiles")
    h.check("admin reads all profiles", rows == [(6,)], repr(rows))
    rows = h.run(admin, "select email from public.profiles where approval_status = 'pending' and role <> 'admin'")
    h.check("admin can list who is still waiting (only sneaky)", rows == [(sneaky.email,)], repr(rows))
    h.expect_ok("admin sets a user's role", admin, "update public.profiles set role = 'family' where id = %s", [carol.id])
    rows = h.run(SUPER, "select role from public.profiles where id = %s", [carol.id])
    h.check("role change by admin stuck", rows == [("family",)], repr(rows))
    rows = h.run(carol, "select count(*) from public.projects")
    h.check("new family member immediately sees all projects", rows == [(3,)], repr(rows))
    h.expect_error("admin also cannot read client_email directly (only via admin_projects)", admin,
                   "select client_email from public.projects")
    h.expect_error("API roles cannot TRUNCATE (which would bypass RLS)", admin, "truncate public.comments")

    # ---- admin is always approved ----------------------------------------
    print("\nAdmin always counts as approved")
    for status in ("rejected", "pending"):
        h.expect_ok(f"SQL editor sets the admin's approval_status to {status!r}", SUPER,
                    "update public.profiles set approval_status = %s where id = %s", [status, admin.id])
        rows = h.run(admin, "select count(*) from public.admin_projects()")
        h.check(f"admin ({status}) still reads every project", rows == [(3,)], repr(rows))
        h.check(f"admin ({status}) still reads every profile", count(h, admin, "profiles") == 6)
        h.check(f"admin ({status}) still reads milestones, updates, comments and the inbox",
                count(h, admin, "milestones") == 4 and count(h, admin, "updates") == 4
                and count(h, admin, "comments") >= 3 and count(h, admin, "contact_messages") == 1)
        n = h.run(admin, "update public.projects set stage = %s where id = %s", [f"stage-{status}", pc])
        h.check(f"admin ({status}) still edits projects", n == 1, repr(n))
        rows = h.run(admin, "select public.is_approved()")
        h.check(f"is_approved() is true for admin ({status})", rows == [(True,)], repr(rows))
    h.expect_ok("admin (pending) can still approve accounts", admin,
                "update public.profiles set approval_status = 'approved' where id = %s", [sneaky.id])
    st, _, by = h.approval(sneaky)
    h.check("sneaky is approved, stamped with the admin", st == "approved" and by == admin.id, repr((st, by)))
    h.expect_ok("admin can set its own status back to approved", admin,
                "update public.profiles set approval_status = 'approved' where id = %s", [admin.id])

    h.expect_ok("admin deletes a project (cascades)", admin, "delete from public.projects where id = %s", [pc])
    h.expect_ok("admin deletes a project with milestones and updates", admin,
                "delete from public.projects where id = %s", [pb])
    rows = h.run(SUPER, "select count(*) from public.milestones where project_id = %s", [pb])
    h.check("its milestones were removed too", rows == [(0,)], repr(rows))

    # ---- email change -----------------------------------------------------
    # With "Confirm email" off, Supabase applies an email change at once. An
    # approved account must not carry its approval over to another address.
    print("\nEmail change")
    erin = User("erin", "erin@example.test")
    h.sign_up(erin)
    h.run(admin, "update public.profiles set approval_status = 'approved' where id = %s", [erin.id])
    pd = str(uuid.uuid4())
    h.run(admin, "insert into public.projects (id, title, client_email) values (%s, 'Dave project', 'dave@example.test')",
          [pd])
    h.check("approved erin sees no project before the change", count(h, erin, "projects") == 0)
    h.run(SUPER, "update auth.users set email = 'Dave@Example.test' where id = %s", [erin.id])
    erin.email = "dave@example.test"  # her next JWT carries the new address
    rows = h.run(SUPER, "select email, approval_status, approved_at from public.profiles where id = %s", [erin.id])
    h.check("an email change syncs the profile and puts the account back to pending",
            rows == [("dave@example.test", "pending", None)], repr(rows))
    sees_nothing(h, erin, "account whose new email matches a project, before re-approval,")
    h.run(admin, "update public.profiles set approval_status = 'approved' where id = %s", [erin.id])
    rows = h.run(erin, "select id from public.projects")
    h.check("after re-approval the account sees the project for its new email", rows == [(uuid.UUID(pd),)], repr(rows))
    h.run(SUPER, "update auth.users set email = 'DAVE@example.test' where id = %s", [erin.id])
    h.check("a change of letter case only keeps the approval", h.approval(erin)[0] == "approved", repr(h.approval(erin)))
    h.run(admin, "update public.profiles set approval_status = 'rejected' where id = %s", [erin.id])
    h.run(SUPER, "update auth.users set email = 'erin2@example.test' where id = %s", [erin.id])
    h.check("a rejected account stays rejected after an email change", h.approval(erin)[0] == "rejected",
            repr(h.approval(erin)))
    h.run(SUPER, "update auth.users set email = 'jack2@example.test' where id = %s", [admin.id])
    admin.email = "jack2@example.test"
    h.check("admin keeps working after changing email", count(h, admin, "profiles") == 7)
    h.run(SUPER, "update auth.users set email = 'jack@example.test' where id = %s", [admin.id])
    admin.email = "jack@example.test"

    # ---- revocation -------------------------------------------------------
    print("\nRevocation")
    h.expect_ok("admin rejects an approved client", admin,
                "update public.profiles set approval_status = 'rejected' where id = %s", [alice.id])
    sees_nothing(h, alice, "client rejected after approval")
    h.expect_error("client rejected after approval can no longer comment", alice,
                   "insert into public.comments (project_id, body) values (%s, 'still here?')", [pa],
                   contains="row-level security")

    print("\nContact form still open")
    h.expect_ok("anon can still insert a contact message", ANON,
                """insert into public.contact_messages (name, contact, project_type, message)
                   values ('Visitor 2', 'wechat: def', 'web', 'Another enquiry, thanks.')""")
    h.expect_ok("a rejected (or pending) account can still use the contact form", alice,
                """insert into public.contact_messages (name, contact, project_type, message)
                   values ('Alice', 'alice@example.test', 'other', 'Please approve my account.')""")
    h.check("... but still cannot read the inbox", count(h, alice, "contact_messages") == 0)

    # ---- realtime publication -------------------------------------------
    rows = h.run(SUPER, "select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1")
    h.check("tables are in the supabase_realtime publication (now including profiles)",
            [r[0] for r in rows] == ["comments", "contact_messages", "milestones", "profiles", "projects", "updates"],
            repr(rows))


# ---------------------------------------------------------------------------
# Live upgrade: the old schema with real-looking rows, then the migration.
# ---------------------------------------------------------------------------

def run_live_upgrade(h: Harness, migration_sql: str, schema_sql: str, weaken_which: str | None):
    jack = User("jack", "jack@example.test")
    fam = User("fam", "fam@example.test")
    cli = User("client", "client@example.test")
    old = User("oldclient", "old@example.test")
    h.sign_up(jack, fam, cli, old)
    h.run(SUPER, "update public.profiles set role = 'admin' where email = lower(%s)", [jack.email])
    h.run(SUPER, "update public.profiles set role = 'family' where email = lower(%s)", [fam.email])
    p1, m1 = str(uuid.uuid4()), str(uuid.uuid4())
    h.run(jack, "insert into public.projects (id, title, client_email, progress) values (%s, 'Live project', %s, 40)",
          [p1, cli.email])
    h.run(jack, "insert into public.milestones (id, project_id, title, status) values (%s, %s, 'M1', 'pending_approval')",
          [m1, p1])
    h.run(jack, "insert into public.updates (project_id, body, visibility) values (%s, 'visible', 'client'), (%s, 'internal', 'internal')",
          [p1, p1])
    h.run(cli, "insert into public.comments (project_id, body) values (%s, 'old-regime comment')", [p1])
    h.run(ANON, """insert into public.contact_messages (name, contact, project_type, message)
                   values ('Visitor', 'wechat: abc', 'rag', 'I need a document Q&A tool.')""")

    snapshot_sql = {
        "profiles": "select id, email, display_name, role, created_at from public.profiles order by id",
        "projects": "select * from public.projects order by id",
        "milestones": "select * from public.milestones order by id",
        "updates": "select * from public.updates order by id",
        "comments": "select * from public.comments order by id",
        "contact_messages": "select * from public.contact_messages order by id",
    }
    before = {k: h.run(SUPER, q) for k, q in snapshot_sql.items()}
    h.check("old schema: the client could see her project before the upgrade", count(h, cli, "projects") == 1)

    h.expect_script_ok("migration applies to the live-like database with existing rows", migration_sql)
    h.expect_script_ok("migration runs a second time (idempotent)", migration_sql)
    if weaken_which:
        weaken(h, weaken_which)

    after = {k: h.run(SUPER, q) for k, q in snapshot_sql.items()}
    for k in snapshot_sql:
        h.check(f"existing {k} rows are unchanged", before[k] == after[k], f"(before={before[k]!r} after={after[k]!r})")

    st, at, by = h.approval(jack)
    h.check("backfill: existing admin is approved (approved_at set, approved_by null = SQL editor)",
            st == "approved" and at is not None and by is None, repr((st, at, by)))
    h.check("backfill: existing family is approved", h.approval(fam)[0] == "approved", repr(h.approval(fam)))
    h.check("backfill: existing clients start pending",
            h.approval(cli) == ("pending", None, None) and h.approval(old) == ("pending", None, None),
            repr((h.approval(cli), h.approval(old))))

    h.check("admin still sees every project after the upgrade",
            h.run(jack, "select count(*) from public.admin_projects()") == [(1,)])
    h.check("admin still reads every profile", count(h, jack, "profiles") == 4)
    h.check("admin still reads the inbox", count(h, jack, "contact_messages") == 1)
    h.check("approved family still sees everything", count(h, fam, "projects") == 1 and count(h, fam, "updates") == 2)
    sees_nothing(h, cli, "existing client, now pending,")
    h.expect_error("existing client, now pending, can no longer approve her milestone", cli,
                   "select public.approve_milestone(%s)", [m1], contains=NOT_APPROVED_ERR)
    h.expect_error("existing client cannot approve herself", cli,
                   "update public.profiles set approval_status = 'approved' where id = %s", [cli.id], contains=APPROVAL_ERR)
    h.expect_ok("admin approves the existing client", jack,
                "update public.profiles set approval_status = 'approved' where id = %s", [cli.id])
    rows = h.run(cli, "select id from public.projects")
    h.check("approved existing client sees her project again", rows == [(uuid.UUID(p1),)], repr(rows))
    h.check("... with its comment and client update", count(h, cli, "comments") == 1 and count(h, cli, "updates") == 1)

    h.expect_ok("admin rejects the family account", jack,
                "update public.profiles set approval_status = 'rejected' where id = %s", [fam.id])
    h.expect_script_ok("migration runs a third time after decisions were made", migration_sql)
    h.check("re-running the migration keeps the rejection (no second backfill)", h.approval(fam)[0] == "rejected",
            repr(h.approval(fam)))
    h.check("... and keeps the client's approval", h.approval(cli)[0] == "approved", repr(h.approval(cli)))
    h.expect_script_ok("the new schema.sql can also be re-run on the upgraded database", schema_sql)
    h.check("re-running schema.sql keeps the decisions too",
            h.approval(fam)[0] == "rejected" and h.approval(cli)[0] == "approved" and h.approval(old)[0] == "pending",
            repr((h.approval(fam), h.approval(cli), h.approval(old))))

    newbie = User("newbie", "newbie@example.test")
    h.sign_up(newbie)
    h.check("a sign-up after the upgrade starts pending", h.approval(newbie) == ("pending", None, None))
    rows = h.run(SUPER, """select tablename from pg_publication_tables
                           where pubname = 'supabase_realtime' and tablename = 'profiles'""")
    h.check("profiles joined the realtime publication", rows == [("profiles",)], repr(rows))


# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dsn", help="Postgres URL of a throwaway server (default: start one with pgserver)")
    ap.add_argument("--data-dir", help="pgserver data directory (default: a temp dir)")
    ap.add_argument("--schema", default=str(SCHEMA), help="schema file to test (default: schema.sql)")
    ap.add_argument("--migration", default=str(MIGRATION), help="migration file (default: migrations/002_admin_approval.sql)")
    ap.add_argument("--baseline", default=str(BASELINE), help="pre-approval schema (default: test/schema_before_approval.sql)")
    ap.add_argument("--weaken", choices=["client-read", "approval-guard"],
                    help="negative control: weaken one rule after setup (the run must then fail)")
    args = ap.parse_args()

    server = None
    if args.dsn:
        admin_dsn = args.dsn
    else:
        import pgserver  # type: ignore

        data_dir = args.data_dir or tempfile.mkdtemp(prefix="studio-rls-")
        server = pgserver.get_server(data_dir, cleanup_mode="stop")
        admin_dsn = server.get_uri()

    stub_sql = STUB.read_text()
    schema_sql = Path(args.schema).read_text()
    migration_sql = Path(args.migration).read_text()
    baseline_sql = Path(args.baseline).read_text()
    results = Results()

    def new_db(name: str, label: str) -> Harness:
        with psycopg.connect(admin_dsn, autocommit=True) as c:
            c.execute(f"drop database if exists {name} with (force)")
            c.execute(f"create database {name}")
        h = Harness(psycopg.conninfo.make_conninfo(admin_dsn, dbname=name), results, label)
        h.script(stub_sql)
        return h

    print("== Setup")
    fresh = new_db("studio_rls_fresh", "fresh")
    print("Postgres:", fresh.run(SUPER, "show server_version")[0][0])
    fresh.expect_script_ok("schema.sql applies on a fresh database", schema_sql)
    fresh.expect_script_ok("schema.sql can be run a second time (idempotent)", schema_sql)
    fp_schema = fingerprint(fresh)
    fresh.expect_script_ok("migration 002 runs on a fresh schema.sql database", migration_sql)
    fresh.expect_script_ok("migration 002 runs there a second time", migration_sql)
    fp_fresh_migrated = fingerprint(fresh)

    upgrade = new_db("studio_rls_upgrade", "upgrade")
    upgrade.expect_script_ok("old (live) schema applies", baseline_sql)
    upgrade.expect_script_ok("migration 002 upgrades the old schema", migration_sql)
    upgrade.expect_script_ok("migration 002 runs a second time (idempotent)", migration_sql)
    fp_upgrade = fingerprint(upgrade)

    def same(label: str, a: dict, b: dict, a_name: str, b_name: str):
        for key in FINGERPRINT_QUERIES:
            diff = ""
            if a[key] != b[key]:
                only_a = [r for r in a[key] if r not in b[key]][:3]
                only_b = [r for r in b[key] if r not in a[key]][:3]
                diff = f"(only in {a_name}: {only_a!r}; only in {b_name}: {only_b!r})"
            fresh.check(f"{label}: identical {key}", a[key] == b[key], diff)

    # schema.sql alone must produce exactly what the live upgrade produces...
    same("schema.sql alone vs. old schema + migration", fp_schema, fp_upgrade, "schema.sql", "upgrade")
    # ...and the migration must change nothing on a fresh install.
    same("migration is a no-op on a fresh schema.sql", fp_schema, fp_fresh_migrated, "before", "after")

    for h, title in ((fresh, "fresh install (schema.sql x2 + migration x2)"),
                     (upgrade, "upgraded live schema (old schema + migration x2)")):
        print(f"\n== Rule suite on the {title}")
        if args.weaken:
            weaken(h, args.weaken)
        run_suite(h)
        h.close()

    print("\n== Live upgrade with existing rows (old schema + data, then migration)")
    live = new_db("studio_rls_live", "live")
    live.expect_script_ok("old (live) schema applies", baseline_sql)
    run_live_upgrade(live, migration_sql, schema_sql, args.weaken)
    live.close()

    print(f"\n{results.passed} passed, {len(results.failed)} failed")
    for name in results.failed:
        print(f"  - {name}")
    if server is not None:
        server.cleanup()
    return 0 if not results.failed else 1


if __name__ == "__main__":
    sys.exit(main())
