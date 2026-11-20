import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/I18nProvider';
import { DEMO_IDENTITIES, type DemoIdentity } from '../store/demoData';

export function DemoBanner() {
  const { demo, demoIdentity, setDemoIdentity } = useAuth();
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
            value={demoIdentity}
            onChange={(e) => setDemoIdentity(e.target.value as DemoIdentity)}
            data-testid="demo-role"
          >
            {DEMO_IDENTITIES.map((r) => (
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
