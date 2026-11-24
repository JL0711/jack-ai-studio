import { isDemo } from '../lib/config';
import { loadSupabase } from '../lib/supabase';
import type { StudioApi } from './api';
import { createDemoStore, type DemoStore } from './demoStore';
import { createLazySupabaseStore } from './lazySupabaseStore';

let api: StudioApi | null = null;
let demo: DemoStore | null = null;

/** The data API for this build: Supabase if configured, otherwise the in-memory demo store. */
export function getApi(): StudioApi {
  if (!api) {
    if (isDemo) {
      demo = createDemoStore();
      api = demo;
    } else {
      api = createLazySupabaseStore(loadSupabase);
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
