import { useId, useRef, useState, type FormEvent } from 'react';
import { Gate, LockIcon } from './Gate';
import {
  MAX_TITLE,
  PERSONA,
  REQUEST_KINDS,
  TWO_STEP_OVER,
  can,
  clock,
  decideBlock,
  openStep,
  pendingCount,
  requestId,
  statusOf,
  validateRequest,
  visibleRequests,
  type InputError,
  type LogEntry,
  type OpsRequest,
  type RequestKind,
  type RequestStatus,
} from './ops';
import { isVisitorRequest, logLine, money, type View } from './view';

const BADGE: Record<RequestStatus, string> = {
  awaitingLead: 'badge badge-pending_approval',
  awaitingAdmin: 'badge badge-pending_approval',
  approved: 'badge badge-live',
  rejected: 'badge badge-danger',
};

export function Approvals({ v, onMember }: { v: View; onMember: () => void }) {
  const { T, state, deny } = v;
  const list = visibleRequests(state);
  const hidden = state.requests.length - list.length;
  const pending = pendingCount(state);

  return (
    <section className="demo-pane ro-approvals" aria-labelledby="ro-approvals-title">
      <div className="demo-pane-head">
        <span id="ro-approvals-title">{T.approvalsTitle}</span>
        <span className="spacer" />
        <span className={`ro-count${pending ? ' is-on' : ''}`}>
          {T.statPending} {pending}
        </span>
      </div>

      {can(state.role, 'submit') ? (
        <RequestForm v={v} />
      ) : (
        <div className="ro-form-locked">
          <Gate allowed={false} reason={T.why.submit} onClick={() => undefined} onDenied={() => deny('submit')}>
            {T.submit}
          </Gate>
          <p className="ro-form-locked-text">{T.formLocked}</p>
          <button type="button" className="btn btn-ghost btn-small" onClick={onMember}>
            {T.switchTo(T.roles.member)}
          </button>
        </div>
      )}

      {list.length === 0 ? (
        <p className="demo-empty">{T.noneMine}</p>
      ) : (
        <ul className="ro-reqs">
          {list.map((req) => (
            <RequestCard key={req.id} v={v} req={req} />
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <p className="ro-hidden-note">
          <LockIcon /> {T.hiddenNote(hidden)}
        </p>
      )}
    </section>
  );
}

function RequestForm({ v }: { v: View }) {
  const { T, state, dispatch, announce } = v;
  const id = useId();
  const [kind, setKind] = useState<RequestKind>('parts');
  // null = follow the sample default (so it also follows a language switch)
  const [title, setTitle] = useState<string | null>(null);
  const [amount, setAmount] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ title?: InputError; amount?: InputError }>({});
  const titleRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const titleValue = title ?? T.defaults[kind].title;
  const amountValue = amount ?? String(T.defaults[kind].amount);
  const parsed = /^\d+$/.test(amountValue.trim()) ? Number(amountValue.trim()) : null;
  const twoStep = parsed !== null && parsed > TWO_STEP_OVER;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validateRequest({ kind, title: titleValue, amount: amountValue });
    setErrors(found);
    if (found.title) return titleRef.current?.focus();
    if (found.amount) return amountRef.current?.focus();
    const newId = requestId(state.nextRequest);
    dispatch({ type: 'submit', kind, title: titleValue, amount: Number(amountValue.trim()) });
    announce(T.submitted(newId));
    setTitle(null);
    setAmount(null);
  };

  return (
    <form className="ro-form" onSubmit={submit} noValidate aria-labelledby={`${id}-h`}>
      <p className="demo-label ro-form-h" id={`${id}-h`}>
        {T.newRequest}
      </p>
      <div className="ro-form-grid">
        <div className="field">
          <label htmlFor={`${id}-kind`}>{T.kindLabel}</label>
          <select
            id={`${id}-kind`}
            className="select"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as RequestKind);
              setTitle(null);
              setAmount(null);
              setErrors({});
            }}
          >
            {REQUEST_KINDS.map((k) => (
              <option key={k} value={k}>
                {T.kinds[k]}
              </option>
            ))}
          </select>
        </div>
        <div className={`field ro-field-title${errors.title ? ' has-error' : ''}`}>
          <label htmlFor={`${id}-title`}>{T.titleLabel}</label>
          <input
            ref={titleRef}
            id={`${id}-title`}
            className="input"
            value={titleValue}
            maxLength={MAX_TITLE + 10}
            autoComplete="off"
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errors.title ? `${id}-title-err` : undefined}
            onChange={(e) => {
              setTitle(e.target.value);
              if (errors.title) setErrors({ ...errors, title: undefined });
            }}
          />
          {errors.title && (
            <span id={`${id}-title-err`} className="error-text">
              {T.errors[errors.title]}
            </span>
          )}
        </div>
        <div className={`field ro-field-amount${errors.amount ? ' has-error' : ''}`}>
          <label htmlFor={`${id}-amount`}>{T.amountLabel}</label>
          <div className="ro-money">
            <span aria-hidden="true">$</span>
            <input
              ref={amountRef}
              id={`${id}-amount`}
              className="input"
              value={amountValue}
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={errors.amount ? `${id}-amount-err` : `${id}-route`}
              onChange={(e) => {
                setAmount(e.target.value);
                if (errors.amount) setErrors({ ...errors, amount: undefined });
              }}
            />
          </div>
          {errors.amount && (
            <span id={`${id}-amount-err`} className="error-text">
              {T.errors[errors.amount]}
            </span>
          )}
        </div>
      </div>
      <div className="ro-form-foot">
        <p className="ro-route" id={`${id}-route`}>
          <span className="ro-route-steps" aria-hidden="true">
            <span className="ro-route-step">{T.roles.lead}</span>
            <span className={`ro-route-step${twoStep ? '' : ' is-off'}`}>{T.roles.admin}</span>
          </span>
          <span>{twoStep ? T.routeTwo : T.routeOne}</span>
        </p>
        <button type="submit" className="btn btn-primary btn-small">
          {T.submit}
        </button>
      </div>
    </form>
  );
}

