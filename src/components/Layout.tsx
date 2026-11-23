import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';
import { DemoBanner } from './DemoBanner';
import { Footer } from './Footer';
import { GlobalFx } from './fx/GlobalFx';
import { Header } from './Header';

export function Layout() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // Each public page wipes in on navigation. The dashboard keeps one key so its
  // inner pages don't reload their data on every click.
  const routeKey = pathname.startsWith('/dashboard') ? '/dashboard' : pathname;

  return (
    <div className="app">
      <GlobalFx />
      <a href="#main" className="skip-link" onClick={(e) => {
        e.preventDefault();
        document.getElementById('main')?.focus();
      }}>
        {t('nav.skip')}
      </a>
      <DemoBanner />
      <Header />
      <main id="main" tabIndex={-1}>
        <div key={routeKey} className="route-fade">
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  );
}
