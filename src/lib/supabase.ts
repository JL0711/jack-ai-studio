import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseConfig } from './config';

/** supabase-js keeps the session (and, between asking for an email link and
 *  following it, the PKCE code verifier) in localStorage under this key. */
export const AUTH_STORAGE_KEY = 'jack-studio-auth';

let client: SupabaseClient | null = null;
let loading: Promise<SupabaseClient | null> | null = null;
const readyListeners = new Set<(sb: SupabaseClient) => void>();

/**
 * Loads supabase-js and returns the shared client; resolves to null in demo mode.
 * supabase-js is the biggest library on the site and a first-time visitor never
 * needs it, so it is fetched only on first use: a stored session at start-up,
 * signing in, or sending the contact form. A failed download can be retried.
 */
export function loadSupabase(): Promise<SupabaseClient | null> {
  const config = supabaseConfig;
  if (!config) return Promise.resolve(null);
  if (client) return Promise.resolve(client);
  if (!loading) {
    loading = import('@supabase/supabase-js').then(
      ({ createClient }) => {
        const created = createClient(config.url, config.key, {
          auth: {
            // PKCE puts the one-time code in ?code=... (before the #), so it never
            // collides with HashRouter routes like #/dashboard.
            flowType: 'pkce',
            detectSessionInUrl: true,
            persistSession: true,
            autoRefreshToken: true,
            storageKey: AUTH_STORAGE_KEY,
          },
        });
        client = created;
        readyListeners.forEach((fn) => fn(created));
        readyListeners.clear();
        return created;
      },
      (err: unknown) => {
        loading = null;
        throw err;
      },
    );
  }
  return loading;
}

/** Runs `fn` with the client as soon as it exists (now, if it already does). Returns a cancel function. */
export function onSupabaseReady(fn: (sb: SupabaseClient) => void): () => void {
  if (client) {
    fn(client);
    return () => undefined;
  }
  readyListeners.add(fn);
  return () => {
    readyListeners.delete(fn);
  };
}

/** True when this browser may be signed in already, or is coming back from an email link. */
export function mayHaveSession(arrivedWithAuthCode: boolean): boolean {
  if (arrivedWithAuthCode) return true;
  try {
    return (
      localStorage.getItem(AUTH_STORAGE_KEY) !== null || localStorage.getItem(`${AUTH_STORAGE_KEY}-code-verifier`) !== null
    );
  } catch {
    // Storage blocked: supabase-js could not have kept a session either.
    return false;
  }
}
