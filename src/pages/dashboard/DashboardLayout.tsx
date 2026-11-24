import { Suspense } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { LoadState } from '../../components/DashboardParts';
import { useI18n } from '../../i18n/I18nProvider';
import { canManageUsers, canSeeInbox, canUseDashboard, countPending, isAwaitingApproval } from '../../lib/permissions';
import type { Viewer } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { getApi } from '../../store';
import { useLiveData } from '../../store/useLiveData';
import AwaitingApproval from './AwaitingApproval';

/** Guards every /dashboard route and shows the admin sub-navigation. */
export default function DashboardLayout() {
  const { t } = useI18n();
  const { viewer, ready, demo, profileReady, profileError, refreshProfile } = useAuth();
  useDocumentTitle(t('dash.title'));

  if (!ready || (canUseDashboard(viewer.role) && !profileReady)) {
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

  // Could not read our own profile row: we don't know whether the account is
  // approved, so show nothing but a retry.
  if (profileError) {
    return (
      <div className="page">
        <div className="container narrow">
          <LoadState loading={false} error={profileError} onRetry={refreshProfile} />
        </div>
      </div>
    );
  }

  // The approval gate: pending or rejected accounts never render (or query) the dashboard.
  if (isAwaitingApproval(viewer)) return <AwaitingApproval />;

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
            <UsersNavLink viewer={viewer} />
          </nav>
        )}
        {/* The inner pages come from the same on-demand file; this keeps the
            sub-navigation in place for the instant they take to mount. */}
        <Suspense fallback={<p className="muted route-loading">{t('common.loading')}</p>}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}

/** 用户 link with a live count of accounts waiting for approval (realtime on profiles + refresh on focus). */
function UsersNavLink({ viewer }: { viewer: Viewer }) {
  const { t } = useI18n();
  const api = getApi();
  const { data } = useLiveData(() => api.listProfiles(viewer), [viewer.userId, viewer.role]);
  const pending = data ? countPending(data) : 0;
  return (
    <NavLink to="/dashboard/users">
      {t('nav.users')}
      {pending > 0 && (
        <span className="count-pill" data-testid="pending-count">
          <span aria-hidden="true">{pending}</span>
          <span className="visually-hidden">{t('nav.pendingCount', { n: pending })}</span>
        </span>
      )}
    </NavLink>
  );
}
