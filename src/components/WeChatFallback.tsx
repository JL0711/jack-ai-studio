import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { copyText } from '../lib/clipboard';
import { WECHAT_ID } from '../lib/site';

type Copied = 'id' | 'msg' | 'failed' | null;

interface Props {
  /** 'slow': still sending after a while; 'failed': the message did not go out. */
  reason: 'slow' | 'failed';
  /** The visitor's message, formatted for pasting into WeChat. */
  draft: string;
}

/**
 * Shown on the contact form when sending is slow or fails (common where
 * Supabase is hard to reach, as on some mainland China networks): Jack's
 * WeChat ID plus buttons to copy it and the visitor's own message.
 * Renders nothing while no WeChat ID is set.
 */
export function WeChatFallback({ reason, draft }: Props) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<Copied>(null);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!WECHAT_ID) return null;

  const copy = async (what: 'id' | 'msg') => {
    const ok = await copyText(what === 'id' ? WECHAT_ID : draft);
    setCopied(ok ? what : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 2500);
  };

  return (
    <div className="wechat-fallback">
      <p className="wechat-fallback-title">
        <strong>{t(reason === 'slow' ? 'contact.wechat.slowTitle' : 'contact.wechat.title')}</strong>
      </p>
      <p className="small muted">{t('contact.wechat.body')}</p>
      <div className="wechat-fallback-row">
        <span className="wechat-label">{t('contact.wechat.label')}</span>
        <code className="wechat-id">{WECHAT_ID}</code>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => copy('id')}>
          {copied === 'id' ? t('contact.wechat.copied') : t('contact.wechat.copyId')}
        </button>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => copy('msg')}>
          {copied === 'msg' ? t('contact.wechat.copied') : t('contact.wechat.copyMsg')}
        </button>
      </div>
      {copied === 'failed' && <p className="error-text wechat-copy-failed">{t('contact.wechat.copyFailed')}</p>}
      <span className="visually-hidden" role="status">
        {copied === 'id' || copied === 'msg' ? t('contact.wechat.copied') : ''}
      </span>
    </div>
  );
}
