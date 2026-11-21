// Building blocks shared by the client, admin and family dashboards.

import { useState, type FormEvent, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { errorMessage, formatDate, formatDateTime } from '../lib/format';
import {
  canApproveVisibleMilestone,
  canCommentOnVisibleProject,
  canSeeInternalUpdates,
  isOverdue,
} from '../lib/permissions';
import type {
  Comment,
  Milestone,
  MilestoneInput,
  MilestoneStatus,
  Project,
  ProjectInput,
  ProjectStatus,
  ProjectUpdate,
  Viewer,
  Visibility,
} from '../lib/types';
import { MILESTONE_STATUSES, PROJECT_STATUSES } from '../lib/types';
import { LIMITS, charLength } from '../lib/validation';
import { MilestoneBadge } from './Badges';

/* ---------- small helpers ---------- */

export function LoadState({ loading, error, onRetry }: { loading: boolean; error: unknown; onRetry: () => void }) {
  const { t } = useI18n();
  if (error) {
    return (
      <div className="notice notice-error" role="alert">
        <p>{t('dash.loadError', { msg: errorMessage(error) })}</p>
        <button type="button" className="btn btn-secondary btn-small" onClick={onRetry}>
          {t('dash.retry')}
        </button>
      </div>
    );
  }
  if (loading) return <p className="muted">{t('dash.loading')}</p>;
  return null;
}

/** Two-step button: first click asks, second click does it. Avoids native confirm() dialogs. */
export function ConfirmButton({
  label,
  question,
  onConfirm,
  className = 'btn btn-secondary btn-small',
  confirmClassName = 'btn btn-primary btn-small',
}: {
  label: string;
  question: string;
  onConfirm: () => Promise<void> | void;
  className?: string;
  confirmClassName?: string;
}) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!asking) {
    return (
      <button type="button" className={className} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="stack" style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
      <span className="small" role="alertdialog">
        {question}
      </span>
      <span className="row">
        <button
          type="button"
          className={confirmClassName}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await onConfirm();
              setAsking(false);
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? t('auth.working') : t('common.yes')}
        </button>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setAsking(false)}>
          {t('admin.cancel')}
        </button>
      </span>
      {error && <span className="error-text">{error}</span>}
    </span>
  );
}

function TextCounter({ value, max }: { value: string; max: number }) {
  const n = charLength(value.trim());
  return (
    <span className={`counter${n > max ? ' over' : ''}`}>
      {n}/{max}
    </span>
  );
}

/* ---------- milestones ---------- */

