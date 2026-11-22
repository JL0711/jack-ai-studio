// Supabase implementation. Row Level Security in supabase/schema.sql decides
// what each user can read and write; this file only shapes the queries.
//
// Note on projects.client_email: the column is NOT readable through the normal
// table API (column-level grant), so non-admin queries list columns explicitly
// and admins read projects through the admin_projects() RPC instead.

import type { SupabaseClient } from '@supabase/supabase-js';
import { canSeeClientEmail, clampProgress, normalizeEmail } from '../lib/permissions';
import type { Comment, ContactMessage, Milestone, Profile, Project, ProjectUpdate } from '../lib/types';
import { cleanContact } from '../lib/validation';
import { ApiError, type StudioApi } from './api';

/** Every projects column except client_email. */
export const PROJECT_COLUMNS = 'id,title,summary,status,progress,stage,archived,created_at,updated_at';
const MILESTONE_COLUMNS = 'id,project_id,title,due_date,status,payment_note,sort,approved_by,approved_at';
const UPDATE_COLUMNS = 'id,project_id,body,visibility,created_by,created_at';
const COMMENT_COLUMNS = 'id,project_id,author,author_name,body,created_at';
const MESSAGE_COLUMNS = 'id,name,contact,project_type,budget,message,handled,created_at';
const PROFILE_COLUMNS = 'id,email,display_name,role,approval_status,approved_at,approved_by,created_at';

// profiles is included so the admin's Users page and pending badge update when
// someone signs up. RLS limits everyone else to events for their own row.
const LIVE_TABLES = ['projects', 'milestones', 'updates', 'comments', 'contact_messages', 'profiles'] as const;

function check<T>(res: { data: T; error: { message: string; code?: string } | null; status?: number }): T {
  if (res.error) {
    // supabase-js reports a request that never got an HTTP answer as status 0.
    if (res.status === 0) throw new ApiError('network', res.error.message);
    const code = res.error.code;
    if (code === '42501') throw new ApiError('forbidden', res.error.message);
    if (code === 'P0002' || code === 'PGRST116') throw new ApiError('not_found', res.error.message);
    if (code === '22023' || code === '23514') throw new ApiError('invalid', res.error.message);
    throw new Error(res.error.message);
  }
  return res.data;
}

