import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { ProjectStatusBadge } from '../../components/Badges';
import { LoadState, ProjectForm, UpdatesTimeline } from '../../components/DashboardParts';
import { ProgressBar } from '../../components/ProgressBar';
import { useI18n } from '../../i18n/I18nProvider';
import { formatDate, formatDateTime } from '../../lib/format';
import { canSeeClientEmail, isOverdue, upcomingMilestones } from '../../lib/permissions';
import type { Milestone, Project, Viewer } from '../../lib/types';
import { getApi } from '../../store';
import { useLiveData } from '../../store/useLiveData';

export default function DashboardHome() {
  const { viewer } = useAuth();
  if (viewer.role === 'admin') return <AdminHome viewer={viewer} />;
  if (viewer.role === 'family') return <FamilyHome viewer={viewer} />;
  return <ClientHome viewer={viewer} />;
}

/* ---------- a project summary row, shared by all roles ---------- */

function ProjectSummary({
  project,
  milestones,
  viewer,
}: {
  project: Project;
  milestones: Milestone[];
  viewer: Viewer;
}) {
  const { t, lang } = useI18n();
  const mine = milestones.filter((m) => m.project_id === project.id);
  const waiting = mine.filter((m) => m.status === 'pending_approval').length;
  const next = mine
    .filter((m) => m.status !== 'done' && m.due_date)
    .sort((a, b) => (a.due_date as string).localeCompare(b.due_date as string))[0];
  return (
    <article className="card project-row">
      <div className="project-row-head">
        <h3>
          <Link to={`/dashboard/p/${project.id}`}>{project.title}</Link>
        </h3>
        <ProjectStatusBadge status={project.status} />
        {project.archived && <span className="badge plain">{t('dash.archived')}</span>}
        {waiting > 0 && viewer.role === 'client' && !project.archived && (
          <span className="badge badge-pending_approval">{t('dash.awaitingYou')}</span>
        )}
      </div>
      <ProgressBar value={project.progress} label={`${t('dash.progress')}: ${project.title}`} />
      <div className="meta-line">
        {project.stage && (
          <span>
            {t('dash.stage')}{t('common.colon')}{project.stage}
          </span>
        )}
        {next && (
          <span className={isOverdue(next, new Date()) ? 'overdue' : undefined}>
            {next.title} · {t('dash.due', { date: formatDate(next.due_date, lang) })}
          </span>
        )}
        {canSeeClientEmail(viewer.role) && (
          <span className="break-anywhere">
            {t('dash.client')}{t('common.colon')}{project.client_email || t('admin.noClient')}
          </span>
        )}
        <span>{t('dash.updatedAt', { date: formatDate(project.updated_at, lang) })}</span>
      </div>
    </article>
  );
}

/* ---------- client ---------- */

