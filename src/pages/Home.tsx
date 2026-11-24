import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AsciiGpu, type AsciiLabel } from '../components/fx/AsciiGpu';
import { BuildLog, PortalMock } from '../components/fx/BuildLog';
import { ChannelMonitor } from '../components/fx/ChannelMonitor';
import { Readout } from '../components/fx/Readout';
import { Scramble } from '../components/fx/Scramble';
import { TimeStrip } from '../components/fx/TimeStrip';
import { ArrowRightIcon } from '../components/Icons';
import { SHOWCASE_PROJECTS } from '../data/projects';
import { useI18n } from '../i18n/I18nProvider';
import type { StringKey } from '../i18n/strings';
import { useMedia } from '../lib/motion';
import { BEIJING, PACIFIC, hhmm, isReplyOpen, pad2, useNow, zoneTime } from '../lib/replyHours';
import { useDocumentTitle } from '../lib/useDocumentTitle';

const SERVICES: { key: 'web' | 'rag' | 'local' | 'auto' | 'bilingual'; tags: string[] }[] = [
  { key: 'local', tags: ['Ollama', 'Whisper', 'qwen3:14b'] },
  { key: 'rag', tags: ['FastAPI', 'bge-m3', 'SQLite'] },
  { key: 'web', tags: ['React', 'Next.js', 'Supabase', 'PostgreSQL'] },
  { key: 'auto', tags: ['Python', 'openpyxl', 'python-docx'] },
  { key: 'bilingual', tags: ['中文', 'English'] },
];

function SectionHead({ idx, label, title, id, aside }: { idx: string; label: string; title: string; id: string; aside?: ReactNode }) {
  return (
    <header className="section-head">
      <span className="kicker">
        <b>{idx}</b>
        <span aria-hidden="true">//</span>
        {label}
      </span>
      <h2 id={id}>
        <Scramble text={title} />
      </h2>
      {aside && <p className="section-aside">{aside}</p>}
    </header>
  );
}

/** Live status line above the headline: reply hours and the two clocks. */
function HeroHud() {
  const { t } = useI18n();
  const now = useNow(1000);
  const open = isReplyOpen(now);
  const pt = zoneTime(now, PACIFIC);
  return (
    <div className="hero-hud">
      <span>
        <i className={`led ${open ? 'is-live' : 'is-off'}`} aria-hidden="true" />
        {open ? t('hud.open') : t('hud.closed')}
      </span>
      <span>
        {t('home.clock.pacific')} {hhmm(pt)}
        <span className="hud-sec" aria-hidden="true">
          :{pad2(pt.s)}
        </span>
      </span>
      <span>
        {t('home.clock.beijing')} {hhmm(zoneTime(now, BEIJING))}
      </span>
    </div>
  );
}

