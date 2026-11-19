import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { ProjectStatusBadge } from '../../components/Badges';
import {
  CommentsPanel,
  ConfirmButton,
  LoadState,
  MilestoneForm,
  MilestoneList,
  ProjectForm,
  UpdateForm,
  UpdatesTimeline,
} from '../../components/DashboardParts';
import { ArrowLeftIcon } from '../../components/Icons';
import { ProgressBar } from '../../components/ProgressBar';
import { useI18n } from '../../i18n/I18nProvider';
import { formatDate } from '../../lib/format';
import { canEditProjects, canSeeClientEmail } from '../../lib/permissions';
import { getApi } from '../../store';
import { useLiveData } from '../../store/useLiveData';

export default function ProjectPage() {
  const { id = '' } = useParams();
  const { t, lang } = useI18n();
  const { viewer } = useAuth();
  const api = getApi();
  const admin = canEditProjects(viewer.role);
  const [editing, setEditing] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<string | null>(null);
  const [flash, setFlash] = useState('');

  const { data: bundle, error, loading, reload } = useLiveData(
    () => api.getProjectBundle(viewer, id),
    [id, viewer.userId, viewer.role],
  );

  const say = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(''), 2500);
  };

  const back = (
    <Link to="/dashboard" className="back-link">
      <ArrowLeftIcon /> {t('dash.backToList')}
    </Link>
  );

  if (loading && bundle === undefined) {
    return (
      <>
        {back}
        <LoadState loading error={null} onRetry={reload} />
      </>
    );
  }
  if (error) {
    return (
      <>
        {back}
        <LoadState loading={false} error={error} onRetry={reload} />
      </>
    );
  }
  if (!bundle) {
    return (
      <>
        {back}
        <p className="empty">{t('dash.notFound')}</p>
      </>
    );
  }

  const { project, milestones, updates, comments } = bundle;
  const nextSort = milestones.reduce((max, m) => Math.max(max, m.sort), 0) + 1;

  return (
    <>
      {back}
      <div className="dash-head" style={{ alignItems: 'center' }}>
        <h1 className="break-anywhere" style={{ fontSize: 'clamp(1.4rem, 1.1rem + 1.4vw, 2rem)' }}>
          {project.title}
        </h1>
        <ProjectStatusBadge status={project.status} />
        {project.archived && <span className="badge plain">{t('dash.archived')}</span>}
        <span className="live-dot">{t('dash.live')}</span>
      </div>
      {flash && (
        <p className="notice notice-success" role="status">
          {flash}
        </p>
      )}

      <div className="dash-grid two">
        <div className="stack">
          {/* overview */}
          <section className="card">
            {editing && admin ? (
              <>
                <h2>{t('admin.projectInfo')}</h2>
                <ProjectForm
                  initial={project}
                  submitLabel={t('admin.save')}
                  onCancel={() => setEditing(false)}
                  onSubmit={async (input) => {
                    await api.updateProject(viewer, project.id, input);
                    setEditing(false);
                    say(t('admin.saved'));
                    reload();
                  }}
                />
              </>
            ) : (
              <div className="stack">
                <ProgressBar value={project.progress} label={t('dash.progress')} />
                <div className="meta-line">
                  {project.stage && (
                    <span>
                      {t('dash.stage')}{t('common.colon')}<strong style={{ color: 'var(--text)' }}>{project.stage}</strong>
                    </span>
                  )}
                  <span>{t('dash.updatedAt', { date: formatDate(project.updated_at, lang) })}</span>
                  {canSeeClientEmail(viewer.role) && (
                    <span className="break-anywhere">
                      {t('dash.client')}{t('common.colon')}{project.client_email || t('admin.noClient')}
                    </span>
                  )}
                </div>
                {project.summary && (
                  <p className="break-anywhere" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                    {project.summary}
                  </p>
                )}
                {admin && (
                  <div className="row">
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => setEditing(true)}>
                      {t('admin.edit')}
                    </button>
                    {project.archived ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={async () => {
                          await api.updateProject(viewer, project.id, { archived: false });
                          reload();
                        }}
                      >
                        {t('admin.unarchive')}
                      </button>
                    ) : (
                      <ConfirmButton
                        label={t('admin.archive')}
                        className="btn btn-ghost btn-small"
                        question={t('admin.archiveConfirm', { title: project.title })}
                        onConfirm={async () => {
                          await api.updateProject(viewer, project.id, { archived: true });
                          reload();
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* milestones */}
          <section className="card">
            <div className="card-head">
              <h2>{t('dash.milestones')}</h2>
            </div>
            <MilestoneList
              project={project}
              milestones={milestones}
              viewer={viewer}
              onApprove={async (m) => {
                await api.approveMilestone(viewer, m.id);
                reload();
              }}
              renderAdmin={
                admin
                  ? (m) =>
                      editingMilestone === m.id ? (
                        <MilestoneForm
                          projectId={project.id}
                          initial={m}
                          nextSort={nextSort}
                          onCancel={() => setEditingMilestone(null)}
                          onSave={async (input) => {
                            await api.saveMilestone(viewer, input);
                            setEditingMilestone(null);
                            say(t('admin.milestoneSaved'));
                            reload();
                          }}
                        />
                      ) : (
                        <div className="row" style={{ marginTop: 6 }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-small"
                            onClick={() => setEditingMilestone(m.id)}
                          >
                            {t('admin.edit')}
                          </button>
                          <ConfirmButton
                            label={t('admin.delete')}
                            className="btn btn-ghost btn-small"
                            confirmClassName="btn btn-danger btn-small"
                            question={t('admin.deleteConfirm')}
                            onConfirm={async () => {
                              await api.deleteMilestone(viewer, m.id);
                              reload();
                            }}
                          />
                        </div>
                      )
                  : undefined
              }
            />
            {admin && (
              <details style={{ marginTop: 14 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t('admin.addMilestone')}</summary>
                <MilestoneForm
                  projectId={project.id}
                  nextSort={nextSort}
                  onSave={async (input) => {
                    await api.saveMilestone(viewer, input);
                    say(t('admin.milestoneSaved'));
                    reload();
                  }}
                />
              </details>
            )}
          </section>
        </div>

        <div className="stack">
          {/* updates */}
          <section className="card">
            <h2>{t('dash.timeline')}</h2>
            {admin && (
              <UpdateForm
                onPost={async (body, visibility) => {
                  await api.postUpdate(viewer, project.id, body, visibility);
                  reload();
                }}
              />
            )}
            <UpdatesTimeline
              updates={updates}
              viewer={viewer}
              onDelete={
                admin
                  ? async (u) => {
                      await api.deleteUpdate(viewer, u.id);
                      reload();
                    }
                  : undefined
              }
            />
          </section>

          {/* comments */}
          <section className="card">
            <h2>{t('dash.comments')}</h2>
            <CommentsPanel
              comments={comments}
              viewer={viewer}
              onPost={async (body) => {
                await api.postComment(viewer, project.id, body);
                reload();
              }}
            />
          </section>
        </div>
      </div>
    </>
  );
}
