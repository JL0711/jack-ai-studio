import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { estimate } from '../ai/estimate';
import { fmtCnyRange, fmtDuration, fmtHours, fmtUsdRange } from '../ai/format';
import { ChatPanel } from '../assistant/ChatPanel';
import { closeAssistant, getAssistant, start, useAssistant } from '../assistant/store';
import { Scramble } from '../components/fx/Scramble';
import { useI18n } from '../i18n/I18nProvider';
import { BEIJING, PACIFIC, hhmm, isReplyOpen, useNow, zoneTime } from '../lib/replyHours';
import { useDocumentTitle } from '../lib/useDocumentTitle';

function ReplyLine() {
  const { t } = useI18n();
  const now = useNow(30000);
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

/** /quote — the estimate assistant as a full page (link Jack can send to clients). */
export default function Quote() {
  const { t, lang } = useI18n();
  useDocumentTitle(t('quote.title'));
  const [params] = useSearchParams();
  const { state } = useAssistant();

  useEffect(() => {
    closeAssistant();
    if (!getAssistant().messages.length) void start(lang, params.get('from') ?? undefined, params.get('kind') ?? undefined);
    // Start once per visit; later language switches don't restart the chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const est = useMemo(() => (state && state.estimates > 0 ? estimate(state.req) : null), [state]);

  return (
    <div className="page quote-page">
      <div className="container wide">
        <header className="page-head">
          <span className="kicker">
            <b>03</b>
            <span aria-hidden="true">//</span>
            {t('quote.kicker')}
          </span>
          <h1>
            <Scramble text={t('quote.title')} />
          </h1>
          <p>{t('quote.intro')}</p>
        </header>

        <div className="quote-layout">
          <section className="quote-chat ticks" aria-label={t('assistant.dialog')}>
            <ChatPanel variant="page" />
          </section>
          <aside className="quote-aside">
            <div className="card quote-live" aria-live="polite">
              <h2 className="aside-h">{t('quote.summary')}</h2>
              {est ? (
                <>
                  <b>{fmtUsdRange(est.usd)}</b>
                  {lang === 'zh' && <span className="muted small">约 {fmtCnyRange(est.cny)}</span>}
                  <dl>
                    <div>
                      <dt>{t('est.hours')}</dt>
                      <dd>{fmtHours(est.hours, lang)}</dd>
                    </div>
                    <div>
                      <dt>{t('est.duration')}</dt>
                      <dd>{fmtDuration(est.days, lang)}</dd>
                    </div>
                    <div>
                      <dt>{t('est.first')}</dt>
                      <dd>{t('est.firstDay', { a: est.firstVersionDay[0], b: est.firstVersionDay[1] })}</dd>
                    </div>
                  </dl>
                  <p className="muted small" style={{ margin: 0 }}>
                    {t('est.disclaimer')}
                  </p>
                </>
              ) : (
                <p className="muted small" style={{ margin: 0 }}>
                  {t('quote.empty')}
                </p>
              )}
            </div>
            <div className="card">
              <h2 className="aside-h">{t('quote.howTitle')}</h2>
              <ol className="quote-how">
                <li>{t('quote.how1')}</li>
                <li>{t('quote.how2')}</li>
                <li>{t('quote.how3')}</li>
              </ol>
            </div>
            <div className="card">
              <h2 className="aside-h">{t('home.hoursTitle')}</h2>
              <ReplyLine />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
