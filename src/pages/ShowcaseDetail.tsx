import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ShowcaseBadge } from '../components/Badges';
import { BridgeDiagram } from '../components/BridgeDiagram';
import { Monitor, pad } from '../components/fx/ChannelMonitor';
import { hasScene } from '../components/fx/Scenes';
import { Scramble } from '../components/fx/Scramble';
import { ArrowLeftIcon, ArrowRightIcon, ExpandIcon } from '../components/Icons';
import { Lightbox } from '../components/Lightbox';
import { SHOWCASE_PROJECTS, findShowcaseProject } from '../data/projects';
import { useI18n } from '../i18n/I18nProvider';
import { assetUrl } from '../lib/format';
import { groupClass, revealClass, useInView, useOnScreen } from '../lib/motion';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export default function ShowcaseDetail() {
  const { slug } = useParams();
  const { t, pick } = useI18n();
  const project = findShowcaseProject(slug);
  const [open, setOpen] = useState<number | null>(null);
  const highlights = useInView<HTMLOListElement>();
  const gallery = useInView<HTMLDivElement>();
  const extra = useInView<HTMLElement>();
  const screen = useOnScreen<HTMLDivElement>();
  useDocumentTitle(project ? pick(project.title) : t('showcase.title'));

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

  const index = SHOWCASE_PROJECTS.indexOf(project);
  const next = SHOWCASE_PROJECTS[(index + 1) % SHOWCASE_PROJECTS.length];
  const images = (project.images ?? []).map((img) => ({ src: assetUrl(pick(img.src)), alt: pick(img.alt) }));

  return (
    <div className="page detail-page">
      <div className="container wide">
        <Link to="/showcase" className="back-link">
          <ArrowLeftIcon /> {t('showcase.back')}
        </Link>
        <div className="detail-top">
          <header className="detail-hero">
            <span className="kicker">
              <b>CH {pad(index + 1)}</b>
              <span aria-hidden="true">//</span>
              {project.slug}
            </span>
            <div className="detail-head">
              <ShowcaseBadge status={project.status} />
              {project.kind && <span className="monitor-kind">{pick(project.kind)}</span>}
            </div>
            <h1>
              <Scramble text={pick(project.title)} trigger={project.slug} />
            </h1>
            <p className="detail-summary">{pick(project.summary)}</p>
            <dl className="detail-spec">
              <div>
                <dt>{t('showcase.stack')}</dt>
                <dd>
                  <ul className="tags">
                    {project.stack.map((s) => (
                      <li key={s} className="tag">
                        {s}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
          </header>

          {hasScene(project.slug) && (
            <div ref={screen.ref} className="detail-monitor" role="img" aria-label={t('showcase.illustration')}>
              <Monitor project={project} index={index} playing={screen.onScreen} foot={false} />
            </div>
          )}
        </div>

        <div className="detail-layout">
          <section className="detail-section">
            <h2 className="detail-h2">
              <span className="kicker">
                <b>A</b>
                <span aria-hidden="true">//</span>
              </span>
              {t('showcase.highlights')}
            </h2>
            <ol ref={highlights.ref} className={groupClass(highlights.inView, 'log-list')}>
              {pick(project.highlights).map((h, i) => (
                <li key={h}>
                  <span className="log-idx" aria-hidden="true">
                    {pad(i + 1)}
                  </span>
                  <span>{h}</span>
                </li>
              ))}
            </ol>
          </section>

          {project.diagram === 'bridge' && (
            <section ref={extra.ref} className={revealClass(extra.inView, 'detail-section')}>
              <h2 className="detail-h2">
                <span className="kicker">
                  <b>B</b>
                  <span aria-hidden="true">//</span>
                </span>
                {t('showcase.diagram')}
              </h2>
              <div className="diagram-frame ticks">
                <BridgeDiagram />
              </div>
              <p className="muted small" style={{ margin: '12px 0 0' }}>
                {t('bridge.caption')}
              </p>
            </section>
          )}

          {images.length > 0 && (
            <section className="detail-section">
              <h2 className="detail-h2">
                <span className="kicker">
                  <b>B</b>
                  <span aria-hidden="true">//</span>
                </span>
                {t('showcase.images')}
              </h2>
              <div ref={gallery.ref} className={groupClass(gallery.inView, 'gallery')}>
                {images.map((img, i) => (
                  <figure key={project.images?.[i].src.en} className="ticks">
                    <button type="button" className="gallery-open" onClick={() => setOpen(i)} title={t('showcase.enlarge')}>
                      <img src={img.src} alt={img.alt} loading="lazy" width={1600} height={1200} />
                      <span className="gallery-zoom" aria-hidden="true">
                        <ExpandIcon />
                      </span>
                    </button>
                    <figcaption>
                      <span className="log-idx" aria-hidden="true">
                        IMG {pad(i + 1)}
                      </span>
                      {img.alt}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="detail-next">
          <section className="cta-term ticks">
            <h2 className="cta-title">
              <span className="cta-prompt" aria-hidden="true">
                ›
              </span>
              {t('showcase.ctaTitle')}
              <span className="cta-caret" aria-hidden="true" />
            </h2>
            <div className="row">
              <Link to="/contact" className="btn btn-primary btn-lg">
                {t('showcase.ctaBtn')}
                <ArrowRightIcon />
              </Link>
            </div>
          </section>
          <Link to={`/showcase/${next.slug}`} className="next-link ticks">
            <span className="kicker">
              <b>{t('showcase.next')}</b>
              <span aria-hidden="true">//</span>
              CH {pad(SHOWCASE_PROJECTS.indexOf(next) + 1)}
            </span>
            <span className="next-title">{pick(next.title)}</span>
            <ArrowRightIcon />
          </Link>
        </div>
      </div>
      {open !== null && images.length > 0 && (
        <Lightbox images={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
