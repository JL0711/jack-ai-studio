// In-memory store used when no Supabase settings are configured.
// It enforces the same rules as the database's Row Level Security, using the
// helpers in lib/permissions.ts, so the demo behaves like the real thing.

import {
  canApproveMilestone,
  canComment,
  canEditProjects,
  canManageUsers,
  canSeeInbox,
  canViewProject,
  clampProgress,
  isRole,
  isSignedIn,
  normalizeEmail,
  redactProject,
  visibleUpdates,
} from '../lib/permissions';
import type { Comment, ContactInput, Milestone, Project, Viewer } from '../lib/types';
import { LIMITS, checkLength, cleanContact, validateContact } from '../lib/validation';
import { ApiError, type StudioApi } from './api';
import { buildDemoSeed, type DemoSeed } from './demoData';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

let counter = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export interface DemoStore extends StudioApi {
  /** Deep copy of the current data (for tests). */
  snapshot(): DemoSeed;
}

export function createDemoStore(seed: DemoSeed = buildDemoSeed(), clock: () => Date = () => new Date()): DemoStore {
  const db: DemoSeed = clone(seed);
  const listeners = new Set<() => void>();

  const nowIso = () => clock().toISOString();
  const notify = () => listeners.forEach((fn) => fn());

  const requireSignedIn = (viewer: Viewer) => {
    if (!isSignedIn(viewer)) throw new ApiError('forbidden', 'Not signed in');
  };
  const requireAdmin = (viewer: Viewer) => {
    requireSignedIn(viewer);
    if (!canEditProjects(viewer.role)) throw new ApiError('forbidden', 'Admin only');
  };
  const findProject = (id: string): Project => {
    const p = db.projects.find((x) => x.id === id);
    if (!p) throw new ApiError('not_found', 'Project not found');
    return p;
  };
  const visibleProjects = (viewer: Viewer) => db.projects.filter((p) => canViewProject(viewer, p));
  const visibleProjectIds = (viewer: Viewer) => new Set(visibleProjects(viewer).map((p) => p.id));
  const touch = (projectId: string) => {
    const p = db.projects.find((x) => x.id === projectId);
    if (p) p.updated_at = nowIso();
  };
  const ensureLength = (value: string, limit: { min: number; max: number }) => {
    const err = checkLength(value, limit);
    if (err) throw new ApiError('invalid', err);
  };

  const api: DemoStore = {
    mode: 'demo',

    async listProjects(viewer) {
      requireSignedIn(viewer);
      return visibleProjects(viewer)
        .map((p) => redactProject(viewer.role, clone(p)))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    },

    async getProjectBundle(viewer, id) {
      requireSignedIn(viewer);
      const project = db.projects.find((p) => p.id === id);
      if (!project || !canViewProject(viewer, project)) return null;
      return {
        project: redactProject(viewer.role, clone(project)),
        milestones: clone(db.milestones.filter((m) => m.project_id === id)).sort(sortMilestones),
        updates: visibleUpdates(viewer.role, clone(db.updates.filter((u) => u.project_id === id))).sort(byNewest),
        comments: clone(db.comments.filter((c) => c.project_id === id)).sort(byOldest),
      };
    },

    async listMilestones(viewer) {
      requireSignedIn(viewer);
      const ids = visibleProjectIds(viewer);
      return clone(db.milestones.filter((m) => ids.has(m.project_id))).sort(sortMilestones);
    },

    async listRecentUpdates(viewer, limit) {
      requireSignedIn(viewer);
      const ids = visibleProjectIds(viewer);
      return visibleUpdates(viewer.role, clone(db.updates.filter((u) => ids.has(u.project_id))))
        .sort(byNewest)
        .slice(0, limit);
    },

    async listRecentComments(viewer, limit) {
      requireSignedIn(viewer);
      const ids = visibleProjectIds(viewer);
      return clone(db.comments.filter((c) => ids.has(c.project_id))).sort(byNewest).slice(0, limit);
    },

    async createProject(viewer, input) {
      requireAdmin(viewer);
      ensureLength(input.title, LIMITS.projectTitle);
      const ts = nowIso();
      const project: Project = {
        id: newId('demo-p'),
        title: input.title.trim(),
        summary: input.summary.trim(),
        status: input.status,
        progress: clampProgress(input.progress),
        stage: input.stage.trim(),
        client_email: normalizeEmail(input.client_email) || null,
        archived: false,
        created_at: ts,
        updated_at: ts,
      };
      db.projects.push(project);
      notify();
      return project.id;
    },

    async updateProject(viewer, id, patch) {
      requireAdmin(viewer);
      const p = findProject(id);
      if (patch.title !== undefined) {
        ensureLength(patch.title, LIMITS.projectTitle);
        p.title = patch.title.trim();
      }
      if (patch.summary !== undefined) p.summary = patch.summary.trim();
      if (patch.stage !== undefined) p.stage = patch.stage.trim();
      if (patch.status !== undefined) p.status = patch.status;
      if (patch.progress !== undefined) p.progress = clampProgress(patch.progress);
      if (patch.client_email !== undefined) p.client_email = normalizeEmail(patch.client_email) || null;
      if (patch.archived !== undefined) p.archived = patch.archived;
      p.updated_at = nowIso();
      notify();
    },

    async saveMilestone(viewer, input) {
      requireAdmin(viewer);
      findProject(input.project_id);
      ensureLength(input.title, LIMITS.milestoneTitle);
      const existing = input.id ? db.milestones.find((m) => m.id === input.id) : undefined;
      if (input.id && !existing) throw new ApiError('not_found', 'Milestone not found');
      const fields = {
        project_id: input.project_id,
        title: input.title.trim(),
        due_date: input.due_date || null,
        status: input.status,
        payment_note: input.payment_note?.trim() || null,
        sort: Number.isFinite(input.sort) ? input.sort : 0,
      };
      if (existing) {
        const wasDone = existing.status === 'done';
        Object.assign(existing, fields);
        // Moving a milestone back out of "done" clears the old approval.
        if (wasDone && existing.status !== 'done') {
          existing.approved_by = null;
          existing.approved_at = null;
        }
      } else {
        const m: Milestone = { id: newId('demo-m'), approved_by: null, approved_at: null, ...fields };
        db.milestones.push(m);
      }
      touch(input.project_id);
      notify();
    },

    async deleteMilestone(viewer, id) {
      requireAdmin(viewer);
      const m = db.milestones.find((x) => x.id === id);
      if (!m) throw new ApiError('not_found', 'Milestone not found');
      db.milestones = db.milestones.filter((x) => x.id !== id);
      touch(m.project_id);
      notify();
    },

    async approveMilestone(viewer, id) {
      requireSignedIn(viewer);
      const m = db.milestones.find((x) => x.id === id);
      if (!m) throw new ApiError('not_found', 'Milestone not found');
      const p = findProject(m.project_id);
      if (!canApproveMilestone(viewer, p, { status: 'pending_approval' })) {
        throw new ApiError('forbidden', 'Only the project’s client can approve');
      }
      if (m.status !== 'pending_approval') throw new ApiError('invalid', 'Milestone is not awaiting approval');
      m.status = 'done';
      m.approved_by = viewer.userId;
      m.approved_at = nowIso();
      touch(p.id);
      notify();
    },

    async postUpdate(viewer, projectId, body, visibility) {
      requireAdmin(viewer);
      findProject(projectId);
      ensureLength(body, LIMITS.update);
      db.updates.push({
        id: newId('demo-u'),
        project_id: projectId,
        body: body.trim(),
        visibility: visibility === 'internal' ? 'internal' : 'client',
        created_by: viewer.userId,
        created_at: nowIso(),
      });
      touch(projectId);
      notify();
    },

    async deleteUpdate(viewer, id) {
      requireAdmin(viewer);
      db.updates = db.updates.filter((u) => u.id !== id);
      notify();
    },

    async postComment(viewer, projectId, body) {
      requireSignedIn(viewer);
      const p = findProject(projectId);
      if (!canComment(viewer, p)) throw new ApiError('forbidden', 'Cannot comment on this project');
      ensureLength(body, LIMITS.comment);
      const comment: Comment = {
        id: newId('demo-c'),
        project_id: projectId,
        author: viewer.userId,
        author_name: viewer.role === 'admin' ? 'Jack' : viewer.displayName || 'Client',
        body: body.trim(),
        created_at: nowIso(),
      };
      db.comments.push(comment);
      notify();
    },

    async submitContact(input: ContactInput) {
      const errors = validateContact(input);
      if (Object.keys(errors).length > 0) throw new ApiError('invalid', 'Invalid contact form');
      const clean = cleanContact(input);
      db.messages.push({ id: newId('demo-msg'), ...clean, handled: false, created_at: nowIso() });
      notify();
    },

    async listContactMessages(viewer) {
      requireSignedIn(viewer);
      if (!canSeeInbox(viewer.role)) throw new ApiError('forbidden', 'Admin only');
      return clone(db.messages).sort(byNewest);
    },

    async setMessageHandled(viewer, id, handled) {
      requireSignedIn(viewer);
      if (!canSeeInbox(viewer.role)) throw new ApiError('forbidden', 'Admin only');
      const msg = db.messages.find((m) => m.id === id);
      if (!msg) throw new ApiError('not_found', 'Message not found');
      msg.handled = handled;
      notify();
    },

    async listProfiles(viewer) {
      requireSignedIn(viewer);
      if (!canManageUsers(viewer.role)) throw new ApiError('forbidden', 'Admin only');
      return clone(db.profiles).sort((a, b) => a.created_at.localeCompare(b.created_at));
    },

    async setRole(viewer, userId, role) {
      requireSignedIn(viewer);
      // Same rule as the database trigger: only an admin may change a role.
      if (!canManageUsers(viewer.role)) throw new ApiError('forbidden', 'Only an admin can change roles');
      if (!isRole(role)) throw new ApiError('invalid', 'Unknown role');
      const profile = db.profiles.find((p) => p.id === userId);
      if (!profile) throw new ApiError('not_found', 'User not found');
      profile.role = role;
      notify();
    },

    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },

    snapshot() {
      return clone(db);
    },
  };

  return api;
}

function byNewest(a: { created_at: string }, b: { created_at: string }) {
  return b.created_at.localeCompare(a.created_at);
}
function byOldest(a: { created_at: string }, b: { created_at: string }) {
  return a.created_at.localeCompare(b.created_at);
}
function sortMilestones(a: Milestone, b: Milestone) {
  if (a.sort !== b.sort) return a.sort - b.sort;
  return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
}
