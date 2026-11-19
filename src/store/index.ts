import { getSupabase } from '../lib/supabase';
import type { StudioApi } from './api';
import { createDemoStore } from './demoStore';
import { createSupabaseStore } from './supabaseStore';

let api: StudioApi | null = null;

/** The data API for this build: Supabase if configured, otherwise the in-memory demo store. */
export function getApi(): StudioApi {
  if (!api) {
    const sb = getSupabase();
    api = sb ? createSupabaseStore(sb) : createDemoStore();
  }
  return api;
}

export { ApiError } from './api';
export type { StudioApi, ProjectPatch } from './api';
