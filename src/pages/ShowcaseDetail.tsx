import { Link, useParams } from 'react-router-dom';
import { ShowcaseBadge } from '../components/Badges';
import { BridgeDiagram } from '../components/BridgeDiagram';
import { ArrowLeftIcon } from '../components/Icons';
import { findShowcaseProject } from '../data/projects';
import { useI18n } from '../i18n/I18nProvider';
import { assetUrl } from '../lib/format';

export default function ShowcaseDetail() {
  const { slug } = useParams();
  const { t, pick } = useI18n();
  const project = findShowcaseProject(slug);

  if (!project) {
    return (
      <div className="page">
        <div className="container narrow">
          <Link to="/showcase" className="back-link">
            <ArrowLeftIcon /> {t('showcase.back')}
          </Link>
          <p className="empty">{t('showcase.notFound')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container narrow">
        <Link to="/showcase" className="back-link">
          <ArrowLeftIcon /> {t('showcase.back')}
        </Link>
        <div className="detail-head">
          <ShowcaseBadge status={project.status} />
          {project.kind && <span className="kind">{pick(project.kind)}</span>}
        </div>
        <h1>{pick(project.title)}</h1>
        <p className="muted" style={{ fontSize: '1.08rem' }}>
          {pick(project.summary)}
        </p>

        <div className="detail-layout">
          <section className="card">
            <h2>{t('showcase.highlights')}</h2>
            <ul className="highlights">
              {pick(project.highlights).map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
            <h3 style={{ marginTop: 20 }}>{t('showcase.stack')}</h3>
            <ul className="tags">
              {project.stack.map((s) => (
                <li key={s} className="tag">
                  {s}
                </li>
              ))}
            </ul>
          </section>

          {project.diagram === 'bridge' && (
            <section className="card">
              <h2>{t('showcase.diagram')}</h2>
              <BridgeDiagram />
              <p className="muted small" style={{ margin: '10px 0 0' }}>
                {t('bridge.caption')}
              </p>
            </section>
          )}

          {project.images && project.images.length > 0 && (
            <section>
              <h2>{t('showcase.images')}</h2>
              <div className="gallery">
                {project.images.map((img) => (
                  <figure key={img.src}>
                    <a href={assetUrl(img.src)} target="_blank" rel="noopener" title={t('showcase.openImage')}>
                      <img src={assetUrl(img.src)} alt={pick(img.alt)} loading="lazy" width={1600} height={1200} />
                    </a>
                    <figcaption>{pick(img.alt)}</figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}

          <section className="cta-band">
            <h2>{t('showcase.ctaTitle')}</h2>
            <div className="row">
              <Link to="/contact" className="btn btn-primary">
                {t('showcase.ctaBtn')}
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
