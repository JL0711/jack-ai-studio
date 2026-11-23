import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/** dark is the default look; auto follows the OS; light is the paper version. */
export type ThemeChoice = 'auto' | 'light' | 'dark';
// v2: the redesign starts everyone on the new dark default once.
const STORAGE_KEY = 'studio-theme-v2';

interface ThemeValue {
  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

function initialTheme(): ThemeChoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved;
  } catch {
    /* ignore */
  }
  return 'dark';
}

/** Puts the choice on <html> (CSS reads data-theme). Exported so a view transition can apply it at once. */
export function applyTheme(theme: ThemeChoice) {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  // Keep the browser UI colour in step with the page.
  const dark = theme === 'dark' || (theme === 'auto' && !window.matchMedia?.('(prefers-color-scheme: light)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b0c0e' : '#eeece6');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(initialTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      if (theme === 'dark') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme: setThemeState }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
