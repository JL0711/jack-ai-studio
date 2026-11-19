import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { LoadState } from '../../components/DashboardParts';
import { useI18n } from '../../i18n/I18nProvider';
import { errorMessage, formatDate } from '../../lib/format';
import { canManageUsers } from '../../lib/permissions';
import { ROLES, type Role } from '../../lib/types';
import { getApi } from '../../store';
import { useLiveData } from '../../store/useLiveData';

/** Admin-only: set each user's role (client / family / admin). */
export default function Users() {
  const { t, lang } = useI18n();
  const { viewer } = useAuth();
  const api = getApi();
  const allowed = canManageUsers(viewer.role);
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');
  const { data, error: loadError, loading, reload } = useLiveData(
    () => (allowed ? api.listProfiles(viewer) : Promise.resolve([])),
    [viewer.userId, viewer.role],
  );

  if (!allowed) return <p className="empty">{t('dash.noAccess')}</p>;

  const changeRole = async (userId: string, role: Role) => {
    setError('');
    try {
      await api.setRole(viewer, userId, role);
      setFlash(t('admin.roleSaved'));
      window.setTimeout(() => setFlash(''), 2500);
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <>
      <div className="dash-head">
        <h1>{t('admin.users')}</h1>
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
        <section className="card">
          <table className="table">
            <thead>
              <tr>
                <th>{t('auth.email')}</th>
                <th>{t('auth.displayName')}</th>
                <th>{t('admin.role')}</th>
                <th>{t('admin.joined')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => {
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
                        aria-label={`${t('admin.role')}: ${p.email ?? p.id}`}
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
