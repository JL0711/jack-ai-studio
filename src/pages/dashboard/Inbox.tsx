import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { LoadState } from '../../components/DashboardParts';
import { useI18n } from '../../i18n/I18nProvider';
import type { StringKey } from '../../i18n/strings';
import { formatDateTime } from '../../lib/format';
import { canSeeInbox } from '../../lib/permissions';
import { getApi } from '../../store';
import { useLiveData } from '../../store/useLiveData';

/** Admin-only contact inbox. */
export default function Inbox() {
  const { t, lang } = useI18n();
  const { viewer } = useAuth();
  const api = getApi();
  const [showHandled, setShowHandled] = useState(false);
  const allowed = canSeeInbox(viewer.role);
  const { data, error, loading, reload } = useLiveData(
    () => (allowed ? api.listContactMessages(viewer) : Promise.resolve([])),
    [viewer.userId, viewer.role],
  );

  if (!allowed) return <p className="empty">{t('dash.noAccess')}</p>;

  const messages = (data ?? []).filter((m) => showHandled || !m.handled);
  const label = (prefix: 'ptype' | 'budget', value: string | null) => {
    if (!value) return '—';
    const key = `${prefix}.${value}` as StringKey;
    const text = t(key);
    return text === key ? value : text;
  };

  return (
    <>
      <div className="dash-head">
        <h1>{t('admin.inbox')}</h1>
        <span className="live-dot">{t('dash.live')}</span>
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        <label className="checkbox">
          <input type="checkbox" checked={showHandled} onChange={(e) => setShowHandled(e.target.checked)} />
          {t('admin.showHandled')}
        </label>
      </div>
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data && messages.length === 0 && <p className="empty">{t('admin.inboxEmpty')}</p>}
      {messages.length > 0 && (
        <section className="card">
          {messages.map((m) => (
            <article key={m.id} className="message-card">
              <div className="row">
                <strong className="break-anywhere">{m.name}</strong>
                <span className={`badge ${m.handled ? 'badge-done' : 'badge-wip'}`}>
                  {m.handled ? t('admin.handled') : t('admin.unhandled')}
                </span>
                <span className="spacer" />
                <span className="small muted">{formatDateTime(m.created_at, lang)}</span>
              </div>
              <div className="meta-line" style={{ marginTop: 4 }}>
                <span className="break-anywhere">
                  {t('admin.contactVia')}{t('common.colon')}{m.contact}
                </span>
                <span>
                  {t('admin.type')}{t('common.colon')}{label('ptype', m.project_type)}
                </span>
                <span>
                  {t('admin.budget')}{t('common.colon')}{label('budget', m.budget)}
                </span>
              </div>
              <p className="message-body">{m.message}</p>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={async () => {
                  await api.setMessageHandled(viewer, m.id, !m.handled);
                  reload();
                }}
              >
                {m.handled ? t('admin.markUnhandled') : t('admin.markHandled')}
              </button>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
