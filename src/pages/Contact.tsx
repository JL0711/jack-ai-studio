import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Scramble } from '../components/fx/Scramble';
import { ArrowRightIcon } from '../components/Icons';
import { WeChatFallback } from '../components/WeChatFallback';
import { useI18n } from '../i18n/I18nProvider';
import type { StringKey } from '../i18n/strings';
import { errorMessage } from '../lib/format';
import { BEIJING, PACIFIC, hhmm, isReplyOpen, useNow, zoneTime } from '../lib/replyHours';
import type { ContactInput } from '../lib/types';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import {
  BUDGETS,
  LIMITS,
  PROJECT_TYPES,
  charLength,
  validateContact,
  type ContactField,
  type FieldError,
} from '../lib/validation';
import { getApi } from '../store';
import { ApiError } from '../store/api';

type Status = 'idle' | 'sending' | 'sent' | 'error';

/** Whether a message sent now falls inside reply hours, with both clocks. */
function ReplyNow() {
  const { t } = useI18n();
  const now = useNow(15000);
  const open = isReplyOpen(now);
  return (
    <p className={`reply-now${open ? ' is-open' : ''}`}>
      <span className={`led ${open ? 'is-live' : 'is-off'}`} aria-hidden="true" />
      <span>
        {open ? t('home.clock.open') : t('home.clock.closed')}
        <span className="reply-now-clock">
          {t('home.clock.pacific')} {hhmm(zoneTime(now, PACIFIC))} · {t('home.clock.beijing')} {hhmm(zoneTime(now, BEIJING))}
        </span>
      </span>
    </p>
  );
}

/** After this long without an answer, the form also offers WeChat. */
const SLOW_MS = 6000;

const EMPTY: ContactInput = { name: '', contact: '', project_type: '', budget: null, message: '' };

const FIELD_LIMITS: Partial<Record<ContactField, { min: number; max: number }>> = {
  name: LIMITS.contactName,
  contact: LIMITS.contactMethod,
  message: LIMITS.contactMessage,
};

