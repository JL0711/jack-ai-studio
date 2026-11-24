import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isDemo, siteBaseUrl } from '../lib/config';
import { buildViewer, normalizeEmail } from '../lib/permissions';
import { loadSupabase, mayHaveSession, onSupabaseReady } from '../lib/supabase';
import { VISITOR, type Profile, type Viewer } from '../lib/types';
import { getApi, getDemoStore } from '../store';
import { DEMO_VIEWERS, type DemoIdentity } from '../store/demoData';

const RECOVERY_FLAG = 'studio-recovery-requested';
const RECOVERY_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/** Captured before supabase-js strips ?code=… from the URL. */
const ARRIVED_WITH_AUTH_CODE =
  typeof window !== 'undefined' && new URL(window.location.href).searchParams.has('code');

export interface SignUpResult {
  /** True when Supabase still wants the email confirmed ("Confirm email" on); false when signed in already. */
  needsConfirmation: boolean;
}

/** Who signed in, before their profile row (role + approval) is known. */
interface Identity {
  userId: string;
  email: string | null;
  displayName: string | null;
}

const identityOf = (v: Viewer): Identity => ({ userId: v.userId as string, email: v.email, displayName: v.displayName });

interface AuthValue {
  viewer: Viewer;
  /** The session check has finished. */
  ready: boolean;
  /** The signed-in user's own profile row has loaded (always true when signed out). */
  profileReady: boolean;
  /** Loading the profile row failed and there is no earlier copy. */
  profileError: unknown;
  /** Re-reads the viewer's own profile row (role + approval). */
  refreshProfile: () => void;
  demo: boolean;
  /** Demo mode only: which sample identity the banner shows. */
  demoIdentity: DemoIdentity;
  setDemoIdentity: (identity: DemoIdentity) => void;
  /** True after the user arrived from a password-reset email. */
  recovery: boolean;
  clearRecovery: () => void;
  /** Error carried back from an email link (expired, already used, …). */
  linkError: string | null;
  clearLinkError: () => void;
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
  const [ready, setReady] = useState(isDemo);
  const [recovery, setRecovery] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [demoIdentity, setDemoIdentityState] = useState<DemoIdentity>('visitor');
  /** The account behind the demo 'pending' identity: the sample, or whoever signed up in this tab. */
  const [demoPending, setDemoPending] = useState<Identity>(() => identityOf(DEMO_VIEWERS.pending));
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<unknown>(null);
  const reloadProfile = useRef<() => void>(() => undefined);

  // ---- Supabase session tracking -----------------------------------------
  useEffect(() => {
    if (isDemo) return;
    const err = takeLinkErrorFromUrl();
    if (err) setLinkError(err);
    const markerRecovery = takeRecoveryMarker();

    let active = true;
    let stopListening: () => void = () => undefined;
    // Follow the session from the moment the client exists: now, when this browser
    // has one to restore, or later, when someone signs in or sends the contact form.
    const cancelWait = onSupabaseReady((sb) => {
      if (!active) return;
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
      stopListening = () => sub.subscription.unsubscribe();
    });

    if (mayHaveSession(ARRIVED_WITH_AUTH_CODE) || markerRecovery) {
      // A stored session or an email link to finish: load supabase-js right away.
      loadSupabase().catch(() => {
        // Could not download it: carry on signed out rather than loading forever.
        if (active) setReady(true);
      });
    } else {
      // First visit, or signed out: nothing to restore and nothing to download.
      setReady(true);
    }
    return () => {
      active = false;
      cancelWait();
      stopListening();
    };
  }, []);

  // ---- Who is signed in -----------------------------------------------------
  const user = session?.user;
  const metaName = (user?.user_metadata?.display_name as string | undefined) ?? null;
  const identity = useMemo<Identity | null>(() => {
    if (isDemo) {
      if (demoIdentity === 'visitor') return null;
      return demoIdentity === 'pending' ? demoPending : identityOf(DEMO_VIEWERS[demoIdentity]);
    }
    if (!user?.id) return null;
    return { userId: user.id, email: user.email ?? null, displayName: metaName };
  }, [demoIdentity, demoPending, user?.id, user?.email, metaName]); // eslint-disable-line react-hooks/exhaustive-deps
  const userId = identity?.userId ?? null;

