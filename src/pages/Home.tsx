import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChatIcon, ChipIcon, DocIcon, FlowIcon, PulseIcon, WebIcon } from '../components/Icons';
import { useI18n } from '../i18n/I18nProvider';
import type { StringKey } from '../i18n/strings';

const SERVICES: { key: 'web' | 'rag' | 'local' | 'auto' | 'bilingual'; icon: ReactNode }[] = [
  { key: 'web', icon: <WebIcon /> },
  { key: 'rag', icon: <DocIcon /> },
  { key: 'local', icon: <ChipIcon /> },
  { key: 'auto', icon: <FlowIcon /> },
  { key: 'bilingual', icon: <ChatIcon /> },
];

const STEPS = [1, 2, 3, 4, 5] as const;

export default function Home() {
  const { t } = useI18n();

  return (
    <>
      <section className="hero">
        <div className="container">
          <span className="eyebrow">{t('home.eyebrow')}</span>
          <h1>
            Jack AI Studio
            <span className="hero-sub">Jack 本地 AI 工作室</span>
          </h1>
          <p className="pitch">{t('home.pitch')}</p>
          <div className="hero-actions">
            <Link to="/showcase" className="btn btn-primary">
              {t('home.ctaShowcase')}
            </Link>
            <Link to="/contact" className="btn btn-secondary">
              {t('home.ctaContact')}
            </Link>
          </div>
          <ul className="facts">
            <li>
              <span className="fact-label">{t('home.fact.location')}</span>
              <span className="fact-value">{t('home.fact.locationValue')}</span>
            </li>
            <li>
              <span className="fact-label">{t('home.fact.languages')}</span>
              <span className="fact-value">{t('home.fact.languagesValue')}</span>
            </li>
            <li>
              <span className="fact-label">{t('home.fact.hardware')}</span>
              <span className="fact-value">{t('home.fact.hardwareValue')}</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="section" aria-labelledby="services-title">
        <div className="container">
          <div className="section-head">
            <h2 id="services-title">{t('home.servicesTitle')}</h2>
          </div>
          <ul className="service-list">
            {SERVICES.map((s) => (
              <li key={s.key} className="card service">
                <span className="service-icon">{s.icon}</span>
                <div>
                  <h3>{t(`home.service.${s.key}` as StringKey)}</h3>
                  <p>{t(`home.service.${s.key}.desc` as StringKey)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section" aria-labelledby="process-title">
        <div className="container">
          <div className="section-head">
            <h2 id="process-title">{t('home.processTitle')}</h2>
          </div>
          <ol className="steps">
            {STEPS.map((n) => (
              <li key={n}>
                <h3>{t(`home.step${n}` as StringKey)}</h3>
                <p>{t(`home.step${n}.desc` as StringKey)}</p>
              </li>
            ))}
          </ol>
          <div className="card live-callout">
            <span className="service-icon">
              <PulseIcon />
            </span>
            <div>
              <h3>{t('home.liveTitle')}</h3>
              <p className="muted" style={{ margin: 0 }}>
                {t('home.live')}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="hours-title">
        <div className="container">
          <div className="section-head">
            <h2 id="hours-title">{t('home.hoursTitle')}</h2>
          </div>
          <div className="card hours-card">
            <span className="hours-main">{t('home.hours')}</span>
            <span className="muted">{t('home.hoursAlt')}</span>
            <span className="muted small" style={{ flexBasis: '100%' }}>
              {t('home.hoursNote')}
            </span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="cta-band">
            <h2>{t('home.bottomTitle')}</h2>
            <p>{t('home.bottomText')}</p>
            <div className="row">
              <Link to="/showcase" className="btn btn-primary">
                {t('home.ctaShowcase')}
              </Link>
              <Link to="/contact" className="btn btn-secondary">
                {t('home.ctaContact')}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
