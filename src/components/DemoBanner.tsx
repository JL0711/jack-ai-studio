import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/I18nProvider';
import type { ViewerRole } from '../lib/types';

const ROLE_OPTIONS: ViewerRole[] = ['visitor', 'client', 'admin', 'family'];

export function DemoBanner() {
  const { demo, viewer, setDemoRole } = useAuth();
  const { t } = useI18n();
  if (!demo) return null;
  return (
    <div className="demo-banner" role="region" aria-label={t('demo.title')}>
      <div className="container">
        <strong>演示模式 / Demo mode</strong>
        <span className="demo-text">{t('demo.banner')}</span>
        <label>
          {t('demo.viewAs')}
          <select
            value={viewer.role}
            onChange={(e) => setDemoRole(e.target.value as ViewerRole)}
            data-testid="demo-role"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
