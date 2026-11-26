import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Chip } from '../ai/dialog';
import { estimateText } from '../ai/summary';
import { SendIcon } from '../components/Icons';
import { useI18n } from '../i18n/I18nProvider';
import { chatT, useChatT } from './strings';
import { useMedia, useReducedMotion } from '../lib/motion';
import { EstimateCard } from './EstimateCard';
import { RichText } from './RichText';
import { SendToJack, sentText } from './SendToJack';
import {
  closeAssistant,
  getAssistant,
  markSent,
  pushAssistantText,
  recalcInPlace,
  sendInput,
  sendText,
  useAssistant,
  visitorWords,
  type AssistantMessage,
} from './store';
import './chat.css';

const MAX = 2000;

function Thinking({ lines }: { lines: string[] }) {
  const t = useChatT();
  return (
    <div className="as-thinking" role="status">
      <span className="as-thinking-head">
        <i className="led is-wip" aria-hidden="true" />
        {t('assistant.thinking')}
      </span>
      <ol>
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ol>
    </div>
  );
}

function AssistantTurn({
  msg,
  live,
  liveEstimate,
  onChip,
  onSend,
  onLink,
}: {
  msg: AssistantMessage;
  /** The newest reply: its questions and suggestions can be tapped. */
  live: boolean;
  /** Holds the newest estimate: its feature toggles work. */
  liveEstimate: boolean;
  onChip: (c: Chip) => void;
  onSend: () => void;
  /** A link in the reply was followed (the phone drawer closes so the page shows). */
  onLink: () => void;
}) {
  const { turn } = msg;
  const { state, busy } = useAssistant();
  const lang = turn.lang;
  return (
    <div className="as-msg as-bot" lang={lang === 'zh' ? 'zh-CN' : 'en'}>
      <span className="as-who">
        <i className="as-who-led" aria-hidden="true" />
        {chatT(lang, 'assistant.bot')}
      </span>
      {turn.blocks.map((b, i) => {
        switch (b.t) {
          case 'text':
            return (
              <div key={i} className="as-text">
                <RichText text={b.text} />
              </div>
            );
          case 'estimate':
            return (
              <EstimateCard
                key={i}
                est={b.est}
                req={b.req}
                lang={lang}
                live={liveEstimate}
                fresh={msg.fresh}
                onToggle={(f, on) => void recalcInPlace({ t: 'toggle', feature: f, on }, lang)}
                onSend={onSend}
                onLink={onLink}
                copyText={liveEstimate && state ? estimateText(state) : undefined}
              />
            );
          case 'links':
            return (
              <ul key={i} className="as-links">
                {b.items.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="text-link" onClick={onLink}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            );
          case 'question': {
            // Not while a reply is being worked out: the pending question only changes when it lands,
            // so a second tap would answer the same question twice.
            const open = live && !busy && state?.pending === b.slot;
            return (
              <div key={i} className="as-question">
                <p className="as-question-text">{b.text}</p>
                {b.why && <p className="as-question-why">{b.why}</p>}
                <div className="as-options" role="group" aria-label={b.text}>
                  {b.options.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className="demo-chip"
                      disabled={!open}
                      onClick={() => {
                        if (getAssistant().busy) return;
                        void sendInput({ t: 'answer', slot: b.slot, value: o.value }, lang, o.label);
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          }
        }
        return null;
      })}
      {live && turn.chips.length > 0 && (
        <div className="as-chipbar" role="group" aria-label={lang === 'zh' ? '可以接着问' : 'Suggestions'}>
          {turn.chips.map((c) => (
            <button key={c.key} type="button" className={`as-sugg${c.t === 'contact' ? ' is-primary' : ''}${c.t === 'link' ? ' is-link' : ''}`} onClick={() => onChip(c)}>
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatPanel({ variant }: { variant: 'drawer' | 'page' }) {
  const { lang } = useI18n();
  const t = useChatT();
  const { messages, busy, thinking, state, from } = useAssistant();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const phone = useMedia('(max-width: 640px)');
  const reduced = useReducedMotion();
  const lastAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'assistant') return messages[i].id;
    return null;
  }, [messages]);
  // The newest estimate stays editable even when a later message (like "sent") follows it.
  const lastEstimate = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'assistant' && m.turn.blocks.some((b) => b.t === 'estimate')) return m.id;
    }
    return null;
  }, [messages]);
  const lastCount = useRef(messages.length);

  // Keep the newest turn in view: its top, so a long reply is read from the start.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const grew = messages.length > lastCount.current;
    lastCount.current = messages.length;
    if (!grew && !thinking && !sending) return;
    const items = el.querySelectorAll<HTMLElement>('.as-msg, .as-send, .as-thinking');
    const target = items[items.length - 1];
    if (!target) return;
    const top = target.offsetTop - el.offsetTop - 12;
    el.scrollTo({ top: target.offsetHeight > el.clientHeight * 0.8 ? top : el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [messages, thinking, sending, reduced]);

  useEffect(() => {
    if (variant === 'drawer' && !phone) inputRef.current?.focus({ preventScroll: true });
  }, [variant, phone]);

  // The box grows with the text (CSS field-sizing does this where supported).
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el || (typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content'))) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, 180)}px`;
  }, [text]);

  const submit = () => {
    const v = text.trim();
    if (!v || busy || Array.from(v).length > MAX) return;
    setText('');
    void sendText(v, lang);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter is a new line; never while an IME (Chinese input) is composing.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      submit();
    }
  };

  // On a phone the drawer covers the page: close it (and release the scroll lock) when a link
  // in the chat is followed, or the new page would open hidden behind it.
  const onLink = () => {
    if (variant === 'drawer' && phone) closeAssistant(true);
  };

  const onChip = (c: Chip) => {
    if (busy) return;
    switch (c.t) {
      case 'say':
        void sendText(c.text, lang);
        break;
      case 'contact':
        setSending(true);
        break;
      case 'mvp':
        void sendInput({ t: 'mvp', drop: c.drop }, lang, c.label);
        break;
      case 'currency':
        void sendInput({ t: 'currency', currency: c.currency }, lang, c.label);
        break;
      case 'link':
        onLink();
        navigate(c.to);
        break;
    }
  };

  const count = Array.from(text).length;
  const convLang = state?.lang ?? lang;

  return (
    <div className={`as-panel is-${variant}`}>
      <div ref={listRef} className="as-list-scroll" role="log" aria-live="polite" aria-relevant="additions" aria-label={t('assistant.dialog')}>
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="as-msg as-user">
              <span className="visually-hidden">{t('assistant.you')}: </span>
              <p>{m.text}</p>
            </div>
          ) : (
            <AssistantTurn
              key={m.id}
              msg={m}
              live={m.id === lastAssistant && !sending}
              liveEstimate={m.id === lastEstimate && !sending}
              onChip={onChip}
              onSend={() => setSending(true)}
              onLink={onLink}
            />
          ),
        )}
        {thinking && <Thinking lines={thinking} />}
        {sending && state && (
          <SendToJack
            state={state}
            said={visitorWords()}
            from={from}
            onCancel={() => setSending(false)}
            onSent={() => {
              setSending(false);
              markSent();
              pushAssistantText(sentText(convLang), convLang);
            }}
          />
        )}
        <p className="as-privacy">{t('assistant.privacy')}</p>
      </div>
      <form
        className="as-composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor={`as-input-${variant}`} className="visually-hidden">
          {t('assistant.placeholder')}
        </label>
        <textarea
          id={`as-input-${variant}`}
          ref={inputRef}
          className="as-input"
          rows={variant === 'page' ? 2 : 1}
          placeholder={t('assistant.placeholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          enterKeyHint="send"
          aria-describedby={count > MAX ? 'as-too-long' : undefined}
        />
        <button type="submit" className="as-send-btn" disabled={busy || !text.trim() || count > MAX} aria-label={t('assistant.send')}>
          <SendIcon />
        </button>
        {count > MAX * 0.8 && (
          <span id="as-too-long" className={`as-count${count > MAX ? ' is-over' : ''}`}>
            {count > MAX ? t('assistant.tooLong', { max: MAX }) : `${count}/${MAX}`}
          </span>
        )}
      </form>
    </div>
  );
}
