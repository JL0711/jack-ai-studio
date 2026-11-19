// Role and permission helpers used by the UI and by the demo store.
// They mirror the Row Level Security rules in supabase/schema.sql.
// The UI uses them to decide what to show; the database is what actually
// enforces them in production.

import type {
  Milestone,
  Project,
  ProjectUpdate,
  Role,
  Viewer,
  ViewerRole,
} from './types';
import { ROLES } from './types';

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as string[]).includes(value);
}

export const isSignedIn = (v: Viewer) => v.role !== 'visitor' && !!v.userId;
export const isAdmin = (r: ViewerRole) => r === 'admin';
export const isFamily = (r: ViewerRole) => r === 'family';

/** Admin and family see every project; clients only their own. */
export const canSeeAllProjects = (r: ViewerRole) => r === 'admin' || r === 'family';
export const canEditProjects = (r: ViewerRole) => r === 'admin';
export const canSeeInternalUpdates = (r: ViewerRole) => r === 'admin' || r === 'family';
export const canSeeInbox = (r: ViewerRole) => r === 'admin';
export const canManageUsers = (r: ViewerRole) => r === 'admin';
export const canSeeClientEmail = (r: ViewerRole) => r === 'admin';
export const canUseDashboard = (r: ViewerRole) => r !== 'visitor';

/** True when the signed-in viewer's email is the project's linked client email. */
export function isProjectClient(project: Pick<Project, 'client_email'>, email: string | null): boolean {
  const mine = normalizeEmail(email);
  return mine !== '' && normalizeEmail(project.client_email) === mine;
}

export function canViewProject(viewer: Viewer, project: Pick<Project, 'client_email'>): boolean {
  if (!isSignedIn(viewer)) return false;
  if (canSeeAllProjects(viewer.role)) return true;
  return viewer.role === 'client' && isProjectClient(project, viewer.email);
}

export function canComment(viewer: Viewer, project: Pick<Project, 'client_email'>): boolean {
  if (!isSignedIn(viewer)) return false;
  if (viewer.role === 'admin') return true;
  return viewer.role === 'client' && isProjectClient(project, viewer.email);
}

/** Only the project's own client, only for a milestone that is 待验收, on a live project. */
export function canApproveMilestone(
  viewer: Viewer,
  project: Pick<Project, 'client_email' | 'archived'>,
  milestone: Pick<Milestone, 'status'>,
): boolean {
  return (
    isSignedIn(viewer) &&
    viewer.role === 'client' &&
    !project.archived &&
    isProjectClient(project, viewer.email) &&
    milestone.status === 'pending_approval'
  );
}

// ---- UI-side checks -------------------------------------------------------
// The browser never receives client_email for non-admins (column grant in the
// database, redactProject() in the demo). A client only ever receives their
// OWN projects, so "this project is visible to me" already means "it's mine".
// These helpers rely on that; the database re-checks everything anyway.

export function canCommentOnVisibleProject(role: ViewerRole): boolean {
  return role === 'admin' || role === 'client';
}

export function canApproveVisibleMilestone(
  role: ViewerRole,
  project: Pick<Project, 'archived'>,
  milestone: Pick<Milestone, 'status'>,
): boolean {
  return role === 'client' && !project.archived && milestone.status === 'pending_approval';
}

export function visibleUpdates<T extends Pick<ProjectUpdate, 'visibility'>>(role: ViewerRole, updates: T[]): T[] {
  if (canSeeInternalUpdates(role)) return updates;
  return updates.filter((u) => u.visibility === 'client');
}

/** Removes client_email for anyone who is not admin (family must never see it). */
export function redactProject<T extends Project>(role: ViewerRole, project: T): T {
  if (canSeeClientEmail(role)) return project;
  const copy = { ...project };
  delete copy.client_email;
  return copy;
}

/** Milestones that are not done and due within `days` days from `now` (inclusive), soonest first. */
export function upcomingMilestones<T extends Pick<Milestone, 'due_date' | 'status'>>(
  milestones: T[],
  now: Date,
  days = 14,
): T[] {
  const start = startOfDay(now).getTime();
  const end = start + days * 86_400_000;
  return milestones
    .filter((m) => m.status !== 'done' && m.due_date)
    .filter((m) => {
      const t = parseDateOnly(m.due_date as string).getTime();
      return t >= start && t <= end;
    })
    .sort((a, b) => (a.due_date as string).localeCompare(b.due_date as string));
}

/** Overdue = not done and due before today. */
export function isOverdue(m: Pick<Milestone, 'due_date' | 'status'>, now: Date): boolean {
  if (!m.due_date || m.status === 'done') return false;
  return parseDateOnly(m.due_date).getTime() < startOfDay(now).getTime();
}

export function clampProgress(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Parses 'YYYY-MM-DD' as a local date (not UTC midnight). */
export function parseDateOnly(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
