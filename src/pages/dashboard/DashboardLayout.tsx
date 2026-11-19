import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n/I18nProvider';
import { canManageUsers, canSeeInbox, canUseDashboard } from '../../lib/permissions';

/** Guards every /dashboard route and shows the admin sub-navigation. */
export default function DashboardLayout() {
  const { t } = useI18n();
  const { viewer, ready, demo } = useAuth();

  if (!ready) {
    return (
      <div className="page">
        <div className="container">
          <p className="muted">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!canUseDashboard(viewer.role)) {
    return (
      <div className="page">
        <div className="container narrow">
          <h1>{t('dash.title')}</h1>
          <div className="card stack">
            <p style={{ margin: 0 }}>{t('dash.needLogin')}</p>
            {demo && <p className="notice notice-demo">{t('auth.demoNote')}</p>}
            <div>
              <Link to="/login" className="btn btn-primary">
                {t('nav.login')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const showAdminNav = canSeeInbox(viewer.role) || canManageUsers(viewer.role);

  return (
    <div className="page">
      <div className="container">
        {showAdminNav && (
          <nav className="dash-nav" aria-label={t('nav.dashboard')}>
            <NavLink to="/dashboard" end>
              {t('admin.projects')}
            </NavLink>
            <NavLink to="/dashboard/inbox">{t('nav.inbox')}</NavLink>
            <NavLink to="/dashboard/users">{t('nav.users')}</NavLink>
          </nav>
        )}
        <Outlet />
      </div>
    </div>
  );
}
