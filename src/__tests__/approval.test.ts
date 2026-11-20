// Admin approval replaces email confirmation: a new account sees nothing until
// Jack approves it. These tests cover the shared permission helpers and the
// demo store, which mirror public.is_approved() and the RLS policies.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildViewer,
  canApproveMilestone,
  canComment,
  canViewProject,
  countPending,
  effectiveApproval,
  groupByApproval,
  isApproved,
  isAwaitingApproval,
} from '../lib/permissions';
import type { ApprovalStatus, Profile, Project, Viewer } from '../lib/types';
import { VISITOR } from '../lib/types';
import { DEMO_IDS, DEMO_VIEWERS, buildDemoSeed, type DemoSeed } from '../store/demoData';
import { createDemoStore, type DemoStore } from '../store/demoStore';

const NOW = new Date(2026, 10, 20, 12, 0);

const viewer = (role: Viewer['role'], approval: ApprovalStatus, email = 'c@example.com'): Viewer => ({
  role,
  userId: `u-${role}-${approval}`,
  email,
  displayName: null,
  approval,
});

const project: Pick<Project, 'client_email' | 'archived'> = { client_email: 'C@example.com', archived: false };

describe('approval helpers', () => {
  it('admin always counts as approved, whatever approval_status says', () => {
    expect(effectiveApproval({ role: 'admin', approval_status: 'pending' })).toBe('approved');
    expect(effectiveApproval({ role: 'admin', approval_status: 'rejected' })).toBe('approved');
    expect(effectiveApproval({ role: 'client', approval_status: 'rejected' })).toBe('rejected');
    expect(effectiveApproval({ role: 'family', approval_status: 'approved' })).toBe('approved');
    expect(effectiveApproval({ role: 'client', approval_status: 'nonsense' })).toBe('pending');
    expect(effectiveApproval({ role: 'client' })).toBe('pending');
  });

  it('only approved accounts (or admin) get past the gate', () => {
    expect(isApproved(viewer('client', 'approved'))).toBe(true);
    expect(isApproved(viewer('client', 'pending'))).toBe(false);
    expect(isApproved(viewer('client', 'rejected'))).toBe(false);
    expect(isApproved(viewer('family', 'pending'))).toBe(false);
    expect(isApproved(viewer('admin', 'pending'))).toBe(true);
    expect(isApproved(VISITOR)).toBe(false);
    expect(isAwaitingApproval(viewer('client', 'pending'))).toBe(true);
    expect(isAwaitingApproval(viewer('client', 'rejected'))).toBe(true);
    expect(isAwaitingApproval(viewer('admin', 'rejected'))).toBe(false);
    expect(isAwaitingApproval(VISITOR)).toBe(false);
  });

  it('a pending or rejected client cannot view, comment on or approve even their own project', () => {
    for (const status of ['pending', 'rejected'] as const) {
      const v = viewer('client', status);
      expect(canViewProject(v, project)).toBe(false);
      expect(canComment(v, project)).toBe(false);
      expect(canApproveMilestone(v, project, { status: 'pending_approval' })).toBe(false);
    }
    const ok = viewer('client', 'approved');
    expect(canViewProject(ok, project)).toBe(true);
    expect(canComment(ok, project)).toBe(true);
    expect(canApproveMilestone(ok, project, { status: 'pending_approval' })).toBe(true);
  });

  it('a pending family member sees nothing; an approved one sees everything', () => {
    expect(canViewProject(viewer('family', 'pending', 'f@example.com'), project)).toBe(false);
    expect(canViewProject(viewer('family', 'approved', 'f@example.com'), project)).toBe(true);
  });

  it('groups accounts for the Users page and counts the pending badge', () => {
    const rows = [
      { role: 'client', approval_status: 'pending' },
      { role: 'client', approval_status: 'pending' },
      { role: 'family', approval_status: 'approved' },
      { role: 'client', approval_status: 'rejected' },
      { role: 'admin', approval_status: 'pending' }, // admin: approved, not in the review list
    ] as Pick<Profile, 'role' | 'approval_status'>[];
    const g = groupByApproval(rows);
    expect(g.pending).toHaveLength(2);
    expect(g.approved.map((p) => p.role)).toEqual(['family', 'admin']);
    expect(g.rejected).toHaveLength(1);
    expect(countPending(rows)).toBe(2);
  });

  it('builds the viewer from the profile row, failing closed until it has loaded', () => {
    const id = { userId: 'u1', email: 'a@example.com', displayName: 'From metadata' };
    expect(buildViewer(id, null)).toEqual({ ...id, role: 'client', approval: 'pending' });
    expect(buildViewer(id, { role: 'family', approval_status: 'approved', display_name: 'Mum' })).toMatchObject({
      role: 'family',
      approval: 'approved',
      displayName: 'Mum',
    });
    expect(buildViewer(id, { role: 'admin', approval_status: 'pending', display_name: null })).toMatchObject({
      role: 'admin',
      approval: 'approved',
      displayName: 'From metadata',
    });
    expect(buildViewer(id, { role: 'root' as Profile['role'], approval_status: 'approved', display_name: null }).role).toBe(
      'client',
    );
  });
});

