import { Link } from 'react-router-dom';
import { ShowcaseBadge } from '../components/Badges';
import { BridgeDiagram } from '../components/BridgeDiagram';
import { SHOWCASE_PROJECTS, type ShowcaseProject } from '../data/projects';
import { useI18n } from '../i18n/I18nProvider';
import { assetUrl } from '../lib/format';

function Thumb({ project }: { project: ShowcaseProject }) {
  const { pick } = useI18n();
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
      <div className="thumb">
        <BridgeDiagram />
      </div>
    );
  }
  return null;
}

export default function Showcase() {
  const { t, pick } = useI18n();
  return (
    <div className="page">
      <div className="container">
        <header className="page-head">
          <h1>{t('showcase.title')}</h1>
          <p>{t('showcase.intro')}</p>
        </header>
        <div className="grid grid-2">
          {SHOWCASE_PROJECTS.map((p) => (
            <article key={p.slug} className="card project-card">
              <Thumb project={p} />
              <div className="body">
                <div className="row">
                  <ShowcaseBadge status={p.status} />
                  {p.kind && <span className="kind">{pick(p.kind)}</span>}
                </div>
                <h3>
                  <Link to={`/showcase/${p.slug}`}>{pick(p.title)}</Link>
                </h3>
                <p className="summary">{pick(p.summary)}</p>
                <ul className="tags" aria-label={t('showcase.stack')}>
                  {p.stack.map((s) => (
                    <li key={s} className="tag">
                      {s}
                    </li>
                  ))}
                </ul>
                <div>
                  <Link to={`/showcase/${p.slug}`} className="btn btn-secondary btn-small">
                    {t('showcase.viewDetail')}
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