const CONTACT_TIMEOUT_MS = 15_000;

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export function createSupabaseStore(sb: SupabaseClient): StudioApi {
  return {
    mode: 'supabase',

    async listProjects(viewer) {
      if (canSeeClientEmail(viewer.role)) {
        const rows = check(await sb.rpc('admin_projects').order('updated_at', { ascending: false }));
        return (rows ?? []) as Project[];
      }
      const rows = check(await sb.from('projects').select(PROJECT_COLUMNS).order('updated_at', { ascending: false }));
      return (rows ?? []) as Project[];
    },

    async getProjectBundle(viewer, id) {
      const projectQuery = canSeeClientEmail(viewer.role)
        ? sb.rpc('admin_projects').eq('id', id).maybeSingle()
        : sb.from('projects').select(PROJECT_COLUMNS).eq('id', id).maybeSingle();
      const [p, m, u, c] = await Promise.all([
        projectQuery,
        sb.from('milestones').select(MILESTONE_COLUMNS).eq('project_id', id).order('sort').order('due_date', { nullsFirst: false }),
        sb.from('updates').select(UPDATE_COLUMNS).eq('project_id', id).order('created_at', { ascending: false }),
        sb.from('comments').select(COMMENT_COLUMNS).eq('project_id', id).order('created_at'),
      ]);
      const project = check(p) as Project | null;
      if (!project) return null;
      return {
        project,
        milestones: (check(m) ?? []) as Milestone[],
        updates: (check(u) ?? []) as ProjectUpdate[],
        comments: (check(c) ?? []) as Comment[],
      };
    },

    async listMilestones() {
      const rows = check(await sb.from('milestones').select(MILESTONE_COLUMNS).order('due_date', { nullsFirst: false }));
      return (rows ?? []) as Milestone[];
    },

    async listRecentUpdates(_viewer, limit) {
      const rows = check(
        await sb.from('updates').select(UPDATE_COLUMNS).order('created_at', { ascending: false }).limit(limit),
      );
      return (rows ?? []) as ProjectUpdate[];
    },

    async listRecentComments(_viewer, limit) {
      const rows = check(
        await sb.from('comments').select(COMMENT_COLUMNS).order('created_at', { ascending: false }).limit(limit),
      );
      return (rows ?? []) as Comment[];
    },

    async createProject(_viewer, input) {
      // The id is generated here so the insert needs no RETURNING clause
      // (RETURNING * would touch client_email, which is not selectable).
      const id = crypto.randomUUID();
      check(
        await sb.from('projects').insert({
          id,
          title: input.title.trim(),
          summary: input.summary.trim(),
          status: input.status,
          progress: clampProgress(input.progress),
          stage: input.stage.trim(),
          client_email: normalizeEmail(input.client_email) || null,
        }),
      );
      return id;
    },

    async updateProject(_viewer, id, patch) {
      const row: Record<string, unknown> = {};
      if (patch.title !== undefined) row.title = patch.title.trim();
      if (patch.summary !== undefined) row.summary = patch.summary.trim();
      if (patch.stage !== undefined) row.stage = patch.stage.trim();
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.progress !== undefined) row.progress = clampProgress(patch.progress);
      if (patch.client_email !== undefined) row.client_email = normalizeEmail(patch.client_email) || null;
      if (patch.archived !== undefined) row.archived = patch.archived;
      check(await sb.from('projects').update(row).eq('id', id));
    },

    async saveMilestone(_viewer, input) {
      const row = {
        project_id: input.project_id,
        title: input.title.trim(),
        due_date: input.due_date || null,
        status: input.status,
        payment_note: input.payment_note?.trim() || null,
        sort: Number.isFinite(input.sort) ? input.sort : 0,
      };
      if (input.id) check(await sb.from('milestones').update(row).eq('id', input.id));
      else check(await sb.from('milestones').insert(row));
    },

    async deleteMilestone(_viewer, id) {
      check(await sb.from('milestones').delete().eq('id', id));
    },

    async approveMilestone(_viewer, id) {
      check(await sb.rpc('approve_milestone', { milestone_id: id }));
    },

    async postUpdate(_viewer, projectId, body, visibility) {
      check(await sb.from('updates').insert({ project_id: projectId, body: body.trim(), visibility }));
    },

    async deleteUpdate(_viewer, id) {
      check(await sb.from('updates').delete().eq('id', id));
    },

    async postComment(_viewer, projectId, body) {
      check(await sb.from('comments').insert({ project_id: projectId, body: body.trim() }));
    },

    async submitContact(input) {
      // No .select() afterwards: anonymous visitors may insert but never read.
      // The time limit matters where Supabase is slow or unreachable (parts of
      // mainland China): the form can then offer WeChat instead of hanging.
      check(
        await sb
          .from('contact_messages')
          .insert(cleanContact(input))
          .abortSignal(timeoutSignal(CONTACT_TIMEOUT_MS)),
      );
    },

    async listContactMessages() {
      const rows = check(
        await sb.from('contact_messages').select(MESSAGE_COLUMNS).order('created_at', { ascending: false }),
      );
      return (rows ?? []) as ContactMessage[];
    },

    async setMessageHandled(_viewer, id, handled) {
      check(await sb.from('contact_messages').update({ handled }).eq('id', id));
    },

    async listProfiles() {
      const rows = check(await sb.from('profiles').select(PROFILE_COLUMNS).order('created_at'));
      return (rows ?? []) as Profile[];
    },

    async setRole(_viewer, userId, role) {
      check(await sb.from('profiles').update({ role }).eq('id', userId));
    },

    async setApproval(_viewer, userId, status) {
      // A plain update: the profiles_update policy lets only an admin reach other
      // rows, and the protect_profile_fields trigger rejects approval changes by
      // anyone else and stamps approved_at / approved_by itself.
      const rows = check(await sb.from('profiles').update({ approval_status: status }).eq('id', userId).select('id'));
      if (!rows || rows.length !== 1) throw new ApiError('forbidden', 'Could not update this account');
    },

    async getMyProfile(userId) {
      const row = check(await sb.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle());
      return (row ?? null) as Profile | null;
    },

    watchProfile(userId, onChange) {
      // Own row only (RLS would not deliver anyone else's anyway).
      const channel = sb.channel(`studio-profile-${userId}-${Math.random().toString(36).slice(2)}`);
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, () =>
        onChange(),
      );
      channel.subscribe();
      return () => {
        void sb.removeChannel(channel);
      };
    },

    subscribe(onChange) {
      // Realtime respects RLS: each user only receives rows they may read.
      const channel = sb.channel(`studio-live-${Math.random().toString(36).slice(2)}`);
      for (const table of LIVE_TABLES) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange());
      }
      channel.subscribe();
      return () => {
        void sb.removeChannel(channel);
      };
    },
  };
}
