import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isDemo, siteBaseUrl } from '../lib/config';
import { isRole } from '../lib/permissions';
import { getSupabase } from '../lib/supabase';
import { VISITOR, type Viewer, type ViewerRole } from '../lib/types';
import { DEMO_VIEWERS } from '../store/demoData';

const RECOVERY_FLAG = 'studio-recovery-requested';
const RECOVERY_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/** Captured before supabase-js strips ?code=… from the URL. */
const ARRIVED_WITH_AUTH_CODE =
  typeof window !== 'undefined' && new URL(window.location.href).searchParams.has('code');

export interface SignUpResult {
  needsConfirmation: boolean;
}

interface AuthValue {
  viewer: Viewer;
  ready: boolean;
  demo: boolean;
  /** True after the user arrived from a password-reset email. */
  recovery: boolean;
  clearRecovery: () => void;
  /** Error carried back from an email link (expired, already used, …). */
  linkError: string | null;
  clearLinkError: () => void;
  setDemoRole: (role: ViewerRole) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendConfirmation: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** Reads ?error_description=… or #error_description=… left by Supabase and removes it from the URL. */
function takeLinkErrorFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const hash = window.location.hash.replace(/^#/, '');
  const hashParams = hash.includes('error') && !hash.startsWith('/') ? new URLSearchParams(hash) : null;
  const message =
    url.searchParams.get('error_description') ||
    url.searchParams.get('error') ||
    hashParams?.get('error_description') ||
    hashParams?.get('error') ||
    null;
  if (!message) return null;
  ['error', 'error_code', 'error_description'].forEach((k) => url.searchParams.delete(k));
  url.hash = '#/login';
  window.history.replaceState(window.history.state, '', url.toString());
  return message.replace(/\+/g, ' ');
}

/** Detects ?recovery=1 (set on our reset redirect) and removes it from the URL. */
function takeRecoveryMarker(): boolean {
  if (typeof window === 'undefined') return false;
  const url = new URL(window.location.href);
  if (url.searchParams.get('recovery') !== '1') return false;
  url.searchParams.delete('recovery');
  window.history.replaceState(window.history.state, '', url.toString());
  return true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [viewer, setViewer] = useState<Viewer>(VISITOR);
  const [ready, setReady] = useState(isDemo);
  const [recovery, setRecovery] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  // ---- Supabase session tracking -----------------------------------------
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const err = takeLinkErrorFromUrl();
    if (err) setLinkError(err);
    const markerRecovery = takeRecoveryMarker();

    let active = true;
    sb.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) {
        // Arrived from the reset email: either our ?recovery=1 marker survived the
        // redirect, or this browser asked for a reset recently and came back with a code.
        const flag = Number(safeGet(RECOVERY_FLAG) || 0);
        const recentRequest = flag > 0 && Date.now() - flag < RECOVERY_MAX_AGE_MS;
        if (markerRecovery || (ARRIVED_WITH_AUTH_CODE && recentRequest)) setRecovery(true);
      }
      setReady(true);
    });

    const { data: sub } = sb.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
      setSession(next);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // ---- Profile (role) for the signed-in user ------------------------------
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const user = session?.user;
    if (!user) {
      setViewer(VISITOR);
      return;
    }
    let active = true;
    const base: Viewer = {
      role: 'client',
      userId: user.id,
      email: user.email ?? null,
      displayName: (user.user_metadata?.display_name as string | undefined) ?? null,
    };
    setViewer(base);
    // Deferred so we never call Supabase inside the auth callback itself.
    const timer = setTimeout(() => {
      sb.from('profiles')
        .select('role,display_name')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!active || !data) return;
          setViewer({
            ...base,
            role: isRole(data.role) ? data.role : 'client',
            displayName: (data.display_name as string | null) ?? base.displayName,
          });
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [session?.user?.id, session?.user?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Actions --------------------------------------------------------------
  const setDemoRole = useCallback((role: ViewerRole) => {
    if (!isDemo) return;
    setViewer(role === 'visitor' ? VISITOR : DEMO_VIEWERS[role]);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const sb = getSupabase();
    if (!sb) {
      setViewer(DEMO_VIEWERS.client);
      return;
    }
    safeSet(RECOVERY_FLAG, null);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string): Promise<SignUpResult> => {
    const sb = getSupabase();
    if (!sb) return { needsConfirmation: true };
    const { data, error } = await sb.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: siteBaseUrl(),
        data: displayName.trim() ? { display_name: displayName.trim() } : undefined,
      },
    });
    if (error) throw error;
    return { needsConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    const sb = getSupabase();
    setRecovery(false);
    if (!sb) {
      setViewer(VISITOR);
      return;
    }
    const { error } = await sb.auth.signOut();
    if (error) throw error;
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const sb = getSupabase();
    if (!sb) return;
    safeSet(RECOVERY_FLAG, String(Date.now()));
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${siteBaseUrl()}?recovery=1`,
    });
    if (error) throw error;
  }, []);

  const resendConfirmation = useCallback(async (email: string) => {
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: siteBaseUrl() },
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw error;
    safeSet(RECOVERY_FLAG, null);
    setRecovery(false);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      viewer,
      ready,
      demo: isDemo,
      recovery,
      clearRecovery: () => {
        safeSet(RECOVERY_FLAG, null);
        setRecovery(false);
      },
      linkError,
      clearLinkError: () => setLinkError(null),
      setDemoRole,
      signIn,
      signUp,
      signOut,
      resetPassword,
      resendConfirmation,
      updatePassword,
    }),
    [viewer, ready, recovery, linkError, setDemoRole, signIn, signUp, signOut, resetPassword, resendConfirmation, updatePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
