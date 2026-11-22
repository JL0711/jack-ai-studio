import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ShowcaseBadge } from '../components/Badges';
import { BridgeDiagram } from '../components/BridgeDiagram';
import { CoverArt } from '../components/fx/CoverArt';
import { ArrowLeftIcon, CheckIcon, ExpandIcon } from '../components/Icons';
import { Lightbox } from '../components/Lightbox';
import { findShowcaseProject } from '../data/projects';
import { useI18n } from '../i18n/I18nProvider';
import { assetUrl } from '../lib/format';
import { groupClass, revealClass, useInView } from '../lib/motion';

export default function ShowcaseDetail() {
  const { slug } = useParams();
  const { t, pick } = useI18n();
  const project = findShowcaseProject(slug);
  const [open, setOpen] = useState<number | null>(null);
  const highlights = useInView<HTMLElement>();
  const gallery = useInView<HTMLDivElement>();
  const extra = useInView<HTMLElement>();
  const cta = useInView<HTMLElement>();

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

  const images = (project.images ?? []).map((img) => ({ src: assetUrl(pick(img.src)), alt: pick(img.alt) }));

  return (
    <div className="page detail-page">
      <div className="container narrow">
        <Link to="/showcase" className="back-link">
          <ArrowLeftIcon /> {t('showcase.back')}
        </Link>
        <header className="page-head detail-hero">
          <div className="detail-head">
            <ShowcaseBadge status={project.status} />
            {project.kind && <span className="kind">{pick(project.kind)}</span>}
          </div>
          <h1>{pick(project.title)}</h1>
          <p className="detail-summary">{pick(project.summary)}</p>
          <ul className="tags">
            {project.stack.map((s) => (
              <li key={s} className="tag">
                {s}
              </li>
            ))}
          </ul>
        </header>

        <div className="detail-layout">
          {project.art && !project.images?.length && (
            <div className="card art-banner" role="img" aria-label={t('showcase.illustration')}>
              <CoverArt art={project.art} />
            </div>
          )}

          <section ref={highlights.ref} className={revealClass(highlights.inView, 'card')} data-fx="spot">
            <h2>{t('showcase.highlights')}</h2>
            <ul className={groupClass(highlights.inView, 'highlights')}>
              {pick(project.highlights).map((h) => (
                <li key={h}>
                  <span className="check" aria-hidden="true">
                    <CheckIcon />
                  </span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </section>

          {project.diagram === 'bridge' && (
            <section ref={extra.ref} className={revealClass(extra.inView, 'card')}>
              <h2>{t('showcase.diagram')}</h2>
              <BridgeDiagram />
              <p className="muted small" style={{ margin: '10px 0 0' }}>
                {t('bridge.caption')}
              </p>
            </section>
          )}

          {images.length > 0 && (
            <section>
              <h2>{t('showcase.images')}</h2>
              <div ref={gallery.ref} className={groupClass(gallery.inView, 'gallery')}>
                {images.map((img, i) => (
                  <figure key={project.images?.[i].src.en} data-fx="spot">
                    <button type="button" className="gallery-open" onClick={() => setOpen(i)} title={t('showcase.enlarge')}>
                      <img src={img.src} alt={img.alt} loading="lazy" width={1600} height={1200} />
                      <span className="gallery-zoom" aria-hidden="true">
                        <ExpandIcon />
                      </span>
                    </button>
                    <figcaption>{img.alt}</figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}

          <section ref={cta.ref} className={revealClass(cta.inView, 'cta-band')}>
            <h2>{t('showcase.ctaTitle')}</h2>
            <div className="row">
              <Link to="/contact" className="btn btn-primary btn-lg" data-fx="magnet">
                {t('showcase.ctaBtn')}
              </Link>
            </div>
          </section>
        </div>
      </div>
      {open !== null && images.length > 0 && (
        <Lightbox images={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