function RequestCard({ v, req }: { v: View; req: OpsRequest }) {
  const { T, name, label } = v;
  const status = statusOf(req);
  const open = openStep(req);

  return (
    <li className={`ro-req is-${status}${isVisitorRequest(req) ? ' is-new' : ''}`}>
      <div className="ro-req-top">
        <span className="ro-req-id">{req.id}</span>
        <span className="ro-kind">{T.kinds[req.kind]}</span>
        <span className="spacer" />
        <span className={BADGE[status]}>{T.status[status]}</span>
      </div>
      <div className="ro-req-main">
        <b className="ro-req-title">{label(req.title)}</b>
        <span className="ro-amt">{money(req.amount, T)}</span>
      </div>
      <p className="ro-req-meta">{T.filed(name(req.by), clock(req.at))}</p>
      <ol className="ro-steps">
        {req.steps.map((s) => {
          const state = s.decision ?? (s === open ? 'current' : 'waiting');
          return (
            <li key={s.role} className={`ro-step is-${state}`}>
              <span className="ro-step-mark" aria-hidden="true">
                {s.decision === 'approved' ? '✓' : s.decision === 'rejected' ? '✕' : ''}
              </span>
              <span className="ro-step-k">{T.step[s.role]}</span>
              <span className="ro-step-v">
                {s.decision && s.by && s.at !== undefined ? (
                  <>
                    {T.status[s.decision]} · {name(s.by)} · {clock(s.at)}
                  </>
                ) : s === open ? (
                  T.stepNow
                ) : (
                  T.stepWaiting
                )}
              </span>
              {s.comment && <q className="ro-step-c">{label(s.comment)}</q>}
            </li>
          );
        })}
      </ol>
      {/* keyed by step: the next approver starts with an empty comment */}
      {open && <Decision key={open.role} v={v} req={req} />}
    </li>
  );
}

function Decision({ v, req }: { v: View; req: OpsRequest }) {
  const { T, state, dispatch, announce, deny, who, name, label } = v;
  const id = useId();
  const [comment, setComment] = useState('');
  const [needReason, setNeedReason] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const blocked = decideBlock(state.role, req);
  const open = openStep(req);
  if (!open) return null;

  const decide = (decision: 'approved' | 'rejected') => {
    if (decision === 'rejected' && !comment.trim()) {
      setNeedReason(true);
      inputRef.current?.focus();
      announce(T.needReason);
      return;
    }
    dispatch({ type: 'decide', id: req.id, decision, comment });
    setComment('');
    // Say what just happened in the same words the audit log uses.
    const text = comment.trim();
    const entry: LogEntry = {
      seq: 0,
      at: Math.floor(state.now),
      actor: PERSONA[state.role],
      kind: decision === 'approved' ? 'approve' : 'reject',
      target: req.id,
      step: open.role,
      ...(text ? { comment: text } : {}),
    };
    announce(logLine(entry, { T, state, name, who, label }));
  };

  if (blocked) {
    const reason = T.why[blocked];
    return (
      <div className="ro-decide is-locked">
        <Gate allowed={false} reason={reason} onClick={() => undefined} onDenied={() => deny(blocked, req.id)}>
          {T.approve}
        </Gate>
        <Gate allowed={false} reason={reason} onClick={() => undefined} onDenied={() => deny(blocked, req.id)}>
          {T.reject}
        </Gate>
      </div>
    );
  }

  return (
    <div className="ro-decide">
      <div className={`field ro-comment${needReason ? ' has-error' : ''}`}>
        <label htmlFor={`${id}-c`}>
          {T.commentLabel} <span className="muted small">· {T.commentHint}</span>
        </label>
        <input
          ref={inputRef}
          id={`${id}-c`}
          className="input"
          value={comment}
          maxLength={80}
          autoComplete="off"
          aria-invalid={needReason ? true : undefined}
          aria-describedby={needReason ? `${id}-err` : undefined}
          onChange={(e) => {
            setComment(e.target.value);
            if (needReason && e.target.value.trim()) setNeedReason(false);
          }}
        />
        {needReason && (
          <span id={`${id}-err`} className="error-text">
            {T.needReason}
          </span>
        )}
      </div>
      <div className="demo-chips ro-quick">
        {T.quick.map((q) => (
          <button
            key={q}
            type="button"
            className="demo-chip"
            aria-pressed={comment === q}
            onClick={() => {
              setComment(q);
              setNeedReason(false);
            }}
          >
            {q}
          </button>
        ))}
      </div>
      <div className="ro-decide-btns">
        <button type="button" className="btn btn-primary btn-small" onClick={() => decide('approved')}>
          {T.approve}
        </button>
        <button type="button" className="btn btn-danger btn-small" onClick={() => decide('rejected')}>
          {T.reject}
        </button>
      </div>
    </div>
  );
}
