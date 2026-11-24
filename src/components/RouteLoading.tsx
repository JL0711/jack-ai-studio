import { useI18n } from '../i18n/I18nProvider';

/** Shown for the moment it takes to fetch a page that is loaded on demand (see App.tsx). */
export function RouteLoading() {
  const { t } = useI18n();
  return (
    <div className="page">
      <div className="container">
        <p className="muted route-loading" role="status">
          {t('common.loading')}
        </p>
      </div>
    </div>
  );
}
