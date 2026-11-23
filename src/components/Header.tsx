import { useEffect, useState, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/I18nProvider';
import type { Lang } from '../i18n/strings';
import { canUseDashboard } from '../lib/permissions';
import { prefersReducedMotion } from '../lib/motion';
import { applyTheme, useTheme, type ThemeChoice } from '../lib/theme';
import { isReplyOpen, useNow } from '../lib/replyHours';
import { AutoIcon, CloseIcon, MenuIcon, MoonIcon, SunIcon } from './Icons';

/** "Replying now" / "Off hours", from the reply window in California time. */
function ReplyStatus() {
  const { t } = useI18n();
  const open = isReplyOpen(useNow(30000));
  return (
    <span className="hdr-status" title={t('home.hours')}>
      <span className={`led ${open ? 'is-live' : 'is-off'}`} aria-hidden="true" />
      {open ? t('hud.open') : t('hud.closed')}
    </span>
  );
}

const NEXT_THEME: Record<ThemeChoice, ThemeChoice> = { dark: 'light', light: 'auto', auto: 'dark' };

type TransitionDoc = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void>; finished: Promise<void> };
};

/** Runs `update` inside a View Transition when the browser has one (and motion is allowed). */
function withTransition(update: () => void, kind: 'theme' | 'lang', from?: { x: number; y: number }) {
  const doc = document as TransitionDoc;
  if (!doc.startViewTransition || prefersReducedMotion()) {
    update();
    return;
  }
  const root = document.documentElement;
  root.dataset.vt = kind;
  const vt = doc.startViewTransition(() => flushSync(update));
  if (kind === 'theme' && from) {
    // The new theme grows out of the button as a circle.
    const r = Math.hypot(Math.max(from.x, innerWidth - from.x), Math.max(from.y, innerHeight - from.y));
    vt.ready
      .then(() =>
        root.animate(
          { clipPath: [`circle(0px at ${from.x}px ${from.y}px)`, `circle(${r}px at ${from.x}px ${from.y}px)`] },
          { duration: 650, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
        ),
      )
      .catch(() => undefined);
  }
  vt.finished.finally(() => delete root.dataset.vt).catch(() => undefined);
}

/** Each language is named in itself, so a visitor can find theirs whichever one is showing. */
const LANG_OPTIONS: { code: Lang; label: string; title: string; htmlLang: string }[] = [
  { code: 'zh', label: '中文', title: '中文', htmlLang: 'zh-CN' },
  { code: 'en', label: 'EN', title: 'English', htmlLang: 'en' },
];

export function Header() {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const { viewer, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setOpen(false), [location.pathname]);

  const signedIn = canUseDashboard(viewer.role);
  const ThemeIcon = theme === 'light' ? SunIcon : theme === 'dark' ? MoonIcon : AutoIcon;
  const themeLabel = `${t('theme.label')}: ${t(`theme.${theme}`)}`;

  const onTheme = (e: MouseEvent<HTMLButtonElement>) => {
    const next = NEXT_THEME[theme];
    const rect = e.currentTarget.getBoundingClientRect();
    withTransition(
      () => {
        applyTheme(next);
        setTheme(next);
      },
      'theme',
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    );
  };

  const onLang = (code: Lang) => {
    if (code !== lang) withTransition(() => setLang(code), 'lang');
  };

  const onSignOut = async () => {
    await signOut().catch(() => undefined);
    navigate('/');
  };

  return (
    <header className={`site-header${open ? ' menu-open' : ''}`}>
      <div className="container wide bar">
        <Link to="/" className="brand" aria-label={t('brand.name')}>
          <span className="brand-led" aria-hidden="true" />
          <span className="brand-text" aria-hidden="true">
            Jack<i>/</i>AI<i>/</i>Studio
          </span>
        </Link>

        <nav id="main-nav" className={`main-nav${open ? ' open' : ''}`} aria-label="Main">
          <NavLink to="/" end>
            <span className="nav-idx" aria-hidden="true">01</span>
            {t('nav.home')}
          </NavLink>
          <NavLink to="/showcase">
            <span className="nav-idx" aria-hidden="true">02</span>
            {t('nav.showcase')}
          </NavLink>
          <NavLink to="/contact">
            <span className="nav-idx" aria-hidden="true">03</span>
            {t('nav.contact')}
          </NavLink>
          {signedIn && (
            <NavLink to="/dashboard">
              <span className="nav-idx" aria-hidden="true">04</span>
              {t('nav.dashboard')}
            </NavLink>
          )}
          <span className="nav-auth">
            {signedIn ? (
              <button type="button" className="btn btn-ghost btn-small" onClick={onSignOut}>
                {t('nav.logout')}
              </button>
            ) : (
              <NavLink to="/login">{t('nav.login')}</NavLink>
            )}
          </span>
        </nav>

        <div className="header-tools">
          <ReplyStatus />
          <div className="lang-switch" role="group" aria-label={t('lang.choose')}>
            {LANG_OPTIONS.map((o) => (
              <button
                key={o.code}
                type="button"
                lang={o.htmlLang}
                title={o.title}
                aria-pressed={lang === o.code}
                onClick={() => onLang(o.code)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onTheme}
            aria-label={themeLabel}
            title={themeLabel}
          >
            <ThemeIcon width={18} height={18} />
          </button>
          <button
            type="button"
            className="icon-btn menu-btn"
            aria-expanded={open}
            aria-controls="main-nav"
            aria-label={t('nav.menu')}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <CloseIcon width={18} height={18} /> : <MenuIcon width={18} height={18} />}
          </button>
        </div>
      </div>
    </header>
  );
}