function ClientHome({ viewer }: { viewer: Viewer }) {
  const { t } = useI18n();
  const api = getApi();
  const { data, error, loading, reload } = useLiveData(
    () => Promise.all([api.listProjects(viewer), api.listMilestones(viewer)]),
    [viewer.userId, viewer.role],
  );
  const [projects, milestones] = data ?? [[], []];
  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  return (
    <>
      <div className="dash-head">
        <h1>{t('dash.title')}</h1>
        <span className="live-dot">{t('dash.live')}</span>
      </div>
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data && projects.length === 0 && (
        <div className="empty">
          <p style={{ margin: 0, color: 'var(--text)' }}>{t('dash.empty')}</p>
          {viewer.email && (
            <p className="small break-anywhere" style={{ margin: '6px 0 0' }}>
              {t('dash.emptyHint', { email: viewer.email })}
            </p>
          )}
        </div>
      )}
      <div className="grid">
        {active.map((p) => (
          <ProjectSummary key={p.id} project={p} milestones={milestones} viewer={viewer} />
        ))}
      </div>
      {archived.length > 0 && (
        <>
          <h2 style={{ marginTop: 32 }}>{t('dash.archivedSection')}</h2>
          <div className="grid">
            {archived.map((p) => (
              <ProjectSummary key={p.id} project={p} milestones={milestones} viewer={viewer} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

/* ---------- admin ---------- */

function AdminHome({ viewer }: { viewer: Viewer }) {
  const { t, lang } = useI18n();
  const api = getApi();
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const { data, error, loading, reload } = useLiveData(
    () =>
      Promise.all([
        api.listProjects(viewer),
        api.listMilestones(viewer),
        api.listContactMessages(viewer),
        api.listRecentComments(viewer, 6),
      ]),
    [viewer.userId, viewer.role],
  );
  const [projects, milestones, messages, comments] = data ?? [[], [], [], []];
  const shown = projects.filter((p) => showArchived || !p.archived);
  const activeCount = projects.filter((p) => !p.archived && p.status !== 'done').length;
  const newMessages = messages.filter((m) => !m.handled).length;
  const titleOf = (id: string) => projects.find((p) => p.id === id)?.title ?? '';

  return (
    <>
      <div className="dash-head">
        <h1>{t('admin.projects')}</h1>
        <span className="live-dot">{t('dash.live')}</span>
        <span className="spacer" />
        <button type="button" className="btn btn-primary" onClick={() => setCreating((c) => !c)}>
          {t('admin.newProject')}
        </button>
      </div>
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data && (
        <p className="muted" style={{ marginTop: -8 }}>
          {t('admin.stats', { active: activeCount, inbox: newMessages })}
        </p>
      )}

      {creating && (
        <section className="card" style={{ marginBottom: 20 }}>
          <h2>{t('admin.newProject')}</h2>
          <ProjectForm
            submitLabel={t('admin.create')}
            onCancel={() => setCreating(false)}
            onSubmit={async (input) => {
              await api.createProject(viewer, input);
              setCreating(false);
              reload();
            }}
          />
        </section>
      )}

      <div className="dash-grid two">
        <div>
          <div className="row" style={{ marginBottom: 12 }}>
            <label className="checkbox">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              {t('admin.showArchived')}
            </label>
          </div>
          {data && shown.length === 0 && <p className="empty">{t('admin.noProjects')}</p>}
          <div className="grid">
            {shown.map((p) => (
              <ProjectSummary key={p.id} project={p} milestones={milestones} viewer={viewer} />
            ))}
          </div>
        </div>
        <aside className="card">
          <div className="card-head">
            <h2 style={{ fontSize: '1.15rem' }}>{t('admin.recentComments')}</h2>
          </div>
          {comments.length === 0 ? (
            <p className="muted">{t('admin.noRecentComments')}</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="comment">
                <div className="comment-meta">
                  <strong>{c.author_name || t('dash.client')}</strong> · {formatDateTime(c.created_at, lang)}
                </div>
                <div className="comment-body">{c.body}</div>
                <div className="small" style={{ marginTop: 4 }}>
                  <Link to={`/dashboard/p/${c.project_id}`}>{titleOf(c.project_id)}</Link>
                </div>
              </div>
            ))
          )}
        </aside>
      </div>
    </>
  );
}

/* ---------- family (read-only) ---------- */

function FamilyHome({ viewer }: { viewer: Viewer }) {
  const { t, lang } = useI18n();
  const api = getApi();
  const { data, error, loading, reload } = useLiveData(
    () => Promise.all([api.listProjects(viewer), api.listMilestones(viewer), api.listRecentUpdates(viewer, 12)]),
    [viewer.userId, viewer.role],
  );
  const [projects, milestones, updates] = data ?? [[], [], []];
  const active = projects.filter((p) => !p.archived);
  const activeIds = new Set(active.map((p) => p.id));
  const upcoming = upcomingMilestones(
    milestones.filter((m) => activeIds.has(m.project_id)),
    new Date(),
    14,
  );
  const titleOf = (id: string) => projects.find((p) => p.id === id)?.title;

  return (
    <>
      <div className="dash-head">
        <h1>{t('family.title')}</h1>
        <span className="live-dot">{t('dash.live')}</span>
      </div>
      <p className="muted" style={{ marginTop: -8 }}>
        {t('family.readOnly')}
      </p>
      <LoadState loading={loading && !data} error={error} onRetry={reload} />

      <div className="dash-grid two">
        <section>
          <h2 style={{ fontSize: '1.2rem' }}>{t('family.allProjects')}</h2>
          <div className="grid">
            {active.map((p) => (
              <ProjectSummary key={p.id} project={p} milestones={milestones} viewer={viewer} />
            ))}
          </div>
        </section>
        <div className="stack">
          <section className="card">
            <h2 style={{ fontSize: '1.15rem' }}>{t('family.upcoming')}</h2>
            {upcoming.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                {t('family.noUpcoming')}
              </p>
            ) : (
              <ul className="plain-list">
                {upcoming.map((m) => (
                  <li key={m.id} className="deadline">
                    <span className="deadline-date">{formatDate(m.due_date, lang)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600 }}>{m.title}</span>
                      <br />
                      <span className="small muted">
                        <Link to={`/dashboard/p/${m.project_id}`}>{titleOf(m.project_id)}</Link> · {t(`mstatus.${m.status}`)}
                        {m.payment_note ? ` · ${t('dash.payment', { note: m.payment_note })}` : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card">
            <h2 style={{ fontSize: '1.15rem' }}>{t('family.recent')}</h2>
            {updates.length === 0 ? (
              <p className="muted">{t('family.noRecent')}</p>
            ) : (
              <UpdatesTimeline updates={updates} viewer={viewer} projectTitle={titleOf} />
            )}
          </section>
        </div>
      </div>
    </>
  );
}
