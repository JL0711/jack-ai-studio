import { useMemo, useRef } from 'react';
import { estimate } from '../ai/estimate';
import { fmtCnyRange, fmtDuration, fmtHours, fmtUsdRange } from '../ai/format';
import { useI18n } from '../i18n/I18nProvider';
import { formBrief } from './refine';
import { getAssistant, openAssistant, resetAssistant, sendText } from './store';
import { chatT } from './strings';
import './chat.css';

/**
 * After the contact form is sent: the same code that powers the estimate chat
 * reads the visitor's own words (plus the project type and budget they picked)
 * and shows a rough price and timeline straight away.
 */
export default function InstantEstimate({ message, projectType, budget }: { message: string; projectType: string; budget: string | null }) {
  const { lang } = useI18n();
  const t = (k: Parameters<typeof chatT>[1], p?: Record<string, string | number>) => chatT(lang, k, p);
  const brief = useMemo(() => formBrief(message, projectType, budget, lang), [message, projectType, budget, lang]);
  const est = useMemo(() => estimate(brief.req), [brief]);
  const refined = useRef(false);
  if (!est) return null;

  const refine = () => {
    // Already handed to the chat (a second click): just show it again.
    if (refined.current) {
      openAssistant('/contact', lang);
      return;
    }
    refined.current = true;
    // An earlier conversation in this tab is never wiped silently: ask, and otherwise continue it.
    if (getAssistant().messages.length > 1 && window.confirm(t('instant.confirmNew'))) resetAssistant();
    // Queued in order: the greeting first (if the chat is empty), then the visitor's message
    // with the type and budget from the form, so the chat starts from the same numbers as this card.
    openAssistant('/contact', lang);
    void sendText(brief.chatText, lang);
  };

  return (
    <div className="as-card ticks as-instant" lang={lang === 'zh' ? 'zh-CN' : 'en'}>
      <header className="as-card-head">
        <span className="as-card-kicker">
          <i className="led is-live" aria-hidden="true" />
          {t('instant.kicker')}
        </span>
      </header>
      <p className="as-instant-lead">{t('instant.lead')}</p>
      <div className="as-price">
        <b>{fmtUsdRange(est.usd)}</b>
        {lang === 'zh' && <span className="as-price-cny">约 {fmtCnyRange(est.cny)}</span>}
      </div>
      <dl className="as-stats">
        <div>
          <dt>{t('est.duration')}</dt>
          <dd>{fmtDuration(est.days, lang)}</dd>
        </div>
        <div>
          <dt>{t('est.first')}</dt>
          <dd>{t('est.firstDay', { a: est.firstVersionDay[0], b: est.firstVersionDay[1] })}</dd>
        </div>
        <div>
          <dt>{t('est.hours')}</dt>
          <dd>{fmtHours(est.hours, lang)}</dd>
        </div>
      </dl>
      <footer className="as-card-foot">
        <p className="as-disclaimer">{t('est.disclaimer')}</p>
        <div className="row">
          <button type="button" className="btn btn-secondary btn-small" onClick={refine}>
            {t('instant.refine')}
          </button>
        </div>
      </footer>
    </div>
  );
}
