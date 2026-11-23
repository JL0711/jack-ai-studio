import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/I18nProvider';
import { canUseDashboard } from '../lib/permissions';

const SOURCE_URL = 'https://github.com/JL0711/jack-ai-studio';

export function Footer() {
  const { t } = useI18n();
  const { viewer } = useAuth();
  const signedIn = canUseDashboard(viewer.role);
  return (
    <footer className="site-footer">
      <div className="container wide footer-grid">
        <div className="footer-brand">
          <span className="brand" aria-hidden="true">
            <span className="brand-led" />
            <span className="brand-text">
              Jack<i>/</i>AI<i>/</i>Studio
            </span>
          </span>
          <p className="muted" style={{ margin: 0 }}>
            {t('footer.location')}
            <br />
            {t('home.fact.languagesValue')}
          </p>
        </div>
        <nav aria-label={t('footer.sitemap')}>
          <h2>{t('footer.sitemap')}</h2>
          <ul>
            <li>
              <Link to="/">{t('nav.home')}</Link>
            </li>
            <li>
              <Link to="/showcase">{t('nav.showcase')}</Link>
            </li>
            <li>
              <Link to="/contact">{t('nav.contact')}</Link>
            </li>
            <li>
              <Link to={signedIn ? '/dashboard' : '/login'}>{signedIn ? t('nav.dashboard') : t('nav.login')}</Link>
            </li>
          </ul>
        </nav>
        <div>
          <h2>{t('nav.contact')}</h2>
          <p style={{ margin: 0 }}>
            <Link to="/contact">{t('footer.contact')}</Link>
          </p>
          <p className="muted small" style={{ margin: '8px 0 0' }}>
            {t('home.hoursNote')}
          </p>
        </div>
        <div>
          <h2>{t('footer.buildTitle')}</h2>
          <p className="footer-build">
            <b>build</b> {__BUILD_SHA__} · {__BUILD_DATE__}
            <br />
            {t('footer.built')}
            <br />
            <a href={SOURCE_URL} target="_blank" rel="noreferrer">
              {t('footer.source')} ↗
            </a>
          </p>
        </div>
      </div>
      <div className="container wide footer-base">
        <span>© {new Date().getFullYear()} Jack AI Studio</span>
        <span>{t('footer.made')}</span>
      </div>
    </footer>
  );
}
