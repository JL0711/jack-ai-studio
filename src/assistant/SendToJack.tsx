import { useEffect, useRef, useState, type FormEvent } from 'react';
import { buildSummary, contactFields } from '../ai/summary';
import type { ChatState } from '../ai/dialog';
import { useAuth } from '../auth/AuthProvider';
import { WeChatFallback } from '../components/WeChatFallback';
import { useI18n } from '../i18n/I18nProvider';
import { errorMessage } from '../lib/format';
import { isReplyOpen } from '../lib/replyHours';
import { LIMITS, validateContact, type ContactField } from '../lib/validation';
import { getApi } from '../store';
import { ApiError } from '../store/api';

const SLOW_MS = 6000;

interface Props {
  state: ChatState;
  said: string[];
  from: string | null;
  onCancel: () => void;
  onSent: () => void;
}

/** The little form that sends the conversation + estimate to Jack's inbox. */
export function SendToJack({ state, said, from, onCancel, onSent }: Props) {
  const { t } = useI18n();
  const { demo } = useAuth();
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'error'>('idle');
  const [error, setError] = useState('');
  const [network, setNetwork] = useState(false);
  const [slow, setSlow] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => first.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    if (status !== 'sending') {
      setSlow(false);
      return;
    }
    const id = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => window.clearTimeout(id);
  }, [status]);

  const message = buildSummary({ state, said, note, from: from ?? undefined });
  const fields = contactFields(state);
  const input = { name, contact, project_type: fields.project_type, budget: fields.budget, message };
  const errors = validateContact(input);
  const err = (f: ContactField) => {
    const e = errors[f];
    if (!touched || !e) return null;
    const limit = f === 'name' ? LIMITS.contactName : f === 'contact' ? LIMITS.contactMethod : undefined;
    return t(`err.${e}`, limit ? { min: limit.min, max: limit.max } : undefined);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (errors.name || errors.contact) return;
    setStatus('sending');
    setError('');
    try {
      if (honeypot.trim() === '') await getApi().submitContact(input);
      onSent();
    } catch (ex) {
      setError(errorMessage(ex));
      setNetwork(ex instanceof ApiError && ex.code === 'network');
      setStatus('error');
    }
  };

  return (
    <form className="as-send ticks" onSubmit={submit} noValidate>
      <p className="as-send-title">
        <span className="led is-live" aria-hidden="true" />
        {t('send.title')}
      </p>
      <p className="small muted">{t('send.intro')}</p>
      {demo && <p className="notice notice-demo small">{t('send.demo')}</p>}
      <div className="form-row">
        <div className={`field${err('name') ? ' has-error' : ''}`}>
          <label htmlFor="as-name">{t('contact.name')}</label>
          <input
            ref={first}
            id="as-name"
            className="input"
            autoComplete="name"
            value={name}
            maxLength={LIMITS.contactName.max + 20}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!err('name')}
            aria-describedby="as-name-err"
          />
          <span id="as-name-err" className="error-text">
            {err('name')}
          </span>
        </div>
        <div className={`field${err('contact') ? ' has-error' : ''}`}>
          <label htmlFor="as-contact">{t('contact.contact')}</label>
          <input
            id="as-contact"
            className="input"
            value={contact}
            maxLength={LIMITS.contactMethod.max + 20}
            onChange={(e) => setContact(e.target.value)}
            aria-invalid={!!err('contact')}
            aria-describedby="as-contact-hint as-contact-err"
          />
          <span id="as-contact-hint" className="hint">
            {t('contact.contactHint')}
          </span>
          <span id="as-contact-err" className="error-text">
            {err('contact')}
          </span>
        </div>
      </div>
      <div className="field">
        <label htmlFor="as-note">{t('send.note')}</label>
        <textarea id="as-note" className="textarea as-note-input" rows={2} value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="hp-field" aria-hidden="true">
        <label htmlFor="as-website">{t('contact.honeypot')}</label>
        <input id="as-website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
      </div>
      {status === 'error' && (
        <p className="notice notice-error" role="alert">
          {network ? t('contact.errorNetwork') : t('contact.error', { msg: error })}
        </p>
      )}
      {(status === 'error' || (status === 'sending' && slow)) && <WeChatFallback reason={status === 'error' ? 'failed' : 'slow'} draft={message} />}
      <div className="row">
        <button type="submit" className="btn btn-primary btn-small" disabled={status === 'sending'}>
          {status === 'sending' ? t('send.sending') : t('send.submit')}
        </button>
        <button type="button" className="btn btn-ghost btn-small" onClick={onCancel} disabled={status === 'sending'}>
          {t('send.cancel')}
        </button>
        <span className="hint">{t('contact.privacy')}</span>
      </div>
    </form>
  );
}

/** The confirmation shown in the chat after sending. */
export function sentText(lang: 'zh' | 'en', now = new Date()): string {
  const open = isReplyOpen(now);
  if (lang === 'zh') return `**已发给 Jack！** ${open ? '现在是回复时段，2 小时内会收到回复。' : '现在不在回复时段，Jack 会在回复时段内尽快回复。'}他会通过你留下的联系方式联系你。`;
  return `**Sent to Jack!** ${open ? 'It’s inside reply hours now: expect a reply within 2 hours.' : 'It’s outside reply hours; Jack will reply as soon as they start.'} He’ll get back to you via the contact details you left.`;
}
