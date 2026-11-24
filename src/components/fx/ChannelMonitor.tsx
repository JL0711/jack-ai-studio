import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SHOWCASE_PROJECTS, type ShowcaseProject, type ShowcaseStatus } from '../../data/projects';
import { useI18n } from '../../i18n/I18nProvider';
import { prefersReducedMotion, useMedia, useOnScreen } from '../../lib/motion';
import { ArrowRightIcon } from '../Icons';
import { ProjectScene } from './Scenes';
import { Scramble } from './Scramble';

export const pad = (n: number) => String(n).padStart(2, '0');

export const LED_FOR: Record<ShowcaseStatus, string> = {
  live: 'is-live',
  in_progress: 'is-wip',
  demo: 'is-demo',
};

const DESKTOP = '(min-width: 980px)';

/** The framed "monitor": channel header, the project's scene, and its facts. */
export function Monitor({
  project,
  index,
  playing,
  switching,
  foot = true,
}: {
  project: ShowcaseProject;
  index: number;
  playing: boolean;
  switching?: boolean;
  /** Title, summary, stack and link under the screen (off on the project page itself). */
  foot?: boolean;
}) {
  const { t, pick } = useI18n();
  return (
    <div className="monitor ticks">
      <div className="monitor-head">
        <span className="monitor-ch">CH {pad(index + 1)}</span>
        <span className="monitor-slug">{project.slug}</span>
        <span className="spacer" />
        <span className={`led ${LED_FOR[project.status]}`} />
        <span>{t(`status.${project.status}`)}</span>
        <span className="monitor-note">{t('scene.note')}</span>
      </div>
      <div className="monitor-screen" aria-hidden="true">
        <div key={project.slug} className="monitor-scene">
          <ProjectScene slug={project.slug} playing={playing} />
        </div>
        {switching && <div key={`static-${index}`} className="monitor-static" aria-hidden="true" />}
      </div>
      {foot && (
      <div className="monitor-foot">
        <div className="monitor-copy">
          {project.kind && <span className="monitor-kind">{pick(project.kind)}</span>}
          <h3>
            <Scramble text={pick(project.title)} trigger={project.slug} duration={650} />
          </h3>
          <p>{pick(project.summary)}</p>
        </div>
        <div className="monitor-side">
          <ul className="tags" aria-label={t('showcase.stack')}>
            {project.stack.map((s) => (
              <li key={s} className="tag">
                {s}
              </li>
            ))}
          </ul>
          <Link to={`/showcase/${project.slug}`} className="btn btn-secondary btn-small">
            {t('showcase.viewDetail')}
            <ArrowRightIcon width={16} height={16} />
          </Link>
        </div>
      </div>
      )}
    </div>
  );
}

/** Phones and narrow windows: one monitor per project, each playing while on screen. */
function StackedChannel({ project, index }: { project: ShowcaseProject; index: number }) {
  const { ref, onScreen } = useOnScreen<HTMLDivElement>();
  return (
    <div ref={ref} className="channel-stacked">
      <Monitor project={project} index={index} playing={onScreen} />
    </div>
  );
}

/**
 * Selected work as TV channels. On a wide screen the monitor pins in place and
 * scrolling flips through the channels (the list on the left jumps straight to one);
 * on a narrow screen the monitors simply stack.
 */
export function ChannelMonitor() {
  const { t, pick } = useI18n();
  const projects = SHOWCASE_PROJECTS;
  const n = projects.length;
  const desktop = useMedia(DESKTOP);
  const wrapRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);
  const [switched, setSwitched] = useState(false);
  const { ref: stickyRef, onScreen } = useOnScreen<HTMLDivElement>();

  useEffect(() => {
    if (!desktop) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 60;
      const sticky = window.innerHeight - header;
      const travel = Math.max(1, rect.height - sticky);
      const p = Math.min(0.9999, Math.max(0, (header - rect.top) / travel));
      const next = Math.floor(p * n);
      if (next !== activeRef.current) {
        activeRef.current = next;
        setActive(next);
        setSwitched(true);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [desktop, n]);

  const jump = (i: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 60;
    const travel = rect.height - (window.innerHeight - header);
    const top = window.scrollY + rect.top - header + (travel * (i + 0.5)) / n;
    window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  if (!desktop) {
    return (
      <div className="channels-stack">
        {projects.map((p, i) => (
          <StackedChannel key={p.slug} project={p} index={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="channels" ref={wrapRef} style={{ ['--channels' as string]: n }}>
      <div className="channels-sticky" ref={stickyRef}>
        <nav className="channel-list" aria-label={t('home.workTitleShort')}>
          <ol>
            {projects.map((p, i) => (
              <li key={p.slug}>
                <button type="button" className={i === active ? 'is-on' : ''} aria-current={i === active} onClick={() => jump(i)}>
                  <span className="ch-num">{pad(i + 1)}</span>
                  <span className="ch-title">{pick(p.title)}</span>
                  <span className={`led ${LED_FOR[p.status]}`} aria-hidden="true" />
                  <span className="visually-hidden">{t(`status.${p.status}`)}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="channel-progress" aria-hidden="true">
            <span>
              {pad(active + 1)} / {pad(n)}
            </span>
            <span className="channel-meter">
              {projects.map((p, i) => (
                <i key={p.slug} className={i <= active ? 'is-on' : ''} />
              ))}
            </span>
            <span className="channel-hint">{t('home.workHint')}</span>
          </div>
        </nav>
        <Monitor project={projects[active]} index={active} playing={onScreen} switching={switched} />
      </div>
    </div>
  );
}
