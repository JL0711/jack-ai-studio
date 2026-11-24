// The Supabase store, created on first use: supabase-js is downloaded the first
// time any data call needs it (see lib/supabase.ts), not with the page.

import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, type StudioApi } from './api';
import { createSupabaseStore } from './supabaseStore';

export function createLazySupabaseStore(load: () => Promise<SupabaseClient | null>): StudioApi {
  let store: Promise<StudioApi> | null = null;
  const ready = (): Promise<StudioApi> => {
    if (!store) {
      store = load().then(
        (sb) => {
          if (!sb) throw new Error('Supabase is not configured');
          return createSupabaseStore(sb);
        },
        (err: unknown) => {
          // The library itself failed to download (offline, blocked, flaky network):
          // report it like any request that got no answer, and try again next time.
          store = null;
          throw new ApiError('network', err instanceof Error ? err.message : String(err));
        },
      );
    }
    return store;
  };

  /** Starts a realtime watch once the store exists; the returned function stops it either way. */
  const watch = (start: (s: StudioApi) => () => void): (() => void) => {
    let stopped = false;
    let stop: (() => void) | null = null;
    ready().then(
      (s) => {
        if (!stopped) stop = start(s);
      },
      () => undefined,
    );
    return () => {
      stopped = true;
      stop?.();
    };
  };

  return {
    mode: 'supabase',
    listProjects: (viewer) => ready().then((s) => s.listProjects(viewer)),
    getProjectBundle: (viewer, id) => ready().then((s) => s.getProjectBundle(viewer, id)),
    listMilestones: (viewer) => ready().then((s) => s.listMilestones(viewer)),
    listRecentUpdates: (viewer, limit) => ready().then((s) => s.listRecentUpdates(viewer, limit)),
    listRecentComments: (viewer, limit) => ready().then((s) => s.listRecentComments(viewer, limit)),
    createProject: (viewer, input) => ready().then((s) => s.createProject(viewer, input)),
    updateProject: (viewer, id, patch) => ready().then((s) => s.updateProject(viewer, id, patch)),
    saveMilestone: (viewer, input) => ready().then((s) => s.saveMilestone(viewer, input)),
    deleteMilestone: (viewer, id) => ready().then((s) => s.deleteMilestone(viewer, id)),
    approveMilestone: (viewer, id) => ready().then((s) => s.approveMilestone(viewer, id)),
    postUpdate: (viewer, projectId, body, visibility) =>
      ready().then((s) => s.postUpdate(viewer, projectId, body, visibility)),
    deleteUpdate: (viewer, id) => ready().then((s) => s.deleteUpdate(viewer, id)),
    postComment: (viewer, projectId, body) => ready().then((s) => s.postComment(viewer, projectId, body)),
    submitContact: (input) => ready().then((s) => s.submitContact(input)),
    listContactMessages: (viewer) => ready().then((s) => s.listContactMessages(viewer)),
    setMessageHandled: (viewer, id, handled) => ready().then((s) => s.setMessageHandled(viewer, id, handled)),
    listProfiles: (viewer) => ready().then((s) => s.listProfiles(viewer)),
    setRole: (viewer, userId, role) => ready().then((s) => s.setRole(viewer, userId, role)),
    setApproval: (viewer, userId, status) => ready().then((s) => s.setApproval(viewer, userId, status)),
    getMyProfile: (userId) => ready().then((s) => s.getMyProfile(userId)),
    watchProfile: (userId, onChange) => watch((s) => s.watchProfile(userId, onChange)),
    subscribe: (onChange) => watch((s) => s.subscribe(onChange)),
  };
}
