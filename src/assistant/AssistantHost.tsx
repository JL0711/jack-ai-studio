import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ChatIcon } from '../components/Icons';
import { useI18n } from '../i18n/I18nProvider';
import { openAssistant, useAssistant } from './store';

const loadDrawer = () => import('./Drawer');
const Drawer = lazy(loadDrawer);

/** Pages where the floating button would be in the way (or the chat is the page). */
const HIDDEN = /^\/(quote|login|reset-password|dashboard)(\/|$)/;

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
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  const onClosed = useCallback(() => undefined, []);

  const slug = pathname.match(/^\/showcase\/([^/]+)/)?.[1];
  const unread = messages.length > 0 && !open;

  return (
    <>
      {!hidden && !open && (
        <button
          type="button"
          className={`as-launcher${unread ? ' has-chat' : ''}`}
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