export default function Home() {
  const { t, lang } = useI18n();
  useDocumentTitle(null, t('brand.full'));
  // On a phone the card is only ~45 characters wide, with no room for its callouts:
  // it reads as a pile of random symbols, so phones skip it (and save the battery).
  const showGpu = useMedia('(min-width: 721px)');
  const mouse = useMedia('(hover: hover) and (pointer: fine)');

  const labels: AsciiLabel[] = [
    { text: t('hero.label.gpu'), at: [-0.35, 0.58, 0.03] },
    { text: t('hero.label.models'), at: [0.98, 0.22, 0.16] },
    { text: t('hero.label.cloud'), at: [-0.45, -0.69, -0.13] },
  ];

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        {showGpu && (
          <div className="hero-figure">
            <AsciiGpu
              labels={labels}
              caption={mouse ? t('hero.caption') + (lang === 'zh' ? '' : ' ') + t('hero.captionHint') : t('hero.caption')}
            />
          </div>
        )}
        <div className="container wide hero-inner">
          <HeroHud />
          <h1 id="hero-title" className="hero-title">
            <span className="hero-line">
              <Scramble text={t('hero.title1')} duration={1000} />
            </span>
            <span className="hero-line is-dim">
              <Scramble text={t('hero.title2')} duration={1100} delay={200} />
            </span>
          </h1>
          <p className="hero-lede">{t('hero.lede')}</p>
          <div className="hero-actions">
            <Link to="/showcase" className="btn btn-primary btn-lg">
              {t('home.ctaShowcase')}
              <ArrowRightIcon />
            </Link>
            <Link to="/contact" className="btn btn-secondary btn-lg">
              {t('home.ctaContact')}
            </Link>
          </div>
          <dl className="hero-specs">
            <div>
              <dt>{t('home.fact.location')}</dt>
              <dd>{t('home.fact.locationValue')}</dd>
            </div>
            <div>
              <dt>{t('home.fact.languages')}</dt>
              <dd>{t('home.fact.languagesValue')}</dd>
            </div>
            <div>
              <dt>{t('home.fact.hardware')}</dt>
              <dd>{t('home.fact.hardwareValue')}</dd>
            </div>
          </dl>
        </div>
        <a href="#readouts" className="scroll-cue" onClick={(e) => {
          e.preventDefault();
          document.getElementById('readouts')?.scrollIntoView({ behavior: 'smooth' });
        }}>
          <span aria-hidden="true">↓</span> {t('fx.scroll')}
        </a>
      </section>

      <section id="readouts" className="readouts" aria-labelledby="readouts-title">
        <h2 id="readouts-title" className="visually-hidden">
          {t('fx.statsTitle')}
        </h2>
        <div className="container wide readout-grid">
          <Readout parts={['24', '/', '24']} label={t('readout.top3')} />
          <Readout parts={['0']} label={t('readout.cloud')} />
          <Readout parts={['~', '30']} label={t('readout.users')} />
          <Readout parts={[t('readout.cert.value')]} unit="s" label={t('readout.cert')} />
        </div>
      </section>

      <section className="section work" aria-labelledby="work-title">
        <div className="container wide">
          <SectionHead
            idx="01"
            label={t('home.workLabel')}
            id="work-title"
            title={t('home.workTitle', { n: SHOWCASE_PROJECTS.length })}
            aside={t('home.workAside')}
          />
          <ChannelMonitor />
          <p className="section-more">
            <Link to="/showcase" className="text-link">
              {t('home.allWork')}
              <ArrowRightIcon width={16} height={16} />
            </Link>
          </p>
        </div>
      </section>

      <section className="section services" aria-labelledby="services-title">
        <div className="container wide">
          <SectionHead idx="02" label={t('home.servicesLabel')} id="services-title" title={t('home.servicesTitle')} />
          <ol className="spec-table">
            {SERVICES.map((s, i) => (
              <li key={s.key} className="spec-row">
                <span className="spec-code" aria-hidden="true">
                  S-{pad2(i + 1)}
                </span>
                <h3 className="spec-name">{t(`home.service.${s.key}` as StringKey)}</h3>
                <p className="spec-desc">{t(`home.service.${s.key}.desc` as StringKey)}</p>
                <ul className="spec-tags tags" aria-label={t('showcase.stack')}>
                  {s.tags.map((tag) => (
                    <li key={tag} className="tag" lang={tag === '中文' ? 'zh-CN' : undefined}>
                      {tag}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section process" aria-labelledby="process-title">
        <div className="container wide">
          <SectionHead idx="03" label={t('home.processLabel')} id="process-title" title={t('home.processTitle')} />
          <div className="process-grid">
            <BuildLog />
            <div className="process-live">
              <h3>
                <span className="led is-live" aria-hidden="true" /> {t('home.liveTitle')}
              </h3>
              <p className="muted">{t('home.live')}</p>
              <PortalMock />
            </div>
          </div>
        </div>
      </section>

      <section className="section hours" aria-labelledby="hours-title">
        <div className="container wide">
          <SectionHead idx="04" label={t('home.hoursLabel')} id="hours-title" title={t('home.hoursTitle')} />
          <div className="hours-grid">
            <div className="hours-text">
              <p className="hours-main">{t('home.hours')}</p>
              <p className="muted">{t('home.hoursAlt')}</p>
              <p className="muted small">{t('home.hoursNote')}</p>
            </div>
            <TimeStrip />
          </div>
        </div>
      </section>

      <section className="section cta" aria-labelledby="cta-title">
        <div className="container wide">
          <div className="cta-term ticks">
            <div className="cta-term-head" aria-hidden="true">
              <span>~/jack-ai-studio</span>
              <span>{lang === 'zh' ? 'zsh — 中文' : 'zsh — en'}</span>
            </div>
            <h2 id="cta-title" className="cta-title">
              <span className="cta-prompt" aria-hidden="true">
                ›
              </span>
              {t('home.bottomTitle')}
              <span className="cta-caret" aria-hidden="true" />
            </h2>
            <p className="cta-sub">{t('home.bottomText')}</p>
            <div className="row">
              <Link to="/contact" className="btn btn-primary btn-lg">
                {t('home.ctaContact')}
                <ArrowRightIcon />
              </Link>
              <Link to="/showcase" className="btn btn-secondary btn-lg">
                {t('home.ctaShowcase')}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
