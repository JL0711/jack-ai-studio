import { Component, Suspense, lazy, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { demoFor } from '../demos/registry';
import { useI18n } from '../i18n/I18nProvider';
import { isChunkLoadError, reloadOnceForUpdate } from '../lib/chunkErrors';
import { useInView } from '../lib/motion';
import { ArrowRightIcon } from './Icons';

/** If a demo crashes, the rest of the project page keeps working. */
class DemoBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    if (isChunkLoadError(error) && reloadOnceForUpdate()) return;
    console.error('[demo error]', error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * "Try it" section on a showcase project page. The demo's code is downloaded
 * only when the section comes near the screen (or the visitor clicks "Try it").
 */
export function TryPanel({ slug, autoOpen = false }: { slug: string; autoOpen?: boolean }) {
  const { t, pick } = useI18n();
  const info = demoFor(slug);
  const { ref, inView } = useInView<HTMLElement>();
  const [forced, setForced] = useState(autoOpen);
  const Demo = useMemo(() => (info ? lazy(info.load) : null), [info]);
  if (!info || !Demo) return null;
  const show = inView || forced;

  return (
    <section ref={ref} id="try" className="try-section" aria-labelledby="try-title" tabIndex={-1}>
      <header className="try-head">
        <span className="kicker">
          <b>TRY</b>
          <span aria-hidden="true">//</span>
          {t('try.kicker')}
          {info.simulated && <span className="try-sim">{t('try.simulated')}</span>}
        </span>
        <h2 id="try-title">{pick(info.title)}</h2>
        <p className="try-note">{pick(info.note)}</p>
      </header>
      <div className="try-body ticks">
        {show ? (
          <DemoBoundary
            fallback={
              <div className="notice notice-error" role="alert">
                <p>{t('try.error')}</p>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => window.location.reload()}>
                  {t('error.reload')}
                </button>
              </div>
            }
          >
            <Suspense
              fallback={
                <p className="muted try-loading" role="status">
                  {t('try.loading')}
                </p>
              }
            >
              <Demo />
            </Suspense>
          </DemoBoundary>
        ) : (
          <button type="button" className="btn btn-secondary try-start" onClick={() => setForced(true)}>
            {t('try.start')}
          </button>
        )}
      </div>
      <footer className="try-foot">
        <span className="muted">{t('try.ctaText')}</span>
        <Link to={`/quote?kind=${encodeURIComponent(info.quoteKind)}&from=${encodeURIComponent(slug)}`} className="btn btn-primary btn-small">
          {t('try.ctaQuote')}
          <ArrowRightIcon width={16} height={16} />
        </Link>
        <Link to="/contact" className="btn btn-secondary btn-small">
          {t('showcase.ctaBtn')}
        </Link>
      </footer>
    </section>
  );
}

/** Scrolls to the "Try it" section and moves keyboard focus there. */
export function scrollToTry() {
  const el = document.getElementById('try');
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
}
