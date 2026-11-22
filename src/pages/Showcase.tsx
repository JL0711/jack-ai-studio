import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShowcaseBadge } from '../components/Badges';
import { BridgeDiagram } from '../components/BridgeDiagram';
import { CoverArt } from '../components/fx/CoverArt';
import { ArrowRightIcon } from '../components/Icons';
import { SHOWCASE_PROJECTS, type ShowcaseProject, type ShowcaseStatus } from '../data/projects';
import { useI18n } from '../i18n/I18nProvider';
import { assetUrl } from '../lib/format';
import { revealClass, useInView } from '../lib/motion';

function Thumb({ project }: { project: ShowcaseProject }) {
  const { t, pick } = useI18n();
  const image = project.images?.[0];
  if (image) {
    return (
      <div className="thumb">
        <img src={assetUrl(pick(image.src))} alt={pick(image.alt)} loading="lazy" width={1600} height={1200} />
      </div>
    );
  }
  if (project.diagram === 'bridge') {
    return (
      <div className="thumb thumb-diagram">
        <BridgeDiagram />
      </div>
    );
  }
  if (project.art) {
    return (
      <div className="thumb" role="img" aria-label={t('showcase.illustration')}>
        <CoverArt art={project.art} />
      </div>
    );
  }
  return null;
}

function ProjectCard({ project, index }: { project: ShowcaseProject; index: number }) {
  const { t, pick } = useI18n();
  const { ref, inView } = useInView<HTMLElement>();
  return (
    <article
      ref={ref}
      className={revealClass(inView, 'card project-card')}
      style={{ ['--i' as string]: index % 3 }}
      data-fx="tilt spot"
    >
      <Thumb project={project} />
      <div className="body">
        <div className="row">
          <ShowcaseBadge status={project.status} />
          {project.kind && <span className="kind">{pick(project.kind)}</span>}
        </div>
        <h3>
          <Link to={`/showcase/${project.slug}`} className="stretched">
            {pick(project.title)}
          </Link>
        </h3>
        <p className="summary">{pick(project.summary)}</p>
        <ul className="tags" aria-label={t('showcase.stack')}>
          {project.stack.map((s) => (
            <li key={s} className="tag">
              {s}
            </li>
          ))}
        </ul>
        <span className="card-more" aria-hidden="true">
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
  const [filter, setFilter] = useState<'all' | ShowcaseStatus>('all');
  const shown = SHOWCASE_PROJECTS.filter((p) => filter === 'all' || p.status === filter);
  const count = (f: 'all' | ShowcaseStatus) =>
    f === 'all' ? SHOWCASE_PROJECTS.length : SHOWCASE_PROJECTS.filter((p) => p.status === f).length;

  return (
    <div className="page">
      <div className="container wide">
        <header className="page-head">
          <h1>{t('showcase.title')}</h1>
          <p>{t('showcase.intro')}</p>
        </header>
        <div className="filter-bar" role="group" aria-label={t('showcase.filter')}>
          {FILTERS.filter((f) => count(f) > 0).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'all' ? t('showcase.filterAll') : t(`status.${f}`)}
              <span className="filter-count">{count(f)}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-2 project-grid" key={filter}>
          {shown.map((p, i) => (
            <ProjectCard key={p.slug} project={p} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
