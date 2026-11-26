import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { CloseIcon, ExpandIcon, RefreshIcon } from '../components/Icons';
import { useI18n } from '../i18n/I18nProvider';
import { useChatT } from './strings';
import { useMedia } from '../lib/motion';
import { ChatPanel } from './ChatPanel';
import { closeAssistant, resetAssistant, start, useAssistant } from './store';

/**
 * The floating chat. On a wide screen it is a side panel next to the page (you
 * can keep browsing the showcase while you talk); on a phone it covers the
 * screen like a dialog. Escape closes it.
 */
export default function Drawer({ open, onClosed }: { open: boolean; onClosed: () => void }) {
  const { lang } = useI18n();
  const t = useChatT();
  const { messages } = useAssistant();
  const phone = useMedia('(max-width: 640px)');
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAssistant();
      // On a phone the drawer is modal: keep Tab inside it.
      if (e.key === 'Tab' && phone && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], textarea, input:not([tabindex="-1"]), summary, [tabindex]:not([tabindex="-1"])',
        );
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        const active = document.activeElement;
        const outside = !active || active === panel.current || !panel.current.contains(active);
        if (e.shiftKey && (active === first || outside)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || outside)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    if (phone) {
      document.documentElement.classList.add('as-locked');
      // A modal dialog takes focus when it opens. The dialog itself, not the text box:
      // focusing that would pop the keyboard up over the conversation.
      if (panel.current && !panel.current.contains(document.activeElement)) panel.current.focus({ preventScroll: true });
    }
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('as-locked');
      // Where focus goes next is up to the host: the chat button is re-created after this.
      onClosed();
    };
  }, [open, phone, onClosed]);

  if (!open) return null;

  const reset = () => {
    if (messages.length > 1 && !window.confirm(t('assistant.resetConfirm'))) return;
    resetAssistant();
    void start(lang);
  };

  return (
    <div
      ref={panel}
      className="as-drawer"
      role="dialog"
      aria-modal={phone ? 'true' : 'false'}
      aria-labelledby="as-drawer-title"
      tabIndex={-1}
    >
      <header className="as-drawer-head">
        <span className="as-drawer-led" aria-hidden="true" />
        <div className="as-drawer-titles">
          <h2 id="as-drawer-title">{t('assistant.title')}</h2>
          <span className="as-drawer-sub">{t('assistant.subtitle')}</span>
        </div>
        <span className="spacer" />
        <button type="button" className="icon-btn" onClick={reset} title={t('assistant.reset')} aria-label={t('assistant.reset')}>
          <RefreshIcon />
        </button>
        <Link to="/quote" className="icon-btn" title={t('assistant.expand')} aria-label={t('assistant.expand')} onClick={() => closeAssistant(true)}>
          <ExpandIcon />
        </Link>
        <button type="button" className="icon-btn" onClick={() => closeAssistant()} title={t('assistant.close')} aria-label={t('assistant.close')}>
          <CloseIcon width={18} height={18} />
        </button>
      </header>
      <ChatPanel variant="drawer" />
    </div>
  );
}