describe('demo store: the approval gate', () => {
  const admin = DEMO_VIEWERS.admin;
  const pending = DEMO_VIEWERS.pending; // email matches demo-p5
  let store: DemoStore;
  beforeEach(() => {
    store = createDemoStore(buildDemoSeed(NOW), () => NOW);
  });
  const statusOf = (id: string) => {
    const p = store.snapshot().profiles.find((x) => x.id === id);
    return p && { status: p.approval_status, at: p.approved_at, by: p.approved_by };
  };

  async function seesNothing(v: Viewer) {
    expect(await store.listProjects(v)).toEqual([]);
    expect(await store.listMilestones(v)).toEqual([]);
    expect(await store.listRecentUpdates(v, 50)).toEqual([]);
    expect(await store.listRecentComments(v, 50)).toEqual([]);
    expect(await store.getProjectBundle(v, 'demo-p5')).toBeNull();
    await expect(store.postComment(v, 'demo-p5', 'let me in')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(store.approveMilestone(v, 'demo-m10')).rejects.toMatchObject({ code: 'forbidden' });
  }

  it('the seed has one pending sample user whose email matches a project', () => {
    expect(statusOf(DEMO_IDS.pending)).toEqual({ status: 'pending', at: null, by: null });
    expect(store.snapshot().projects.find((p) => p.id === 'demo-p5')?.client_email).toBe(pending.email);
  });

  it('a pending client sees no projects, milestones, updates or comments, and cannot comment or approve', async () => {
    await seesNothing(pending);
  });

  it('claiming approval or a role in the viewer object changes nothing (the stored profile decides)', async () => {
    const liar: Viewer = { ...pending, approval: 'approved' };
    await seesNothing(liar);
    const fakeAdmin: Viewer = { ...pending, role: 'admin', approval: 'approved' };
    await expect(store.listProfiles(fakeAdmin)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(store.setApproval(fakeAdmin, DEMO_IDS.pending, 'approved')).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('after admin approves, the same client sees exactly their own project', async () => {
    await store.setApproval(admin, DEMO_IDS.pending, 'approved');
    expect(statusOf(DEMO_IDS.pending)).toEqual({ status: 'approved', at: NOW.toISOString(), by: DEMO_IDS.admin });
    const list = await store.listProjects(pending);
    expect(list.map((p) => p.id)).toEqual(['demo-p5']);
    expect(list[0]).not.toHaveProperty('client_email');
    expect((await store.listMilestones(pending)).map((m) => m.id)).toEqual(['demo-m10']);
    expect((await store.listRecentUpdates(pending, 50)).map((u) => u.id)).toEqual(['demo-u7']);
    expect(await store.getProjectBundle(pending, 'demo-p1')).toBeNull();
    await store.postComment(pending, 'demo-p5', 'Thanks!');
    await expect(store.postComment(pending, 'demo-p1', 'hi')).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('a rejected client sees nothing; restoring puts them back to pending; stamps are cleared', async () => {
    await store.setApproval(admin, DEMO_IDS.pending, 'rejected');
    expect(statusOf(DEMO_IDS.pending)).toEqual({ status: 'rejected', at: null, by: null });
    await seesNothing(pending);
    await store.setApproval(admin, DEMO_IDS.pending, 'pending');
    expect(statusOf(DEMO_IDS.pending)).toEqual({ status: 'pending', at: null, by: null });
    await seesNothing(pending);
  });

  it('revoking an approved client takes effect at once', async () => {
    expect((await store.listProjects(DEMO_VIEWERS.client)).length).toBe(2);
    await store.setApproval(admin, DEMO_IDS.client, 'rejected');
    await seesNothing(DEMO_VIEWERS.client);
  });

  it('nobody but an admin can change approval, including their own', async () => {
    for (const [who, target] of [
      [pending, DEMO_IDS.pending],
      [DEMO_VIEWERS.client, DEMO_IDS.client],
      [DEMO_VIEWERS.client, DEMO_IDS.pending],
      [DEMO_VIEWERS.family, DEMO_IDS.pending],
    ] as const) {
      await expect(store.setApproval(who, target, 'approved')).rejects.toMatchObject({ code: 'forbidden' });
    }
    await expect(store.setApproval(VISITOR, DEMO_IDS.pending, 'approved')).rejects.toMatchObject({ code: 'forbidden' });
    expect(statusOf(DEMO_IDS.pending)?.status).toBe('pending');
    expect(statusOf(DEMO_IDS.client)?.status).toBe('approved');
  });

  it('rejects unknown statuses and users', async () => {
    await expect(store.setApproval(admin, DEMO_IDS.pending, 'maybe' as ApprovalStatus)).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(store.setApproval(admin, 'nobody', 'approved')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('admin always works, even if their approval_status were pending', async () => {
    const seed: DemoSeed = buildDemoSeed(NOW);
    seed.profiles.find((p) => p.id === DEMO_IDS.admin)!.approval_status = 'pending';
    const s = createDemoStore(seed, () => NOW);
    expect(await s.listProjects(admin)).toHaveLength(5);
    expect((await s.listContactMessages(admin)).length).toBeGreaterThan(0);
    await s.setApproval(admin, DEMO_IDS.pending, 'approved');
    expect(await s.listProjects(pending)).toHaveLength(1);
  });

  it('a pending family member sees nothing; once approved, everything', async () => {
    const seed: DemoSeed = buildDemoSeed(NOW);
    seed.profiles.find((p) => p.id === DEMO_IDS.family)!.approval_status = 'pending';
    const s = createDemoStore(seed, () => NOW);
    expect(await s.listProjects(DEMO_VIEWERS.family)).toEqual([]);
    expect(await s.listRecentUpdates(DEMO_VIEWERS.family, 50)).toEqual([]);
    await s.setApproval(admin, DEMO_IDS.family, 'approved');
    expect(await s.listProjects(DEMO_VIEWERS.family)).toHaveLength(5);
    expect((await s.listRecentUpdates(DEMO_VIEWERS.family, 50)).some((u) => u.visibility === 'internal')).toBe(true);
  });

  it('sign-up creates a pending client; a taken email is refused', async () => {
    const id = store.signUp('  New.Person@Example.com ', ' Newbie ');
    const profile = await store.getMyProfile(id);
    expect(profile).toMatchObject({
      email: 'new.person@example.com',
      display_name: 'Newbie',
      role: 'client',
      approval_status: 'pending',
      approved_at: null,
    });
    expect(() => store.signUp('CLIENT@example.com', '')).toThrow(/already registered/);
    const me: Viewer = { role: 'client', userId: id, email: 'new.person@example.com', displayName: null, approval: 'pending' };
    expect(await store.listProjects(me)).toEqual([]);
    const all = await store.listProfiles(admin);
    expect(countPending(all)).toBe(2);
  });

  it('watchProfile fires only when the watched row changes (like a filtered realtime channel)', async () => {
    let calls = 0;
    const off = store.watchProfile(DEMO_IDS.pending, () => calls++);
    await store.setApproval(admin, DEMO_IDS.client, 'rejected');
    await store.postUpdate(admin, 'demo-p1', 'unrelated', 'client');
    expect(calls).toBe(0);
    await store.setApproval(admin, DEMO_IDS.pending, 'approved');
    expect(calls).toBe(1);
    off();
    await store.setApproval(admin, DEMO_IDS.pending, 'rejected');
    expect(calls).toBe(1);
  });

  it('getMyProfile returns the row or null', async () => {
    expect((await store.getMyProfile(DEMO_IDS.pending))?.approval_status).toBe('pending');
    expect(await store.getMyProfile('nobody')).toBeNull();
  });
});
