import { Suspense, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/I18nProvider';
import { DemoBanner } from './DemoBanner';
import { Footer } from './Footer';
import { GlobalFx } from './fx/GlobalFx';
import { Header } from './Header';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { RouteLoading } from './RouteLoading';

/** Fetches the on-demand pages in the background once the page has settled,
 *  so the login link (and, when signed in, the dashboard) open instantly. */
function usePrefetchPages(signedIn: boolean) {
  useEffect(() => {
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (saveData) return;
    const id = window.setTimeout(() => {
      void import('../pages/Login');
      if (signedIn) void import('../pages/dashboard');
    }, 3500);
    return () => window.clearTimeout(id);
  }, [signedIn]);
}

export function Layout() {
  const { t } = useI18n();
  const { viewer } = useAuth();
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  usePrefetchPages(viewer.userId !== null);

  // Each public page wipes in on navigation. The dashboard keeps one key so its
  // inner pages don't reload their data on every click.
  const routeKey = pathname.startsWith('/dashboard') ? '/dashboard' : pathname;
  // ...but not the page the visitor arrived on: the wipe would hide it for another
  // half second on top of loading (on a slow phone the text is ready at ~0.6 s).
  const firstKey = useRef(routeKey);
  const navigated = useRef(false);
  if (routeKey !== firstKey.current) navigated.current = true;

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
        <div key={routeKey} className={navigated.current ? 'route-fade' : undefined}>
          <RouteErrorBoundary>
            <Suspense fallback={<RouteLoading />}>
              <Outlet />
            </Suspense>
          </RouteErrorBoundary>
        </div>
      </main>
      <Footer />
    </div>
  );
}
