import { getSupabase } from '../lib/supabase';
import type { StudioApi } from './api';
import { createDemoStore, type DemoStore } from './demoStore';
import { createSupabaseStore } from './supabaseStore';

let api: StudioApi | null = null;
let demo: DemoStore | null = null;

/** The data API for this build: Supabase if configured, otherwise the in-memory demo store. */
export function getApi(): StudioApi {
  if (!api) {
    const sb = getSupabase();
    if (sb) {
      api = createSupabaseStore(sb);
    } else {
      demo = createDemoStore();
      api = demo;
    }
  }
  return api;
}

/** The in-memory demo store (for demo-only actions such as sign-up), or null when Supabase is configured. */
export function getDemoStore(): DemoStore | null {
  getApi();
  return demo;
}

export { ApiError } from './api';
export type { StudioApi, ProjectPatch } from './api';