export default function Contact() {
  const { t } = useI18n();
  useDocumentTitle(t('contact.title'));
  const { demo } = useAuth();
  const [form, setForm] = useState<ContactInput>(EMPTY);
  const [honeypot, setHoneypot] = useState('');
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [networkError, setNetworkError] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (status !== 'sending') {
      setSlow(false);
      return;
    }
    const id = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => window.clearTimeout(id);
  }, [status]);

  const errors = validateContact(form);
  const hasErrors = Object.keys(errors).length > 0;

  const set = <K extends keyof ContactInput>(key: K, value: ContactInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const errorText = (field: ContactField): string | null => {
    const e: FieldError | undefined = errors[field];
    if (!touched || !e) return null;
    const limit = FIELD_LIMITS[field];
    return t(`err.${e}`, limit ? { min: limit.min, max: limit.max } : undefined);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (hasErrors) return;
    setStatus('sending');
    setError('');
    try {
      // Honeypot filled in → almost certainly a bot. Pretend it worked, send nothing.
      if (honeypot.trim() === '') await getApi().submitContact(form);
      setStatus('sent');
      setForm(EMPTY);
      setTouched(false);
    } catch (err) {
      setError(errorMessage(err));
      setNetworkError(err instanceof ApiError && err.code === 'network');
      setStatus('error');
    }
  };

  const draft = t('contact.wechat.draft', {
    name: form.name.trim(),
    type: form.project_type ? t(`ptype.${form.project_type}` as StringKey) : '—',
    budget: form.budget ? t(`budget.${form.budget}` as StringKey) : '—',
    message: form.message.trim(),
  });

  const fieldClass = (field: ContactField) => `field${errorText(field) ? ' has-error' : ''}`;

  return (
    <div className="page">
      <div className="container">
        <header className="page-head">
          <span className="kicker">
            <b>04</b>
            <span aria-hidden="true">//</span>
            {t('contact.kicker')}
          </span>
          <h1>
            <Scramble text={t('contact.title')} />
          </h1>
          <p>{t('contact.intro')}</p>
        </header>

        <div className="contact-layout">
          <section className="card contact-card ticks">
            <div className="contact-card-head" aria-hidden="true">
              <span>contact.form</span>
              <span>{demo ? t('demo.title') : 'POST → Supabase'}</span>
            </div>
            {demo && (
              <p className="notice notice-demo" role="note" style={{ marginTop: 0 }}>
                {t('contact.demoNotice')}
              </p>
            )}

            {status === 'sent' ? (
              <div className="stack" role="status">
                <div className="notice notice-success">
                  <p>
                    <strong>{t('contact.successTitle')}</strong> {t('contact.success')}
                  </p>
                  {demo && <p className="small">{t('contact.demoSuccess')}</p>}
                </div>
                <button type="button" className="btn btn-secondary" onClick={() => setStatus('idle')}>
                  {t('contact.sendAnother')}
                </button>
              </div>
            ) : (
              <form className="form" onSubmit={onSubmit} noValidate>
                <div className="form-row">
                  <div className={fieldClass('name')}>
                    <label htmlFor="c-name">{t('contact.name')}</label>
                    <input
                      id="c-name"
                      className="input"
                      autoComplete="name"
                      value={form.name}
                      maxLength={LIMITS.contactName.max + 20}
                      onChange={(e) => set('name', e.target.value)}
                      aria-invalid={!!errorText('name')}
                      aria-describedby="c-name-err"
                    />
                    <span id="c-name-err" className="error-text">
                      {errorText('name')}
                    </span>
                  </div>
                  <div className={fieldClass('contact')}>
                    <label htmlFor="c-contact">{t('contact.contact')}</label>
                    <input
                      id="c-contact"
                      className="input"
                      value={form.contact}
                      maxLength={LIMITS.contactMethod.max + 20}
                      onChange={(e) => set('contact', e.target.value)}
                      aria-invalid={!!errorText('contact')}
                      aria-describedby="c-contact-hint c-contact-err"
                    />
                    <span id="c-contact-hint" className="hint">
                      {t('contact.contactHint')}
                    </span>
                    <span id="c-contact-err" className="error-text">
                      {errorText('contact')}
                    </span>
                  </div>
                </div>

                <div className="form-row">
                  <div className={fieldClass('project_type')}>
                    <label htmlFor="c-type">{t('contact.type')}</label>
                    <select
                      id="c-type"
                      className="select"
                      value={form.project_type}
                      onChange={(e) => set('project_type', e.target.value)}
                      aria-invalid={!!errorText('project_type')}
                      aria-describedby="c-type-err"
                    >
                      <option value="">{t('contact.choose')}</option>
                      {PROJECT_TYPES.map((p) => (
                        <option key={p} value={p}>
                          {t(`ptype.${p}` as StringKey)}
                        </option>
                      ))}
                    </select>
                    <span id="c-type-err" className="error-text">
                      {errorText('project_type')}
                    </span>
                  </div>
                  <div className="field">
                    <label htmlFor="c-budget">{t('contact.budget')}</label>
                    <select
                      id="c-budget"
                      className="select"
                      value={form.budget ?? ''}
                      onChange={(e) => set('budget', e.target.value || null)}
                    >
                      <option value="">{t('budget.none')}</option>
                      {BUDGETS.map((b) => (
                        <option key={b} value={b}>
                          {t(`budget.${b}` as StringKey)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={fieldClass('message')}>
                  <label htmlFor="c-message">{t('contact.message')}</label>
                  <textarea
                    id="c-message"
                    className="textarea"
                    rows={7}
                    value={form.message}
                    onChange={(e) => set('message', e.target.value)}
                    aria-invalid={!!errorText('message')}
                    aria-describedby="c-message-hint c-message-err"
                  />
                  <div className="field-foot">
                    <span id="c-message-hint" className="hint">
                      {t('contact.messageHint')}
                    </span>
                    <span
                      className={`counter${charLength(form.message.trim()) > LIMITS.contactMessage.max ? ' over' : ''}`}
                    >
                      {charLength(form.message.trim())}/{LIMITS.contactMessage.max}
                    </span>
                  </div>
                  <span id="c-message-err" className="error-text">
                    {errorText('message')}
                  </span>
                </div>

                {/* Honeypot: hidden from people and screen readers; bots tend to fill it. */}
                <div className="hp-field" aria-hidden="true">
                  <label htmlFor="c-website">{t('contact.honeypot')}</label>
                  <input
                    id="c-website"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                  />
                </div>

                {status === 'error' && (
                  <p className="notice notice-error" role="alert">
                    {networkError ? t('contact.errorNetwork') : t('contact.error', { msg: error })}
                  </p>
                )}

                {(status === 'error' || (status === 'sending' && slow)) && (
                  <WeChatFallback reason={status === 'error' ? 'failed' : 'slow'} draft={draft} />
                )}

                <div className="row">
                  <button type="submit" className="btn btn-primary btn-lg" disabled={status === 'sending'}>
                    {status === 'sending' ? t('contact.sending') : t('contact.submit')}
                    <span aria-hidden="true">↵</span>
                  </button>
                  <span className="hint">{t('contact.privacy')}</span>
                </div>
              </form>
            )}
          </section>

          <aside className="contact-aside">
            <div className="card contact-ai">
              <h2 className="aside-h">
                <span className="led is-live" aria-hidden="true" /> {t('contact.aiTitle')}
              </h2>
              <p className="muted small">{t('contact.aiBody')}</p>
              <Link to="/quote" className="btn btn-secondary btn-small">
                {t('contact.aiBtn')}
                <ArrowRightIcon width={16} height={16} />
              </Link>
            </div>
            <div className="card">
              <h2 className="aside-h">{t('home.hoursTitle')}</h2>
              <ReplyNow />
              <p style={{ margin: '14px 0 0' }}>
                <strong>{t('home.hours')}</strong>
                <br />
                <span className="muted">{t('home.hoursAlt')}</span>
              </p>
              <p className="muted small" style={{ margin: '8px 0 0' }}>
                {t('home.hoursNote')}
              </p>
            </div>
            <div className="card">
              <dl className="kv">
                <div>
                  <dt>{t('home.fact.location')}</dt>
                  <dd>{t('home.fact.locationValue')}</dd>
                </div>
                <div>
                  <dt>{t('home.fact.languages')}</dt>
                  <dd>{t('home.fact.languagesValue')}</dd>
                </div>
                <div>
                  <dt>{t('home.fact.hardware')}</dt>
                  <dd>{t('home.fact.hardwareValue')}</dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
