import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';
import { isChunkLoadError, isReloading, reloadOnceForUpdate } from '../lib/chunkErrors';
import { RouteLoading } from './RouteLoading';

function ErrorPage({ update }: { update: boolean }) {
  const { t } = useI18n();
  return (
    <div className="page">
      <div className="container narrow">
        <h1>{t('error.title')}</h1>
        <p className="muted">{t(update ? 'error.update' : 'error.body')}</p>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            {t('error.reload')}
          </button>
          <Link to="/" className="btn btn-secondary">
            {t('nf.back')}
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Catches a page that fails to render, so the header and footer stay and the
 * visitor gets a way out instead of a blank screen. A page file that can't be
 * fetched (usually: the site was updated while this tab was open) reloads once.
 * Layout keys it by route, so moving to another page clears the error.
 */
export class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (isReloading() || (isChunkLoadError(error) && reloadOnceForUpdate())) {
      this.forceUpdate(); // show "loading" while the page reloads
      return;
    }
    console.error('[page error]', error, info.componentStack);
  }

  render() {
    // A reload is already on its way (see main.tsx): no error flash in between.
    if (this.state.error && isReloading()) return <RouteLoading />;
    if (this.state.error) return <ErrorPage update={isChunkLoadError(this.state.error)} />;
    return this.props.children;
  }
}
