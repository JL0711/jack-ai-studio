import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="site-footer">
      <div className="container">
        <span>{t('footer.location')}</span>
        <span>
          <Link to="/contact">{t('footer.contact')}</Link>
        </span>
        <span>{t('footer.built')}</span>
      </div>
    </footer>
  );
}