  // ---- Their own profile row: role and approval, kept live -------------------
  // Read from the database (RLS: own row only), never from sign-up metadata.
  // A realtime watch on that row lets a pending user in as soon as Jack
  // approves, and applies a rejection or role change without a reload.
  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setLoadedFor(null);
      setProfileError(null);
      reloadProfile.current = () => undefined;
      return;
    }
    let active = true;
    let seq = 0;
    const api = getApi();
    const load = () => {
      // Realtime, focus and the waiting page's poll can overlap: only the latest answer counts.
      const id = ++seq;
      api.getMyProfile(userId).then(
        (row) => {
          if (!active || id !== seq) return;
          setProfile(row);
          setProfileError(null);
          setLoadedFor(userId);
        },
        (err: unknown) => {
          if (!active || id !== seq) return;
          setProfileError(err);
          setLoadedFor(userId);
        },
      );
    };
    reloadProfile.current = load;
    // Deferred so we never call Supabase inside the auth callback itself.
    const timer = setTimeout(load, 0);
    const unwatch = api.watchProfile(userId, load);
    return () => {
      active = false;
      clearTimeout(timer);
      unwatch();
    };
  }, [userId]);

  const ownProfile = profile && userId && profile.id === userId ? profile : null;
  const viewer = useMemo<Viewer>(() => (identity ? buildViewer(identity, ownProfile) : VISITOR), [identity, ownProfile]);
  const profileReady = !userId || loadedFor === userId;
  const refreshProfile = useCallback(() => reloadProfile.current(), []);

  // ---- Actions --------------------------------------------------------------
  const setDemoIdentity = useCallback((next: DemoIdentity) => {
    if (isDemo) setDemoIdentityState(next);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const sb = await loadSupabase();
    if (!sb) {
      setDemoIdentityState('client');
      return;
    }
    safeSet(RECOVERY_FLAG, null);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string): Promise<SignUpResult> => {
    const sb = await loadSupabase();
    const demoStore = getDemoStore();
    if (!sb) {
      if (!demoStore) return { needsConfirmation: true };
      // Demo: behaves like Supabase with "Confirm email" off. A pending account is
      // created and signed in at once; the banner's 待审核用户 identity now means it.
      const id = demoStore.signUp(email, displayName);
      setDemoPending({ userId: id, email: normalizeEmail(email), displayName: displayName.trim() || null });
      setDemoIdentityState('pending');
      return { needsConfirmation: false };
    }
    const { data, error } = await sb.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: siteBaseUrl(),
        data: displayName.trim() ? { display_name: displayName.trim() } : undefined,
      },
    });
    if (error) throw error;
    // "Confirm email" off: Supabase returns a session right away. Take it now so
    // the dashboard goes straight to the waiting page (no "please log in" flash).
    // "Confirm email" on: no session; the page asks the user to check their email.
    if (data.session) setSession(data.session);
    return { needsConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    const sb = await loadSupabase();
    setRecovery(false);
    if (!sb) {
      setDemoIdentityState('visitor');
      return;
    }
    const { error } = await sb.auth.signOut();
    if (error) throw error;
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const sb = await loadSupabase();
    if (!sb) return;
    safeSet(RECOVERY_FLAG, String(Date.now()));
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${siteBaseUrl()}?recovery=1`,
    });
    if (error) throw error;
  }, []);

  const resendConfirmation = useCallback(async (email: string) => {
    const sb = await loadSupabase();
    if (!sb) return;
    const { error } = await sb.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: siteBaseUrl() },
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const sb = await loadSupabase();
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
      profileReady,
      profileError: ownProfile ? null : profileError,
      refreshProfile,
      demo: isDemo,
      demoIdentity,
      setDemoIdentity,
      recovery,
      clearRecovery: () => {
        safeSet(RECOVERY_FLAG, null);
        setRecovery(false);
      },
      linkError,
      clearLinkError: () => setLinkError(null),
      signIn,
      signUp,
      signOut,
      resetPassword,
      resendConfirmation,
      updatePassword,
    }),
    [
      viewer,
      ready,
      profileReady,
      ownProfile,
      profileError,
      refreshProfile,
      demoIdentity,
      setDemoIdentity,
      recovery,
      linkError,
      signIn,
      signUp,
      signOut,
      resetPassword,
      resendConfirmation,
      updatePassword,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
