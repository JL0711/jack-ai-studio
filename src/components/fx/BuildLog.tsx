import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import type { StringKey } from '../../i18n/strings';
import { useInView, useReducedMotion } from '../../lib/motion';
import { pad2 } from '../../lib/replyHours';
import { phase, useLoop } from './useLoop';

const STEPS = [1, 2, 3, 4, 5] as const;

/** "How I work" as a build log: when it scrolls into view the steps run one by one. */
export function BuildLog() {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>();
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setDone(STEPS.length);
      return;
    }
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setDone(i);
      if (i >= STEPS.length) window.clearInterval(id);
    }, 700);
    return () => window.clearInterval(id);
  }, [inView, reduced]);

  const finished = done >= STEPS.length;

  return (
    <div ref={ref} className="buildlog ticks">
      <div className="buildlog-head">
        <span>
          <b>$</b> {t('process.command')}
        </span>
        <span>
          {done}/{STEPS.length}
        </span>
      </div>
      <ol className="buildlog-steps">
        {STEPS.map((n, i) => {
          const state = i < done ? 'done' : i === done && inView ? 'run' : 'wait';
          return (
            <li key={n} className={`bl-step is-${state}`}>
              <span className="bl-idx">[{pad2(n)}]</span>
              <div className="bl-text">
                <h3>{t(`home.step${n}` as StringKey)}</h3>
                <p>{t(`home.step${n}.desc` as StringKey)}</p>
              </div>
              <span className="bl-status" aria-hidden="true">
                {state === 'done' ? 'OK' : state === 'run' ? <span className="bl-spin" /> : '··'}
              </span>
            </li>
          );
        })}
      </ol>
      <div className={`buildlog-foot${finished ? ' is-done' : ''}`} aria-live="polite">
        {finished ? t('process.done') : t('process.running')}
      </div>
    </div>
  );
}

/** A small, animated copy of the client dashboard: progress, milestones, "Approve". */
export function PortalMock() {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>();
  const live = inView && !reduced;
  const D = 10000;
  const loop = useLoop(D, live);
  const time = live ? loop : 8000;
  const pressing = time > 4300 && time < 4700;
  const approved = time >= 4700;
  const progress = approved ? 60 + Math.round(phase(time, 4700, 6200) * 8) : 28 + Math.round(phase(time, 400, 2600) * 4);

  return (
    <figure ref={ref} className="portal ticks">
      <div className="portal-head" aria-hidden="true">
        <span>{t('nav.dashboard')}</span>
        <span className="live-dot">{t('dash.live')}</span>
      </div>
      <div className="portal-body" aria-hidden="true">
        <div className="portal-title">
          <b>{t('portal.project')}</b>
          <span className="badge badge-in_progress">{t('pstatus.in_progress')}</span>
        </div>
        <div className="progress">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="progress-value">{progress}%</span>
        </div>
        <ul className="portal-ms">
          <li>
            <span>{t('portal.m1')}</span>
            <span className="badge badge-done">{t('mstatus.done')}</span>
          </li>
          <li className={approved ? '' : 'is-waiting'}>
            <span>{t('portal.m2')}</span>
            {approved ? (
              <span className="badge badge-done">{t('mstatus.done')}</span>
            ) : (
              <span className="badge badge-pending_approval">{t('mstatus.pending_approval')}</span>
            )}
          </li>
          <li>
            <span>{t('portal.m3')}</span>
            <span className="badge">{t('mstatus.not_started')}</span>
          </li>
        </ul>
        <div className="portal-action">
          <span className={`portal-btn${pressing ? ' is-pressed' : ''}${approved ? ' is-done' : ''}`}>
            {approved ? `✓ ${t('portal.approved')}` : t('dash.approve')}
          </span>
          {!approved && <span className={`portal-cursor${time > 3200 ? ' is-there' : ''}`} />}
        </div>
        <p className="portal-update">
          <span className="led is-live" />
          {approved ? t('portal.update2') : t('portal.update1')}
        </p>
      </div>
      <figcaption>{t('portal.caption')}</figcaption>
    </figure>
  );
}
