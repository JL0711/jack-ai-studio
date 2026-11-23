import { useI18n } from '../../i18n/I18nProvider';
import {
  BEIJING,
  OPEN_FROM,
  OPEN_UNTIL,
  PACIFIC,
  beijingOffset,
  hhmm,
  isReplyOpen,
  pad2,
  useNow,
  zoneTime,
} from '../../lib/replyHours';

const TICKS = [0, 3, 6, 9, 12, 15, 18, 21];
const pct = (h: number) => `${(h / 24) * 100}%`;

/**
 * Reply hours as two 24-hour rulers, California on top and Beijing below,
 * with the reply window shaded and a live "now" line across both.
 */
export function TimeStrip() {
  const { t } = useI18n();
  const now = useNow(1000);
  const pt = zoneTime(now, PACIFIC);
  const bj = zoneTime(now, BEIJING);
  const offset = beijingOffset(now);
  const open = isReplyOpen(now);
  const nowH = pt.h + pt.m / 60 + pt.s / 3600;

  return (
    <div className="tz">
      <div className="tz-board">
        <div className="tz-zones" aria-hidden="true">
          <span>{t('home.clock.pacific')}</span>
          <span>{t('home.clock.beijing')}</span>
        </div>
        <div className="tz-tracks" aria-hidden="true">
          <span className="tz-open" style={{ left: pct(OPEN_FROM), width: pct(24 - OPEN_FROM) }} />
          <span className="tz-open" style={{ left: 0, width: pct(OPEN_UNTIL) }} />
          <div className="tz-row">
            {TICKS.map((h) => (
              <span key={h} className="tz-tick" style={{ left: pct(h) }}>
                {pad2(h)}
              </span>
            ))}
          </div>
          <div className="tz-row">
            {TICKS.map((h) => (
              <span key={h} className="tz-tick" style={{ left: pct(h) }}>
                {pad2((h + offset) % 24)}
              </span>
            ))}
          </div>
          <span className={`tz-now${nowH > 18 ? ' is-flip' : ''}`} style={{ left: pct(nowH) }}>
            <b>{hhmm(pt)}</b>
            <b>{hhmm(bj)}</b>
          </span>
        </div>
      </div>
      <p className={`tz-status${open ? ' is-open' : ''}`} role="status">
        <span className={`led ${open ? 'is-live' : 'is-off'}`} aria-hidden="true" />
        {open ? t('home.clock.open') : t('home.clock.closed')}
        <span className="tz-clock">
          {t('home.clock.pacific')} {hhmm(pt)} · {t('home.clock.beijing')} {hhmm(bj)}
        </span>
      </p>
    </div>
  );
}
