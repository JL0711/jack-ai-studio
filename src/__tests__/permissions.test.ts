import { describe, expect, it } from 'vitest';
import {
  canApproveMilestone,
  canApproveVisibleMilestone,
  canComment,
  canCommentOnVisibleProject,
  canEditProjects,
  canManageUsers,
  canSeeAllProjects,
  canSeeClientEmail,
  canSeeInbox,
  canSeeInternalUpdates,
  canUseDashboard,
  canViewProject,
  clampProgress,
  isOverdue,
  isProjectClient,
  redactProject,
  upcomingMilestones,
  visibleUpdates,
} from '../lib/permissions';
import type { ApprovalStatus, Project, Viewer } from '../lib/types';
import { VISITOR } from '../lib/types';

const project = (over: Partial<Project> = {}): Project => ({
  id: 'p1',
  title: 'P',
  summary: '',
  status: 'in_progress',
  progress: 10,
  stage: '',
  client_email: 'Client@Example.com',
  archived: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
});

const v = (role: Viewer['role'], email: string | null = null, approval: ApprovalStatus = 'approved'): Viewer => ({
  role,
  userId: role === 'visitor' ? null : `u-${role}`,
  email,
  displayName: null,
  approval,
});

describe('role capabilities', () => {
  it('only admin edits, manages users, sees the inbox and client emails', () => {
    for (const fn of [canEditProjects, canManageUsers, canSeeInbox, canSeeClientEmail]) {
      expect(fn('admin')).toBe(true);
      expect(fn('family')).toBe(false);
      expect(fn('client')).toBe(false);
      expect(fn('visitor')).toBe(false);
    }
  });

  it('admin and family see all projects and internal updates; clients do not', () => {
    expect(canSeeAllProjects('family')).toBe(true);
    expect(canSeeInternalUpdates('family')).toBe(true);
    expect(canSeeAllProjects('client')).toBe(false);
    expect(canSeeInternalUpdates('client')).toBe(false);
  });

  it('visitors cannot use the dashboard', () => {
    expect(canUseDashboard('visitor')).toBe(false);
    expect(canUseDashboard('client')).toBe(true);
  });
});

describe('project ownership', () => {
  it('matches the client email case-insensitively and ignores blanks', () => {
    expect(isProjectClient(project(), 'client@example.COM')).toBe(true);
    expect(isProjectClient(project(), 'other@example.com')).toBe(false);
    expect(isProjectClient(project({ client_email: null }), '')).toBe(false);
    expect(isProjectClient(project(), null)).toBe(false);
  });

  it('a client views only their own project; family views all; visitors none', () => {
    expect(canViewProject(v('client', 'client@example.com'), project())).toBe(true);
    expect(canViewProject(v('client', 'x@example.com'), project())).toBe(false);
    expect(canViewProject(v('family', 'f@example.com'), project())).toBe(true);
    expect(canViewProject(VISITOR, project())).toBe(false);
  });

  it('family cannot comment; owner client and admin can', () => {
    expect(canComment(v('family', 'f@example.com'), project())).toBe(false);
    expect(canComment(v('client', 'client@example.com'), project())).toBe(true);
    expect(canComment(v('client', 'x@example.com'), project())).toBe(false);
    expect(canComment(v('admin', 'a@example.com'), project())).toBe(true);
    expect(canCommentOnVisibleProject('family')).toBe(false);
    expect(canCommentOnVisibleProject('client')).toBe(true);
  });
});

describe('milestone approval', () => {
  const owner = v('client', 'client@example.com');
  it('only the owning client, only from pending_approval, only on live projects', () => {
    expect(canApproveMilestone(owner, project(), { status: 'pending_approval' })).toBe(true);
    expect(canApproveMilestone(owner, project(), { status: 'in_progress' })).toBe(false);
    expect(canApproveMilestone(owner, project(), { status: 'done' })).toBe(false);
    expect(canApproveMilestone(owner, project({ archived: true }), { status: 'pending_approval' })).toBe(false);
    expect(canApproveMilestone(v('client', 'x@example.com'), project(), { status: 'pending_approval' })).toBe(false);
    expect(canApproveMilestone(v('admin', 'client@example.com'), project(), { status: 'pending_approval' })).toBe(false);
    expect(canApproveMilestone(v('family', 'client@example.com'), project(), { status: 'pending_approval' })).toBe(false);
  });

  it('UI check relies on visibility, not on client_email', () => {
    const redacted = redactProject('client', project());
    expect(redacted.client_email).toBeUndefined();
    expect(canApproveVisibleMilestone('client', redacted, { status: 'pending_approval' })).toBe(true);
    expect(canApproveVisibleMilestone('family', redacted, { status: 'pending_approval' })).toBe(false);
  });
});

describe('data shaping', () => {
  it('hides internal updates from clients only', () => {
    const ups = [{ visibility: 'client' as const }, { visibility: 'internal' as const }];
    expect(visibleUpdates('client', ups)).toHaveLength(1);
    expect(visibleUpdates('family', ups)).toHaveLength(2);
    expect(visibleUpdates('admin', ups)).toHaveLength(2);
  });

  it('removes client_email for everyone except admin', () => {
    expect(redactProject('family', project())).not.toHaveProperty('client_email');
    expect(redactProject('admin', project()).client_email).toBe('Client@Example.com');
  });

  it('upcoming = not done and due within 14 days, soonest first', () => {
    const now = new Date(2026, 10, 19, 15, 0);
    const ms = [
      { id: 'a', due_date: '2026-11-25', status: 'in_progress' as const },
      { id: 'b', due_date: '2026-11-19', status: 'not_started' as const },
      { id: 'c', due_date: '2026-12-03', status: 'pending_approval' as const },
      { id: 'd', due_date: '2026-12-04', status: 'in_progress' as const },
      { id: 'e', due_date: '2026-11-20', status: 'done' as const },
      { id: 'f', due_date: '2026-11-18', status: 'in_progress' as const },
      { id: 'g', due_date: null, status: 'in_progress' as const },
    ];
    expect(upcomingMilestones(ms, now, 14).map((m) => m.id)).toEqual(['b', 'a', 'c']);
    expect(isOverdue(ms[5], now)).toBe(true);
    expect(isOverdue(ms[1], now)).toBe(false);
    expect(isOverdue(ms[4], now)).toBe(false);
  });

  it('clamps progress to 0–100', () => {
    expect(clampProgress(-5)).toBe(0);
    expect(clampProgress(140)).toBe(100);
    expect(clampProgress(Number.NaN)).toBe(0);
    expect(clampProgress(42.6)).toBe(43);
  });
});
