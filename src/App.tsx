import { useEffect } from 'react';
import { HashRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { Layout } from './components/Layout';
import { I18nProvider } from './i18n/I18nProvider';
import { ThemeProvider } from './lib/theme';
import Contact from './pages/Contact';
import DashboardHome from './pages/dashboard/DashboardHome';
import DashboardLayout from './pages/dashboard/DashboardLayout';
import Inbox from './pages/dashboard/Inbox';
import ProjectPage from './pages/dashboard/ProjectPage';
import Users from './pages/dashboard/Users';
import Home from './pages/Home';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import ResetPassword from './pages/ResetPassword';
import Showcase from './pages/Showcase';
import ShowcaseDetail from './pages/ShowcaseDetail';

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
