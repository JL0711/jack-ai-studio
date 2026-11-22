import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';

const OPEN_FROM = 9; // reply hours, Beijing time
const OPEN_TO = 15;

interface ZoneTime {
  h: number;
  m: number;
  s: number;
  label: string;
}

function zoneTime(now: Date, timeZone: string, locale: string, hour12: boolean): ZoneTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const label = new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit', hour12 }).format(now);
  return { h: get('hour') % 24, m: get('minute'), s: get('second'), label };
}

function Dial({ time, name }: { time: ZoneTime; name: string }) {
  const hourDeg = (time.h % 12) * 30 + time.m * 0.5;
  const minDeg = time.m * 6 + time.s * 0.1;
  const secDeg = time.s * 6;
  return (
    <div className="clock">
      <svg viewBox="0 0 100 100" className="clock-face" aria-hidden="true">
        <circle cx="50" cy="50" r="46" className="clock-rim" />
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1="50" y1="9" x2="50" y2={i % 3 === 0 ? 17 : 13} transform={`rotate(${i * 30} 50 50)`} className="clock-tick" />
        ))}
        <line x1="50" y1="50" x2="50" y2="28" className="clock-hour" transform={`rotate(${hourDeg} 50 50)`} />
        <line x1="50" y1="50" x2="50" y2="17" className="clock-min" transform={`rotate(${minDeg} 50 50)`} />
        <line x1="50" y1="56" x2="50" y2="14" className="clock-sec" transform={`rotate(${secDeg} 50 50)`} />
        <circle cx="50" cy="50" r="3" className="clock-pin" />
      </svg>
      <div>
        <div className="clock-name">{name}</div>
        <div className="clock-time">{time.label}</div>
      </div>
    </div>
  );
}

/** Live clocks for Beijing and California, and whether it is reply time right now. */
export function ReplyClock() {
  const { t, lang } = useI18n();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const locale = lang === 'zh' ? 'zh-CN' : 'en-US';
  const beijing = zoneTime(now, 'Asia/Shanghai', locale, lang === 'en');
  const pacific = zoneTime(now, 'America/Los_Angeles', locale, lang === 'en');
  const open = beijing.h >= OPEN_FROM && beijing.h < OPEN_TO;

  return (
    <div className="reply-clock">
      <div className="clocks">
        <Dial time={beijing} name={t('home.clock.beijing')} />
        <Dial time={pacific} name={t('home.clock.pacific')} />
      </div>
      <p className={`reply-status ${open ? 'is-open' : 'is-closed'}`}>
        <span className="reply-dot" aria-hidden="true" />
        {open ? t('home.clock.open') : t('home.clock.closed')}
      </p>
    </div>
  );
}
