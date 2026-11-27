import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FEATURES } from '../ai/catalog';
import { fmtCnyRange, fmtDuration, fmtHours, fmtUsdRange } from '../ai/format';
import type { Estimate, FeatureId, Lang, Requirements } from '../ai/types';
import { SHOWCASE_PROJECTS } from '../data/projects';
import { chatT, type ChatKey } from './strings';
import { copyText } from '../lib/clipboard';
import { ArrowRightIcon, CopyIcon } from '../components/Icons';

interface Props {
  est: Estimate;
  req: Requirements;
  lang: Lang;
  /** Only the newest card can be changed; older ones are a record. */
  live: boolean;
  onToggle?: (f: FeatureId, on: boolean) => void;
  onSend?: () => void;
  /** A "similar project" link was followed. */
  onLink?: () => void;
  copyText?: string;
  /** Recalculated in place a moment ago (flash). */
  fresh?: boolean;
}

export function EstimateCard({ est, req, lang, live, onToggle, onSend, onLink, copyText: copyValue, fresh }: Props) {
  const t = (k: ChatKey, p?: Record<string, string | number>) => chatT(lang, k, p);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const root = useRef<HTMLElement>(null);
  // The chip that was just tapped: a tapped chip moves between "+ add" and "✓" (or goes away),
  // so after the recalculation focus goes to its new button, or the first chip, or the card.
  const refocus = useRef<FeatureId | null>(null);
  const toggle = (f: FeatureId, on: boolean) => {
    refocus.current = f;
    onToggle?.(f, on);
  };
  useEffect(() => {
    const card = root.current;
    if (!card) return;
    if (fresh) {
      // Replay the flash: the card stays mounted across recalculations.
      card.style.animation = 'none';
      void card.offsetWidth;
      card.style.animation = '';
    }
    const f = refocus.current;
    if (!f) return;
    refocus.current = null;
    // Only if focus was lost with the old chip: never pull it back from somewhere the visitor moved on to.
    const active = document.activeElement;
    if (active && active !== document.body && !card.contains(active)) return;
    const target =
      card.querySelector<HTMLElement>(`[data-feature="${f}"]:not(:disabled)`) ??
      card.querySelector<HTMLElement>('.as-chips button:not(:disabled)') ??
      card;
    target.focus({ preventScroll: true });
  }, [est, fresh]);

  const featureLines = est.lines.filter((l) => l.feature);
  const inferred = new Set(req.inferred ?? []);
  const similar = est.similar
    .map((slug) => SHOWCASE_PROJECTS.find((p) => p.slug === slug))
    .filter((p): p is (typeof SHOWCASE_PROJECTS)[number] => !!p);

  const copy = async () => {
    if (!copyValue) return;
    const ok = await copyText(copyValue);
    setCopied(ok);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <article ref={root} tabIndex={-1} className={`as-card ticks${live ? '' : ' is-old'}${fresh ? ' is-fresh' : ''}`} lang={lang === 'zh' ? 'zh-CN' : 'en'}>
      <header className="as-card-head">
        <span className="as-card-kicker">
          <i className="led is-live" aria-hidden="true" />
          {live ? t('est.kicker') : t('est.old')}
        </span>
        <span className="spacer" />
        {est.rush && <span className="badge badge-wip">{t('est.rush')}</span>}
        <span className={`as-conf is-${est.confidence}`}>{t(`est.confidence.${est.confidence}` as ChatKey)}</span>
      </header>

      <div className="as-price" aria-live={live ? 'polite' : undefined}>
        <span className="visually-hidden">{t('est.price')}: </span>
        <b>{fmtUsdRange(est.usd)}</b>
        {lang === 'zh' && <span className="as-price-cny">约 {fmtCnyRange(est.cny)}</span>}
      </div>

      <dl className="as-stats">
        <div>
          <dt>{t('est.hours')}</dt>
          <dd>{fmtHours(est.hours, lang)}</dd>
        </div>
        <div>
          <dt>{t('est.duration')}</dt>
          <dd>{fmtDuration(est.days, lang)}</dd>
        </div>
        <div>
          <dt>{t('est.first')}</dt>
          <dd>{t('est.firstDay', { a: est.firstVersionDay[0], b: est.firstVersionDay[1] })}</dd>
        </div>
      </dl>

      {(featureLines.length > 0 || (live && est.suggested.length > 0)) && (
        <div className="as-features">
          <p className="as-label">{live ? t('est.features') : t('est.breakdown')}</p>
          <div className="as-chips" role="group" aria-label={t('est.features')}>
            {featureLines.map((l) =>
              l.included ? (
                <span key={l.id} className="as-chip is-included" title={t('est.included')}>
                  {l.label[lang]} · {t('est.included')}
                </span>
              ) : (
                <button
                  key={l.id}
                  type="button"
                  className="as-chip"
                  aria-pressed="true"
                  disabled={!live}
                  data-feature={l.feature}
                  onClick={() => l.feature && toggle(l.feature, false)}
                >
                  <span aria-hidden="true">✓</span> {l.label[lang]}
                  {l.feature && inferred.has(l.feature) && <em className="as-guess">{t('est.guess')}</em>}
                </button>
              ),
            )}
            {live &&
              est.suggested.map((f) => (
                <button key={f} type="button" className="as-chip is-add" aria-pressed="false" data-feature={f} onClick={() => toggle(f, true)}>
                  <span aria-hidden="true">+</span> {FEATURES[f].label[lang]}
                </button>
              ))}
          </div>
        </div>
      )}

      <details className="as-more">
        <summary>{t('est.breakdown')}</summary>
        <table className="as-table">
          <tbody>
            {est.lines.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.label[lang]}
                  {l.note && <span className="as-note">{l.note[lang]}</span>}
                </td>
                <td className="as-num">{l.included ? t('est.included') : fmtHours(l.hours, lang)}</td>
              </tr>
            ))}
            {est.factors.map((f) => (
              <tr key={f.id} className="as-factor">
                <td>× {f.label[lang]}</td>
                <td className="as-num">
                  ×{f.min}–{f.max}
                </td>
              </tr>
            ))}
            <tr className="as-total">
              <td>{t('est.hours')}</td>
              <td className="as-num">{fmtHours(est.hours, lang)}</td>
            </tr>
          </tbody>
        </table>
      </details>

      <details className="as-more">
        <summary>{t('est.steps')}</summary>
        <ol className="as-steps">
          {est.steps.map((s, i) => (
            <li key={i}>{s[lang]}</li>
          ))}
        </ol>
      </details>

      <details className="as-more">
        <summary>{t('est.milestones')}</summary>
        <ol className="as-ms">
          {est.milestones.map((m, i) => (
            <li key={i}>
              <span className="as-ms-share">{Math.round(m.share * 100)}%</span>
              <span className="as-ms-label">{m.label[lang]}</span>
              <span className="as-ms-usd">{fmtUsdRange(m.usd)}</span>
              <span className="as-ms-day">{m.days[1] <= 2 ? t('est.dayRange', { a: m.days[0], b: m.days[1] }) : t('est.dayRange', { a: m.days[0], b: m.days[1] })}</span>
            </li>
          ))}
        </ol>
        <p className="as-ms-note">{t('est.milestonesNote')}</p>
      </details>

      {live && (
        <details className="as-more">
          <summary>
            {t('est.stack')} · {t('est.inputs')}
            {est.risks.length > 0 && ` · ${t('est.risks')}`}
          </summary>
          <ul className="tags as-stack">
            {est.stack.map((s) => (
              <li key={s} className="tag">
                {s}
              </li>
            ))}
          </ul>
          <p className="as-label">{t('est.inputs')}</p>
          <ul className="as-list">
            {est.inputs.map((x) => (
              <li key={x.zh}>{x[lang]}</li>
            ))}
          </ul>
          {est.risks.length > 0 && (
            <>
              <p className="as-label">{t('est.risks')}</p>
              <ul className="as-list is-risk">
                {est.risks.map((x) => (
                  <li key={x.zh}>{x[lang]}</li>
                ))}
              </ul>
            </>
          )}
        </details>
      )}

      {live && similar.length > 0 && (
        <p className="as-similar">
          {similar.map((p) => (
            <Link key={p.slug} to={`/showcase/${p.slug}`} className="text-link" onClick={onLink}>
              {p.title[lang]}
              <ArrowRightIcon width={14} height={14} />
            </Link>
          ))}
        </p>
      )}

      <footer className="as-card-foot">
        <p className="as-disclaimer">{t('est.disclaimer')}</p>
        {live && (
          <div className="row">
            {onSend && (
              <button type="button" className="btn btn-primary btn-small" onClick={onSend}>
                {t('est.send')}
                <ArrowRightIcon width={16} height={16} />
              </button>
            )}
            {copyValue && (
              <button type="button" className="btn btn-secondary btn-small" onClick={copy}>
                <CopyIcon />
                {copied ? t('est.copied') : t('est.copy')}
              </button>
            )}
          </div>
        )}
      </footer>
    </article>
  );
}
