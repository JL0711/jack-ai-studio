import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseConfig } from './config';

let client: SupabaseClient | null = null;

/** Returns the shared Supabase client, or null in demo mode. */
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfig) return null;
  if (!client) {
    client = createClient(supabaseConfig.url, supabaseConfig.key, {
      auth: {
        // PKCE puts the one-time code in ?code=... (before the #), so it never
        // collides with HashRouter routes like #/dashboard.
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'jack-studio-auth',
      },
    });
  }
  return client;
}
