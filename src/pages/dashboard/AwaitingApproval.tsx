import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n/I18nProvider';

const POLL_MS = 60_000;

/**
 * Shown instead of the dashboard to a signed-in account that Jack has not
 * approved (or has rejected). It makes no project queries at all. The
 * AuthProvider watches the user's own profile row over realtime, so this page
 * turns into the dashboard as soon as Jack approves; re-checking on focus and
 * once a minute covers a dropped realtime connection.
 */
export default function AwaitingApproval() {
  const { t } = useI18n();
  const { viewer, signOut, refreshProfile, demo } = useAuth();
  const navigate = useNavigate();
  const rejected = viewer.approval === 'rejected';

  useEffect(() => {
    const onFocus = () => refreshProfile();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshProfile();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(refreshProfile, POLL_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [refreshProfile]);

  const onSignOut = async () => {
    await signOut().catch(() => undefined);
    navigate('/');
  };

  return (
    <div className="page">
      <div className="container narrow">
        <section className="card stack waiting-card" aria-labelledby="waiting-title">
          <span className={rejected ? 'badge badge-danger' : 'badge badge-in_progress'}>
            {t(rejected ? 'approval.rejected' : 'approval.pending')}
          </span>
          <h1 id="waiting-title">{t(rejected ? 'wait.rejectedTitle' : 'wait.title')}</h1>
          <p className="waiting-body" role="status">
            {t(rejected ? 'wait.rejectedBody' : 'wait.body')}
          </p>
          {viewer.email && <p className="muted small break-anywhere">{t('wait.email', { email: viewer.email })}</p>}
          {!rejected && <p className="live-dot">{t('wait.auto')}</p>}
          {demo && <p className="notice notice-demo">{t('wait.demo')}</p>}
          <div className="row">
            <button type="button" className="btn btn-secondary" onClick={() => void onSignOut()}>
              {t('nav.logout')}
            </button>
            <Link to="/contact" className="btn btn-ghost">
              {t('wait.contact')}
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
