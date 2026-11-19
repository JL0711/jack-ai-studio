#!/usr/bin/env python3
"""
Runs schema.sql against a real local Postgres and checks the RLS rules.

Setup (once):
    python3 -m venv .venv-rls
    .venv-rls/bin/pip install pgserver "psycopg[binary]"
Run:
    .venv-rls/bin/python supabase/test_rls.py
Or against your own throwaway Postgres (NOT your Supabase project):
    .venv-rls/bin/python supabase/test_rls.py --dsn postgresql://postgres@localhost/test

`pgserver` ships a Postgres binary, so nothing needs to be installed system-wide.
The test creates a fresh database, loads test/supabase_stub.sql (the auth
schema, auth.uid(), auth.jwt(), roles anon/authenticated) and then schema.sql
twice (to prove it can be re-run).
"""
from __future__ import annotations

import argparse
import json
import sys
import tempfile
import uuid
from pathlib import Path

import psycopg
from psycopg import sql

HERE = Path(__file__).resolve().parent
SCHEMA = HERE / "schema.sql"
STUB = HERE / "test" / "supabase_stub.sql"


class User:
    def __init__(self, name: str, email: str):
        self.name = name
        self.email = email
        self.id = str(uuid.uuid4())


ANON = "anon"
SUPER = None  # the SQL editor / postgres superuser


class Harness:
    def __init__(self, dsn: str):
        self.conn = psycopg.connect(dsn, autocommit=True)
        self.passed = 0
        self.failed: list[str] = []

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

    def try_run(self, who, query: str, params=None):
        """Returns (result, error)."""
        try:
            return self.run(who, query, params), None
        except psycopg.Error as e:
            return None, e

    def check(self, name: str, ok: bool, detail: str = ""):
        if ok:
            self.passed += 1
            print(f"  PASS  {name}")
        else:
            self.failed.append(name)
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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dsn", help="Postgres URL of a throwaway server (default: start one with pgserver)")
    ap.add_argument("--data-dir", help="pgserver data directory (default: a temp dir)")
    ap.add_argument("--schema", default=str(SCHEMA), help="schema file to test (default: schema.sql)")
    args = ap.parse_args()

    server = None
    if args.dsn:
        admin_dsn = args.dsn
    else:
        import pgserver  # type: ignore

        data_dir = args.data_dir or tempfile.mkdtemp(prefix="studio-rls-")
        server = pgserver.get_server(data_dir, cleanup_mode="stop")
        admin_dsn = server.get_uri()

    # Fresh database every run.
    with psycopg.connect(admin_dsn, autocommit=True) as c:
        c.execute("drop database if exists studio_rls_test with (force)")
        c.execute("create database studio_rls_test")
    dsn = psycopg.conninfo.make_conninfo(admin_dsn, dbname="studio_rls_test")

    h = Harness(dsn)
    print("Postgres:", h.run(SUPER, "show server_version")[0][0])
    print("Setup")
    h.run(SUPER, STUB.read_text())
    schema_sql = Path(args.schema).read_text()
    h.expect_ok("schema.sql applies on a fresh database", SUPER, schema_sql)
    h.expect_ok("schema.sql can be run a second time (idempotent)", SUPER, schema_sql)

    admin = User("admin", "jack@example.test")
    family = User("family", "family@example.test")
    alice = User("alice", "alice@example.test")
    bob = User("bob", "bob@example.test")
    carol = User("carol", "carol@example.test")
    for u in (admin, family, alice, bob, carol):
        h.run(SUPER, "insert into auth.users (id, email, raw_user_meta_data) values (%s, %s, %s)",
              [u.id, u.email, json.dumps({"display_name": u.name.title()})])
    # Sign-up metadata trying to grant itself admin must be ignored.
    sneaky = User("sneaky", "sneaky@example.test")
    h.run(SUPER, "insert into auth.users (id, email, raw_user_meta_data) values (%s, %s, %s)",
          [sneaky.id, sneaky.email, json.dumps({"role": "admin", "display_name": "x"})])

    rows = h.run(SUPER, "select role from public.profiles where id = %s", [alice.id])
    h.check("signup trigger creates a profile with role client", rows == [("client",)], repr(rows))
    rows = h.run(SUPER, "select role from public.profiles where id = %s", [sneaky.id])
    h.check("role in signup metadata is ignored", rows == [("client",)], repr(rows))

    # "make me admin" / "make family" from the SQL editor (runs as postgres)
    h.expect_ok("SQL editor can make admin", SUPER,
                "update public.profiles set role = 'admin' where email = lower(%s)", [admin.email])
    h.expect_ok("SQL editor can make family", SUPER,
                "update public.profiles set role = 'family' where email = lower(%s)", [family.email])

    # ---- seed data as admin, through RLS ---------------------------------
    print("\nAdmin")
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

    # ---- anonymous visitor ------------------------------------------------
    print("\nAnonymous visitor")
    h.expect_ok("anon can insert a contact message", ANON,
                """insert into public.contact_messages (name, contact, project_type, budget, message)
                   values ('Visitor', 'wechat: abc', 'rag', '500_2000', 'I need a document Q&A tool.')""")
    err = h.expect_error("anon cannot read contact messages", ANON, "select * from public.contact_messages")
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
    print("\nFamily")
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

    # ---- admin inbox and roles -------------------------------------------
    print("\nAdmin inbox and roles")
    rows = h.run(admin, "select name, handled from public.contact_messages")
    h.check("admin reads the contact inbox", rows == [("Visitor", False)], repr(rows))
    n = h.run(admin, "update public.contact_messages set handled = true")
    h.check("admin marks a message handled", n == 1, repr(n))
    rows = h.run(admin, "select count(*) from public.profiles")
    h.check("admin reads all profiles", rows == [(6,)], repr(rows))
    h.expect_ok("admin sets a user's role", admin, "update public.profiles set role = 'family' where id = %s", [carol.id])
    rows = h.run(SUPER, "select role from public.profiles where id = %s", [carol.id])
    h.check("role change by admin stuck", rows == [("family",)], repr(rows))
    rows = h.run(carol, "select count(*) from public.projects")
    h.check("new family member immediately sees all projects", rows == [(3,)], repr(rows))
    h.expect_error("admin also cannot read client_email directly (only via admin_projects)", admin,
                   "select client_email from public.projects")
    h.expect_error("API roles cannot TRUNCATE (which would bypass RLS)", admin, "truncate public.comments")

    h.expect_ok("admin deletes a project (cascades)", admin, "delete from public.projects where id = %s", [pc])
    h.expect_ok("admin deletes a project with milestones and updates", admin,
                "delete from public.projects where id = %s", [pb])
    rows = h.run(SUPER, "select count(*) from public.milestones where project_id = %s", [pb])
    h.check("its milestones were removed too", rows == [(0,)], repr(rows))

    # ---- realtime publication -------------------------------------------
    rows = h.run(SUPER, "select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1")
    h.check("tables are in the supabase_realtime publication",
            [r[0] for r in rows] == ["comments", "contact_messages", "milestones", "projects", "updates"], repr(rows))

    print(f"\n{h.passed} passed, {len(h.failed)} failed")
    for name in h.failed:
        print(f"  - {name}")
    h.conn.close()
    if server is not None:
        server.cleanup()
    return 0 if not h.failed else 1


if __name__ == "__main__":
    sys.exit(main())
