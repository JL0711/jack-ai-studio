import { lazy, useEffect, type ComponentType } from 'react';
import { HashRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { Layout } from './components/Layout';
import { I18nProvider } from './i18n/I18nProvider';
import { ThemeProvider } from './lib/theme';
import Contact from './pages/Contact';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import Showcase from './pages/Showcase';
import ShowcaseDetail from './pages/ShowcaseDetail';

// Login and everything behind it are fetched only when someone opens them
// (Layout.tsx shows a loading line meanwhile). The public pages stay in the main file.
type DashboardModule = typeof import('./pages/dashboard');
const loadDashboard = () => import('./pages/dashboard');
const fromDashboard = (pick: (m: DashboardModule) => ComponentType) =>
  lazy(() => loadDashboard().then((m) => ({ default: pick(m) })));
const DashboardLayout = fromDashboard((m) => m.DashboardLayout);
const DashboardHome = fromDashboard((m) => m.DashboardHome);
const ProjectPage = fromDashboard((m) => m.ProjectPage);
const Inbox = fromDashboard((m) => m.Inbox);
const Users = fromDashboard((m) => m.Users);
const Login = lazy(() => import('./pages/Login'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

/** After a password-reset email link, send the user to the "set new password" page. */
function RecoveryRedirect() {
  const { recovery } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    if (recovery && pathname !== '/reset-password') navigate('/reset-password', { replace: true });
  }, [recovery, pathname, navigate]);
  return null;
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          {/* HashRouter: GitHub Pages has no SPA fallback, so routes live after the #. */}
          <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <RecoveryRedirect />
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="showcase" element={<Showcase />} />
                <Route path="showcase/:slug" element={<ShowcaseDetail />} />
                <Route path="contact" element={<Contact />} />
                <Route path="login" element={<Login />} />
                <Route path="reset-password" element={<ResetPassword />} />
                <Route path="dashboard" element={<DashboardLayout />}>
                  <Route index element={<DashboardHome />} />
                  <Route path="p/:id" element={<ProjectPage />} />
                  <Route path="inbox" element={<Inbox />} />
                  <Route path="users" element={<Users />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </HashRouter>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
