import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CountUp } from '../components/fx/CountUp';
import { HeroDemo } from '../components/fx/HeroDemo';
import { Marquee } from '../components/fx/Marquee';
import { NeuralField } from '../components/fx/NeuralField';
import { ReplyClock } from '../components/fx/ReplyClock';
import { Typewriter } from '../components/fx/Typewriter';
import { ArrowRightIcon, ChatIcon, ChipIcon, DocIcon, FlowIcon, PulseIcon, WebIcon } from '../components/Icons';
import { SHOWCASE_PROJECTS } from '../data/projects';
import { useI18n } from '../i18n/I18nProvider';
import type { StringKey } from '../i18n/strings';
import { groupClass, revealClass, useInView } from '../lib/motion';

const SERVICES: { key: 'web' | 'rag' | 'local' | 'auto' | 'bilingual'; icon: ReactNode }[] = [
  { key: 'local', icon: <ChipIcon /> },
  { key: 'rag', icon: <DocIcon /> },
  { key: 'web', icon: <WebIcon /> },
  { key: 'auto', icon: <FlowIcon /> },
  { key: 'bilingual', icon: <ChatIcon /> },
];

const STEPS = [1, 2, 3, 4, 5] as const;

/** Every stack name used in the showcase, plus what this site itself is built with. */
const TECH = Array.from(
  new Set([...SHOWCASE_PROJECTS.flatMap((p) => p.stack), 'React', 'TypeScript', 'Vite', 'Supabase']),
).filter((name) => !name.includes('('));

function SectionHead({ n, id, title }: { n: string; id: string; title: string }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={revealClass(inView, 'section-head')}>
      <span className="kicker" aria-hidden="true">
        {n}
      </span>
      <h2 id={id}>{title}</h2>
    </div>
  );
}

export default function Home() {
  const { t } = useI18n();
  const stats = useInView<HTMLUListElement>();
  const services = useInView<HTMLUListElement>();
  const steps = useInView<HTMLOListElement>();
  const live = useInView<HTMLDivElement>();
  const hours = useInView<HTMLDivElement>();
  const cta = useInView<HTMLDivElement>();

  const words = [t('fx.type.1'), t('fx.type.2'), t('fx.type.3'), t('fx.type.4')];

  return (
    <>
      <section className="hero">
        <div className="hero-bg" aria-hidden="true">
          <div className="aurora">
            <span />
            <span />
            <span />
          </div>
          <div className="hero-grid-bg" />
          <NeuralField />
        </div>

        <div className="container wide hero-layout">
          <div className="hero-copy">
            <span className="hero-pill">
              <span className="ping" aria-hidden="true" />
              {t('home.eyebrow')}
            </span>
            <h1>
              <span className="hero-title">Jack AI Studio</span>
              <span className="hero-sub">{t('home.heroSub')}</span>
            </h1>
            <p className="hero-type">
              {t('fx.typePrefix')} <Typewriter words={words} label={t('fx.typeAll')} />
            </p>
            <p className="pitch">{t('home.pitch')}</p>
            <div className="hero-actions">
              <Link to="/showcase" className="btn btn-primary btn-lg" data-fx="magnet">
                {t('home.ctaShowcase')}
                <ArrowRightIcon />
              </Link>
              <Link to="/contact" className="btn btn-secondary btn-lg" data-fx="magnet">
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
          <HeroDemo />
        </div>

        <span className="scroll-cue" aria-hidden="true" title={t('fx.scroll')}>
          <span />
        </span>
      </section>

      <section className="stats-band" aria-labelledby="stats-title">
        <div className="container wide">
          <h2 id="stats-title" className="visually-hidden">
            {t('fx.statsTitle')}
          </h2>
          <ul ref={stats.ref} className={groupClass(stats.inView, 'stat-grid')}>
            <li className="stat-card" data-fx="spot">
              <span className="stat-num">
                <CountUp to={24} suffix=" / 24" />
              </span>
              <span className="stat-text">{t('fx.stat.top3')}</span>
            </li>
            <li className="stat-card" data-fx="spot">
              <span className="stat-num">
                <CountUp to={100} suffix="%" />
              </span>
              <span className="stat-text">{t('fx.stat.offline')}</span>
            </li>
            <li className="stat-card" data-fx="spot">
              <span className="stat-num">
                <CountUp to={30} prefix="~" />
              </span>
              <span className="stat-text">{t('fx.stat.users')}</span>
            </li>
            <li className="stat-card" data-fx="spot">
              <span className="stat-num">
                <CountUp to={SHOWCASE_PROJECTS.length} />
              </span>
              <span className="stat-text">{t('fx.stat.projects')}</span>
            </li>
          </ul>
        </div>
        <Marquee items={TECH} label={t('fx.stackTitle')} />
      </section>

      <section className="section" aria-labelledby="services-title">
        <div className="container wide">
          <SectionHead n="01" id="services-title" title={t('home.servicesTitle')} />
          <ul ref={services.ref} className={groupClass(services.inView, 'service-list')}>
            {SERVICES.map((s) => (
              <li key={s.key} className="card service" data-fx="spot">
                <span className="service-bg-icon" aria-hidden="true">
                  {s.icon}
                </span>
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
        <div className="container wide">
          <SectionHead n="02" id="process-title" title={t('home.processTitle')} />
          <ol ref={steps.ref} className={groupClass(steps.inView, 'steps')}>
            {STEPS.map((n) => (
              <li key={n}>
                <span className="step-dot" aria-hidden="true">
                  {n}
                </span>
                <div className="step-card" data-fx="spot">
                  <h3>{t(`home.step${n}` as StringKey)}</h3>
                  <p>{t(`home.step${n}.desc` as StringKey)}</p>
                </div>
              </li>
            ))}
          </ol>
          <div ref={live.ref} className={revealClass(live.inView, 'card live-callout')} data-fx="spot">
            <span className="service-icon live-icon">
              <PulseIcon />
            </span>
            <div>
              <h3>
                {t('home.liveTitle')} <span className="live-ping" aria-hidden="true" />
              </h3>
              <p className="muted" style={{ margin: 0 }}>
                {t('home.live')}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="hours-title">
        <div className="container wide">
          <SectionHead n="03" id="hours-title" title={t('home.hoursTitle')} />
          <div ref={hours.ref} className={revealClass(hours.inView, 'card hours-card')} data-fx="spot">
            <div className="hours-text">
              <span className="hours-main">{t('home.hours')}</span>
              <span className="muted">{t('home.hoursAlt')}</span>
              <span className="muted small">{t('home.hoursNote')}</span>
            </div>
            <ReplyClock />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container wide">
          <div ref={cta.ref} className={revealClass(cta.inView, 'cta-band')}>
            <h2>{t('home.bottomTitle')}</h2>
            <p>{t('home.bottomText')}</p>
            <div className="row">
              <Link to="/showcase" className="btn btn-primary btn-lg" data-fx="magnet">
                {t('home.ctaShowcase')}
                <ArrowRightIcon />
              </Link>
              <Link to="/contact" className="btn btn-secondary btn-lg" data-fx="magnet">
                {t('home.ctaContact')}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
