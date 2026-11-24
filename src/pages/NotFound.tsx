import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export default function NotFound() {
  const { t } = useI18n();
  useDocumentTitle(t('nf.title'));
  return (
    <div className="page">
      <div className="container narrow">
        <h1>{t('nf.title')}</h1>
        <Link to="/" className="btn btn-secondary">
          {t('nf.back')}
        </Link>
      </div>
    </div>
  );
}
