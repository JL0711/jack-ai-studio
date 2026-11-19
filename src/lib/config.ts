// Reads the Supabase settings that Vite bakes in at build time.
// If either value is missing (or the URL is not a valid https URL),
// the whole site runs in demo mode with built-in sample data.

export interface SupabaseConfig {
  url: string;
  key: string;
}

export function readSupabaseConfig(env: Record<string, string | undefined>): SupabaseConfig | null {
  const url = (env.VITE_SUPABASE_URL ?? '').trim();
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      return null;
    }
  } catch {
    return null;
  }
  return { url: url.replace(/\/+$/, ''), key };
}

export const supabaseConfig = readSupabaseConfig(import.meta.env as unknown as Record<string, string | undefined>);
export const isDemo = supabaseConfig === null;

/**
 * Where Supabase should send people back to after they click a link in a
 * confirmation or password-reset email: the site origin + path, without the
 * #/route part (HashRouter-safe). Example: https://name.github.io/studio-site/
 */
export function siteBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin + window.location.pathname;
}