export function MilestoneList({
  project,
  milestones,
  viewer,
  onApprove,
  renderAdmin,
}: {
  project: Project;
  milestones: Milestone[];
  viewer: Viewer;
  onApprove?: (m: Milestone) => Promise<void>;
  renderAdmin?: (m: Milestone) => ReactNode;
}) {
  const { t, lang } = useI18n();
  const now = new Date();
  if (milestones.length === 0) return <p className="muted">{t('dash.noMilestones')}</p>;
  return (
    <ul className="plain-list">
      {milestones.map((m) => {
        const approvable = onApprove && canApproveVisibleMilestone(viewer.role, project, m);
        const late = isOverdue(m, now);
        return (
          <li key={m.id} className="milestone">
            <div style={{ minWidth: 0 }}>
              <div className="milestone-title">{m.title}</div>
              <div className="milestone-meta">
                <span className={late ? 'overdue' : undefined}>
                  {m.due_date ? t('dash.due', { date: formatDate(m.due_date, lang) }) : t('dash.noDue')}
                  {late && ` · ${t('dash.overdue')}`}
                </span>
                {m.payment_note && <span>{t('dash.payment', { note: m.payment_note })}</span>}
                {m.status === 'done' && m.approved_at && (
                  <span>{t('dash.approvedAt', { date: formatDate(m.approved_at, lang) })}</span>
                )}
              </div>
              {renderAdmin?.(m)}
            </div>
            <div className="milestone-side">
              <MilestoneBadge status={m.status} />
              {approvable && (
                <ConfirmButton
                  label={t('dash.approve')}
                  className="btn btn-primary btn-small"
                  question={t('dash.approveConfirm', { title: m.title })}
                  onConfirm={() => onApprove(m)}
                />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function MilestoneForm({
  projectId,
  initial,
  nextSort,
  onSave,
  onCancel,
}: {
  projectId: string;
  initial?: Milestone;
  nextSort: number;
  onSave: (input: MilestoneInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [due, setDue] = useState(initial?.due_date ?? '');
  const [status, setStatus] = useState<MilestoneStatus>(initial?.status ?? 'not_started');
  const [payment, setPayment] = useState(initial?.payment_note ?? '');
  const [sort, setSort] = useState(String(initial?.sort ?? nextSort));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = charLength(title.trim());
    if (n < LIMITS.milestoneTitle.min || n > LIMITS.milestoneTitle.max) {
      setError(n === 0 ? t('err.required') : t('err.too_long', { max: LIMITS.milestoneTitle.max }));
      return;
    }
    if (charLength(payment.trim()) > LIMITS.paymentNote.max) {
      setError(t('err.too_long', { max: LIMITS.paymentNote.max }));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave({
        id: initial?.id,
        project_id: projectId,
        title,
        due_date: due || null,
        status,
        payment_note: payment || null,
        sort: Number.parseInt(sort, 10) || 0,
      });
      if (!initial) {
        setTitle('');
        setDue('');
        setPayment('');
        setStatus('not_started');
        setSort(String(nextSort + 1));
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const idp = initial?.id ?? `new-${projectId}`;
  return (
    <form className="form inline-edit" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`mt-${idp}`}>{t('admin.milestoneTitle')}</label>
        <input id={`mt-${idp}`} className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor={`md-${idp}`}>{t('admin.dueDate')}</label>
          <input id={`md-${idp}`} className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`ms-${idp}`}>{t('admin.status')}</label>
          <select
            id={`ms-${idp}`}
            className="select"
            value={status}
            onChange={(e) => setStatus(e.target.value as MilestoneStatus)}
          >
            {MILESTONE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`mstatus.${s}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor={`mp-${idp}`}>{t('admin.paymentNote')}</label>
          <input id={`mp-${idp}`} className="input" value={payment} onChange={(e) => setPayment(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`mo-${idp}`}>{t('admin.sort')}</label>
          <input
            id={`mo-${idp}`}
            className="input"
            type="number"
            inputMode="numeric"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          />
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="row">
        <button type="submit" className="btn btn-primary btn-small" disabled={busy}>
          {initial ? t('admin.save') : t('admin.addMilestone')}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost btn-small" onClick={onCancel}>
            {t('admin.cancel')}
          </button>
        )}
      </div>
    </form>
  );
}

/* ---------- updates timeline ---------- */

export function UpdatesTimeline({
  updates,
  viewer,
  projectTitle,
  onDelete,
}: {
  updates: ProjectUpdate[];
  viewer: Viewer;
  projectTitle?: (projectId: string) => string | undefined;
  onDelete?: (u: ProjectUpdate) => Promise<void>;
}) {
  const { t, lang } = useI18n();
  if (updates.length === 0) return <p className="muted">{t('dash.noUpdates')}</p>;
  const showVisibility = canSeeInternalUpdates(viewer.role);
  return (
    <ol className="timeline">
      {updates.map((u) => (
        <li key={u.id} className={u.visibility === 'internal' ? 'internal' : undefined}>
          <div className="timeline-meta">
            <time dateTime={u.created_at}>{formatDateTime(u.created_at, lang)}</time>
            {showVisibility &&
              (u.visibility === 'internal' ? (
                <span className="badge badge-internal">{t('dash.internal')}</span>
              ) : (
                <span className="badge plain">{t('dash.clientVisible')}</span>
              ))}
            {projectTitle?.(u.project_id) && <span>{t('admin.onProject', { title: projectTitle(u.project_id) ?? '' })}</span>}
          </div>
          <div className="timeline-body">{u.body}</div>
          {onDelete && (
            <div style={{ marginTop: 6 }}>
              <ConfirmButton
                label={t('admin.delete')}
                className="btn btn-ghost btn-small"
                confirmClassName="btn btn-danger btn-small"
                question={t('admin.deleteConfirm')}
                onConfirm={() => onDelete(u)}
              />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

export function UpdateForm({ onPost }: { onPost: (body: string, visibility: Visibility) => Promise<void> }) {
  const { t } = useI18n();
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('client');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = charLength(body.trim());
    if (n === 0) return setError(t('err.required'));
    if (n > LIMITS.update.max) return setError(t('err.too_long', { max: LIMITS.update.max }));
    setBusy(true);
    setError('');
    try {
      await onPost(body, visibility);
      setBody('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form inline-edit" onSubmit={submit} noValidate style={{ marginBottom: 18 }}>
      <div className="field">
        <label htmlFor="up-body">{t('admin.postUpdate')}</label>
        <textarea
          id="up-body"
          className="textarea"
          rows={3}
          placeholder={t('admin.updatePlaceholder')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <TextCounter value={body} max={LIMITS.update.max} />
      </div>
      <div className="row">
        <label className="field-label" htmlFor="up-vis">
          {t('admin.visibility')}
        </label>
        <select
          id="up-vis"
          className="select"
          style={{ width: 'auto', minHeight: 36 }}
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as Visibility)}
        >
          <option value="client">{t('admin.visClient')}</option>
          <option value="internal">{t('admin.visInternal')}</option>
        </select>
        <span className="spacer" />
        <button type="submit" className="btn btn-primary btn-small" disabled={busy}>
          {t('admin.postUpdate')}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}

/* ---------- comments ---------- */

export function CommentsPanel({
  comments,
  viewer,
  onPost,
}: {
  comments: Comment[];
  viewer: Viewer;
  onPost: (body: string) => Promise<void>;
}) {
  const { t, lang } = useI18n();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const allowed = canCommentOnVisibleProject(viewer.role);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = charLength(body.trim());
    if (n === 0) return setError(t('err.required'));
    if (n > LIMITS.comment.max) return setError(t('err.too_long', { max: LIMITS.comment.max }));
    setBusy(true);
    setError('');
    try {
      await onPost(body);
      setBody('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {comments.length === 0 ? (
        <p className="muted">{t('dash.noComments')}</p>
      ) : (
        <div>
          {comments.map((c) => {
            const mine = !!viewer.userId && c.author === viewer.userId;
            return (
              <div key={c.id} className={`comment${mine ? ' mine' : ''}`}>
                <div className="comment-meta">
                  <strong>{mine ? t('dash.you') : c.author_name || t('dash.client')}</strong> ·{' '}
                  <time dateTime={c.created_at}>{formatDateTime(c.created_at, lang)}</time>
                </div>
                <div className="comment-body">{c.body}</div>
              </div>
            );
          })}
        </div>
      )}
      {allowed && (
        <form className="form" onSubmit={submit} noValidate style={{ marginTop: 16 }}>
          <div className="field">
            <label htmlFor="cm-body" className="visually-hidden">
              {t('dash.comments')}
            </label>
            <textarea
              id="cm-body"
              className="textarea"
              rows={3}
              style={{ minHeight: 90 }}
              placeholder={t('dash.commentPlaceholder')}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <div className="field-foot">
              {error ? <span className="error-text">{error}</span> : <span />}
              <TextCounter value={body} max={LIMITS.comment.max} />
            </div>
          </div>
          <div>
            <button type="submit" className="btn btn-primary btn-small" disabled={busy}>
              {busy ? t('dash.posting') : t('dash.postComment')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ---------- project form (admin) ---------- */

export function ProjectForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Project;
  submitLabel: string;
  onSubmit: (input: ProjectInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [summary, setSummary] = useState(initial?.summary ?? '');
  const [stage, setStage] = useState(initial?.stage ?? '');
  const [status, setStatus] = useState<ProjectStatus>(initial?.status ?? 'planning');
  const [progress, setProgress] = useState(initial?.progress ?? 0);
  const [clientEmail, setClientEmail] = useState(initial?.client_email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = charLength(title.trim());
    if (n === 0) return setError(`${t('admin.title')}: ${t('err.required')}`);
    if (n > LIMITS.projectTitle.max) return setError(t('err.too_long', { max: LIMITS.projectTitle.max }));
    if (charLength(summary.trim()) > LIMITS.projectSummary.max)
      return setError(t('err.too_long', { max: LIMITS.projectSummary.max }));
    if (charLength(stage.trim()) > LIMITS.projectStage.max)
      return setError(t('err.too_long', { max: LIMITS.projectStage.max }));
    if (clientEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail.trim()))
      return setError(t('auth.invalidEmail'));
    setBusy(true);
    setError('');
    try {
      await onSubmit({ title, summary, stage, status, progress, client_email: clientEmail.trim() || null });
      if (!initial) {
        setTitle('');
        setSummary('');
        setStage('');
        setStatus('planning');
        setProgress(0);
        setClientEmail('');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const idp = initial?.id ?? 'new';
  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`pt-${idp}`}>{t('admin.title')}</label>
        <input id={`pt-${idp}`} className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`ps-${idp}`}>{t('admin.summary')}</label>
        <textarea
          id={`ps-${idp}`}
          className="textarea"
          rows={3}
          style={{ minHeight: 80 }}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor={`pg-${idp}`}>{t('admin.stage')}</label>
          <input id={`pg-${idp}`} className="input" value={stage} onChange={(e) => setStage(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`pst-${idp}`}>{t('admin.status')}</label>
          <select
            id={`pst-${idp}`}
            className="select"
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
          >
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`pstatus.${s}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor={`pp-${idp}`}>{t('admin.progress')}</label>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input
              id={`pp-${idp}`}
              type="range"
              min={0}
              max={100}
              step={5}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--accent)', minWidth: 0 }}
            />
            <input
              aria-label={t('admin.progress')}
              className="input"
              type="number"
              min={0}
              max={100}
              value={progress}
              onChange={(e) => setProgress(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              style={{ width: 84, flex: 'none' }}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor={`pe-${idp}`}>{t('admin.clientEmail')}</label>
          <input
            id={`pe-${idp}`}
            className="input"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
          />
          <span className="hint">{t('admin.clientEmailHint')}</span>
        </div>
      </div>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {t('admin.cancel')}
          </button>
        )}
      </div>
    </form>
  );
}
