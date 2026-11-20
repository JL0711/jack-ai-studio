import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { ConfirmButton, LoadState } from '../../components/DashboardParts';
import { useI18n } from '../../i18n/I18nProvider';
import type { StringKey } from '../../i18n/strings';
import { errorMessage, formatDate, formatDateTime } from '../../lib/format';
import { canManageUsers, groupByApproval } from '../../lib/permissions';
import { ROLES, type ApprovalStatus, type Profile, type Role } from '../../lib/types';
import { getApi } from '../../store';
import { useLiveData } from '../../store/useLiveData';

const FLASH: Record<ApprovalStatus, StringKey> = {
  approved: 'admin.approvedFlash',
  rejected: 'admin.rejectedFlash',
  pending: 'admin.restoredFlash',
};

/**
 * Admin-only: review new accounts (approve / reject / restore) and set each
 * user's role (client / family / admin). Approval is what lets a client see
 * the projects whose client email matches their sign-up email.
 */
export default function Users() {
  const { t, lang } = useI18n();
  const { viewer } = useAuth();
  const api = getApi();
  const allowed = canManageUsers(viewer.role);
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data, error: loadError, loading, reload } = useLiveData(
    () => (allowed ? api.listProfiles(viewer) : Promise.resolve([])),
    [viewer.userId, viewer.role],
  );

  if (!allowed) return <p className="empty">{t('dash.noAccess')}</p>;

  const groups = groupByApproval(data ?? []);
  const label = (p: Profile) => p.email ?? p.id;

  const showFlash = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(''), 2500);
  };

  const changeRole = async (userId: string, role: Role) => {
    setError('');
    try {
      await api.setRole(viewer, userId, role);
      showFlash(t('admin.roleSaved'));
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const changeApproval = async (p: Profile, status: ApprovalStatus) => {
    setError('');
    setBusyId(p.id);
    try {
      await api.setApproval(viewer, p.id, status);
      showFlash(t(FLASH[status], { email: label(p) }));
      reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="dash-head">
        <h1>{t('admin.users')}</h1>
        <span className="live-dot">{t('dash.live')}</span>
      </div>
      <p className="muted" style={{ marginTop: -8 }}>
        {t('admin.usersHint')}
      </p>
      {flash && (
        <p className="notice notice-success" role="status">
          {flash}
        </p>
      )}
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      <LoadState loading={loading && !data} error={loadError} onRetry={reload} />
      {data && data.length === 0 && <p className="empty">{t('admin.noUsers')}</p>}
      {data && data.length > 0 && (
        <div className="stack">
          {/* ---- 待审核 / Pending ---- */}
          <section className={`card${groups.pending.length > 0 ? ' card-attention' : ''}`} aria-labelledby="users-pending">
            <div className="card-head">
              <h2 id="users-pending">
                {t('admin.pendingTitle')}
                {groups.pending.length > 0 && <span className="count-pill">{groups.pending.length}</span>}
              </h2>
            </div>
            <p className="muted small" style={{ marginTop: 0 }}>
              {t('admin.pendingHint')}
            </p>
            {groups.pending.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                {t('admin.noPending')}
              </p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('auth.email')}</th>
                    <th>{t('auth.displayName')}</th>
                    <th>{t('admin.joined')}</th>
                    <th>{t('admin.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.pending.map((p) => (
                    <tr key={p.id} data-testid="pending-row">
                      <td data-label={t('auth.email')}>{p.email ?? '—'}</td>
                      <td data-label={t('auth.displayName')}>{p.display_name ?? '—'}</td>
                      <td data-label={t('admin.joined')}>{formatDateTime(p.created_at, lang)}</td>
                      <td data-label={t('admin.actions')}>
                        <div className="row approval-actions">
                          <ConfirmButton
                            label={t('admin.approve')}
                            question={t('admin.approveConfirm', { email: label(p) })}
                            onConfirm={() => changeApproval(p, 'approved')}
                            className="btn btn-primary btn-small"
                          />
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            disabled={busyId === p.id}
                            onClick={() => void changeApproval(p, 'rejected')}
                          >
                            {t('admin.reject')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* ---- Approved accounts and their roles ---- */}
          <section className="card" aria-labelledby="users-approved">
            <div className="card-head">
              <h2 id="users-approved">{t('admin.approvedTitle')}</h2>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('auth.email')}</th>
                  <th>{t('auth.displayName')}</th>
                  <th>{t('admin.role')}</th>
                  <th>{t('admin.joined')}</th>
                  <th>{t('admin.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {groups.approved.map((p) => {
                  const self = p.id === viewer.userId;
                  return (
                    <tr key={p.id}>
                      <td data-label={t('auth.email')}>
                        {p.email ?? '—'} {self && <span className="muted">{t('admin.you')}</span>}
                      </td>
                      <td data-label={t('auth.displayName')}>{p.display_name ?? '—'}</td>
                      <td data-label={t('admin.role')}>
                        <select
                          className="select"
                          style={{ minHeight: 36, width: 'auto' }}
                          value={p.role}
                          disabled={self}
                          title={self ? t('admin.cantChangeSelf') : undefined}
                          aria-label={`${t('admin.role')}: ${label(p)}`}
                          onChange={(e) => void changeRole(p.id, e.target.value as Role)}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {t(`role.${r}`)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td data-label={t('admin.joined')}>{formatDate(p.created_at, lang)}</td>
                      <td data-label={t('admin.actions')}>
                        {p.role === 'admin' ? (
                          <span className="muted small">{t('admin.adminAlwaysApproved')}</span>
                        ) : (
                          <ConfirmButton
                            label={t('admin.revoke')}
                            question={t('admin.revokeConfirm', { email: label(p) })}
                            onConfirm={() => changeApproval(p, 'rejected')}
                            className="btn btn-ghost btn-small"
                            confirmClassName="btn btn-danger btn-small"
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* ---- Rejected ---- */}
          {groups.rejected.length > 0 && (
            <section className="card" aria-labelledby="users-rejected">
              <div className="card-head">
                <h2 id="users-rejected">{t('admin.rejectedTitle')}</h2>
              </div>
              <p className="muted small" style={{ marginTop: 0 }}>
                {t('admin.rejectedHint')}
              </p>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('auth.email')}</th>
                    <th>{t('auth.displayName')}</th>
                    <th>{t('admin.joined')}</th>
                    <th>{t('admin.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.rejected.map((p) => (
                    <tr key={p.id} data-testid="rejected-row">
                      <td data-label={t('auth.email')}>{p.email ?? '—'}</td>
                      <td data-label={t('auth.displayName')}>{p.display_name ?? '—'}</td>
                      <td data-label={t('admin.joined')}>{formatDateTime(p.created_at, lang)}</td>
                      <td data-label={t('admin.actions')}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          disabled={busyId === p.id}
                          onClick={() => void changeApproval(p, 'pending')}
                        >
                          {t('admin.restore')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      )}
    </>
  );
}
