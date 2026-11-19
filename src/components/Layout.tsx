import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';
import { DemoBanner } from './DemoBanner';
import { Footer } from './Footer';
import { Header } from './Header';

export function Layout() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="app">
      <a href="#main" className="skip-link" onClick={(e) => {
        e.preventDefault();
        document.getElementById('main')?.focus();
      }}>
        {t('nav.skip')}
      </a>
      <DemoBanner />
      <Header />
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
