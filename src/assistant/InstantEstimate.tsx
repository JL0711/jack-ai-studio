import { useMemo } from 'react';
import { estimate } from '../ai/estimate';
import { fmtCnyRange, fmtDuration, fmtHours, fmtUsdRange } from '../ai/format';
import { emptyRequirements, mergeRequirements, understand } from '../ai/nlu';
import type { Kind, Money } from '../ai/types';
import { useI18n } from '../i18n/I18nProvider';
import { openAssistant, resetAssistant, sendText } from './store';
import { chatT } from './strings';
import './chat.css';

const TYPE_KIND: Record<string, Kind> = { web: 'site', rag: 'rag', local_ai: 'local_ai', automation: 'automation' };
const BUDGET: Record<string, Money> = {
  under_500: { min: 250, max: 500, currency: 'USD' },
  '500_2000': { min: 500, max: 2000, currency: 'USD' },
  '2000_5000': { min: 2000, max: 5000, currency: 'USD' },
  over_5000: { min: 5000, max: 10000, currency: 'USD' },
};

/**
 * After the contact form is sent: the same code that powers the estimate chat
 * reads the visitor's own words (plus the project type and budget they picked)
 * and shows a rough price and timeline straight away.
 */
export default function InstantEstimate({ message, projectType, budget }: { message: string; projectType: string; budget: string | null }) {
  const { lang } = useI18n();
  const t = (k: Parameters<typeof chatT>[1], p?: Record<string, string | number>) => chatT(lang, k, p);
  const est = useMemo(() => {
    const parsed = understand(message);
    let req = mergeRequirements(emptyRequirements(), parsed, message);
    if (!req.kind && TYPE_KIND[projectType]) req = { ...req, kind: TYPE_KIND[projectType] };
    if (!req.budget && budget && BUDGET[budget]) req = { ...req, budget: BUDGET[budget] };
    return estimate(req);
  }, [message, projectType, budget]);
  if (!est) return null;

  const refine = () => {
    resetAssistant();
    // Queued in order: the greeting first, then the visitor's own message.
    openAssistant('/contact', lang);
    void sendText(message, lang);
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
          <button type="button" className="btn btn-secondary btn-small" onClick={() => void refine()}>
            {t('instant.refine')}
          </button>
        </div>
      </footer>
    </div>
  );
}
