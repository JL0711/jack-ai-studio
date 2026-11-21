import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { detectLang, langFromUrl, translate, type Lang, type StringKey } from './strings';

const STORAGE_KEY = 'studio-lang';

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: StringKey, params?: Record<string, string | number>) => string;
  /** Picks the right half of a { zh, en } pair. */
  pick: <T>(pair: { zh: T; en: T }) => T;
}

const I18nContext = createContext<I18nValue | null>(null);

function urlLang(): Lang | null {
  if (typeof window === 'undefined') return null;
  return langFromUrl(window.location.search, window.location.hash);
}

/** Removes ?lang=… from the address bar once it has been applied, so a later
 *  switch in the header is not undone by a reload. Keeps every other part. */
function stripLangParam() {
  const url = new URL(window.location.href);
  let changed = false;
  if (url.searchParams.has('lang')) {
    url.searchParams.delete('lang');
    changed = true;
  }
  const q = url.hash.indexOf('?');
  if (q >= 0) {
    const params = new URLSearchParams(url.hash.slice(q + 1));
    if (params.has('lang')) {
      params.delete('lang');
      const rest = params.toString();
      url.hash = url.hash.slice(0, q) + (rest ? `?${rest}` : '');
      changed = true;
    }
  }
  if (changed) window.history.replaceState(window.history.state, '', url.toString());
}

function initialLang(): Lang {
  const fromUrl = urlLang();
  if (fromUrl) return fromUrl;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    /* storage blocked: fall back to the browser language */
  }
  return detectLang(typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  // A ?lang= link wins over the saved choice: remember it, then tidy the URL.
  // Also on hashchange, for a link pasted into a tab that already has the site open.
  useEffect(() => {
    const apply = () => {
      const fromUrl = urlLang();
      if (!fromUrl) return;
      setLang(fromUrl);
      stripLangParam();
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, [setLang]);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      setLang,
      t: (key, params) => translate(lang, key, params),
      pick: (pair) => pair[lang],
    }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
