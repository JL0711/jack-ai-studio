import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ChatIcon } from '../components/Icons';
import { useI18n } from '../i18n/I18nProvider';
import { closedForNavigation, getAssistant, openAssistant, useAssistant } from './store';

const loadDrawer = () => import('./Drawer');
const Drawer = lazy(loadDrawer);

/** Pages where the floating button would be in the way (or the chat is the page). */
const HIDDEN = /^\/(quote|login|reset-password|dashboard)(\/|$)/;

const TEXT_FIELD =
  'textarea, select, input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([type=file]):not([type=range]):not([type=color])';

function isTextField(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || el.matches(TEXT_FIELD));
}

/**
 * True while the visitor is typing in a field on the page. On phones the
 * button then steps aside: with the keyboard up it would sit on top of the
 * form (often right on its submit button).
 */
function useTypingOnPage(): boolean {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const onIn = (e: FocusEvent) => setTyping(isTextField(e.target));
    const onOut = (e: FocusEvent) => {
      if (!isTextField(e.relatedTarget)) setTyping(false);
    };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
    };
  }, []);
  return typing;
}

/**
 * The floating "AI 估价" button on public pages, and the chat drawer it opens.
 * Only this small file is in the main bundle; the chat and the estimate engine
 * are fetched when the button is first hovered, focused or pressed.
 */
export function AssistantHost() {
  const { t, lang } = useI18n();
  const { open, messages } = useAssistant();
  const { pathname } = useLocation();
  const hidden = HIDDEN.test(pathname);
  const typing = useTypingOnPage();
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  const launcher = useRef<HTMLButtonElement>(null);
  // Called as the drawer goes away. The button that opened it was removed while it was open,
  // so focus would fall to <body>: give it to the new chat button, or to the page when a
  // link in the chat was followed.
  const onClosed = useCallback(() => {
    const navigating = closedForNavigation();
    if (getAssistant().open) return; // not closed: the drawer only switched between phone and wide layout
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return; // focus is already somewhere real
    const target = (!navigating && launcher.current) || document.getElementById('main');
    target?.focus({ preventScroll: true });
  }, []);

  const slug = pathname.match(/^\/showcase\/([^/]+)/)?.[1];
  const unread = messages.length > 0 && !open;

  return (
    <>
      {!hidden && !open && (
        <button
          ref={launcher}
          type="button"
          className={`as-launcher${unread ? ' has-chat' : ''}${typing ? ' is-typing' : ''}`}
          onClick={() => openAssistant(pathname, lang, slug)}
          onMouseEnter={() => void loadDrawer()}
          onFocus={() => void loadDrawer()}
          aria-haspopup="dialog"
        >
          <span className="as-launcher-icon" aria-hidden="true">
            <ChatIcon width={18} height={18} />
          </span>
          <span className="as-launcher-text">
            <b>{t('assistant.launch')}</b>
            <span>{t('assistant.launchHint')}</span>
          </span>
          <i className="as-launcher-led" aria-hidden="true" />
        </button>
      )}
      {mounted && !hidden && (
        <Suspense fallback={null}>
          <Drawer open={open} onClosed={onClosed} />
        </Suspense>
      )}
    </>
  );
}
