import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/I18nProvider';
import type { Lang } from '../i18n/strings';
import { canUseDashboard } from '../lib/permissions';
import { useTheme, type ThemeChoice } from '../lib/theme';
import { AutoIcon, CloseIcon, MenuIcon, MoonIcon, SunIcon } from './Icons';

const NEXT_THEME: Record<ThemeChoice, ThemeChoice> = { auto: 'light', light: 'dark', dark: 'auto' };

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

  const onSignOut = async () => {
    await signOut().catch(() => undefined);
    navigate('/');
  };

  return (
    <header className="site-header">
      <div className="container bar">
        <Link to="/" className="brand" aria-label={t('brand.name')}>
          <span className="brand-mark" aria-hidden="true">
            J
          </span>
          <span className="brand-text">{t('brand.name')}</span>
        </Link>

        <nav id="main-nav" className={`main-nav${open ? ' open' : ''}`} aria-label="Main">
          <NavLink to="/" end>
            {t('nav.home')}
          </NavLink>
          <NavLink to="/showcase">{t('nav.showcase')}</NavLink>
          <NavLink to="/contact">{t('nav.contact')}</NavLink>
          {signedIn && <NavLink to="/dashboard">{t('nav.dashboard')}</NavLink>}
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
          <div className="lang-switch" role="group" aria-label={t('lang.choose')}>
            {LANG_OPTIONS.map((o) => (
              <button
                key={o.code}
                type="button"
                lang={o.htmlLang}
                title={o.title}
                aria-pressed={lang === o.code}
                onClick={() => setLang(o.code)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setTheme(NEXT_THEME[theme])}
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
