import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LED_FOR, pad } from '../components/fx/ChannelMonitor';
import { ProjectScene } from '../components/fx/Scenes';
import { Scramble } from '../components/fx/Scramble';
import { ArrowRightIcon } from '../components/Icons';
import { SHOWCASE_PROJECTS, type ShowcaseProject, type ShowcaseStatus } from '../data/projects';
import { useI18n } from '../i18n/I18nProvider';
import { hasFinePointer, useOnScreen } from '../lib/motion';
import { useDocumentTitle } from '../lib/useDocumentTitle';

function ProjectTile({ project, index }: { project: ShowcaseProject; index: number }) {
  const { t, pick } = useI18n();
  const { ref, onScreen } = useOnScreen<HTMLElement>();
  const [hover, setHover] = useState(false);
  // With a mouse the scene plays on hover; on touch screens it plays while visible.
  const playing = onScreen && (hover || !hasFinePointer());
  return (
    <article
      ref={ref}
      className="tile ticks"
      style={{ ['--i' as string]: index % 2 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="tile-head">
        <span className="monitor-ch">CH {pad(SHOWCASE_PROJECTS.indexOf(project) + 1)}</span>
        <span className="monitor-slug">{project.slug}</span>
        <span className="spacer" />
        <span className={`led ${LED_FOR[project.status]}`} aria-hidden="true" />
        <span>{t(`status.${project.status}`)}</span>
        <span className="monitor-note">{t('scene.note')}</span>
      </div>
      <div className="tile-screen" role="img" aria-label={t('showcase.illustration')}>
        <ProjectScene slug={project.slug} playing={playing} />
      </div>
      <div className="tile-body">
        {project.kind && <span className="monitor-kind">{pick(project.kind)}</span>}
        <h2 className="tile-title">
          <Link to={`/showcase/${project.slug}`} className="stretched">
            {pick(project.title)}
          </Link>
        </h2>
        <p className="tile-summary">{pick(project.summary)}</p>
        <ul className="tags" aria-label={t('showcase.stack')}>
          {project.stack.map((s) => (
            <li key={s} className="tag">
              {s}
            </li>
          ))}
        </ul>
        <span className="tile-more" aria-hidden="true">
          {t('showcase.viewDetail')}
          <ArrowRightIcon width={16} height={16} />
        </span>
      </div>
    </article>
  );
}

const FILTERS: ('all' | ShowcaseStatus)[] = ['all', 'live', 'in_progress', 'demo'];

export default function Showcase() {
  const { t } = useI18n();
  useDocumentTitle(t('showcase.title'));
  const [filter, setFilter] = useState<'all' | ShowcaseStatus>('all');
  const shown = SHOWCASE_PROJECTS.filter((p) => filter === 'all' || p.status === filter);
  const count = (f: 'all' | ShowcaseStatus) =>
    f === 'all' ? SHOWCASE_PROJECTS.length : SHOWCASE_PROJECTS.filter((p) => p.status === f).length;

  return (
    <div className="page showcase-page">
      <div className="container wide">
        <header className="page-head">
          <span className="kicker">
            <b>02</b>
            <span aria-hidden="true">//</span>
            {t('showcase.kicker', { n: SHOWCASE_PROJECTS.length })}
          </span>
          <h1>
            <Scramble text={t('showcase.title')} />
          </h1>
          <p>{t('showcase.intro')}</p>
        </header>
        <div className="filter-bar" role="group" aria-label={t('showcase.filter')}>
          {FILTERS.filter((f) => count(f) > 0).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f !== 'all' && <span className={`led ${LED_FOR[f]}`} aria-hidden="true" />}
              {f === 'all' ? t('showcase.filterAll') : t(`status.${f}`)}
              <span className="filter-count">{pad(count(f))}</span>
            </button>
          ))}
        </div>
        <p className="tile-hint">{t('showcase.hoverHint')}</p>
        <div className="tile-grid" key={filter}>
          {shown.map((p, i) => (
            <ProjectTile key={p.slug} project={p} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
