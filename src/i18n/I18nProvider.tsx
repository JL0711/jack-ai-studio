import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { detectLang, translate, type Lang, type StringKey } from './strings';

const STORAGE_KEY = 'studio-lang';

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggleLang: () => void;
  t: (key: StringKey, params?: Record<string, string | number>) => string;
  /** Picks the right half of a { zh, en } pair. */
  pick: <T>(pair: { zh: T; en: T }) => T;
}

const I18nContext = createContext<I18nValue | null>(null);

function initialLang(): Lang {
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

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      setLang,
      toggleLang: () => setLang(lang === 'zh' ? 'en' : 'zh'),
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
