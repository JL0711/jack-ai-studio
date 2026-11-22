import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { useOnScreen, useReducedMotion } from '../../lib/motion';

type Token = { kind: 'text'; value: string } | { kind: 'cite'; value: string };

/** Splits "text [1] more text [2]." into words (or Chinese characters) and citation chips. */
function tokenize(answer: string, byChar: boolean): Token[] {
  const out: Token[] = [];
  for (const part of answer.split(/(\[\d+\])/)) {
    if (!part) continue;
    const cite = /^\[(\d+)\]$/.exec(part);
    if (cite) {
      out.push({ kind: 'cite', value: cite[1] });
      continue;
    }
    const pieces = byChar ? Array.from(part) : part.match(/\S+\s*|\s+/g) ?? [];
    for (const value of pieces) out.push({ kind: 'text', value });
  }
  return out;
}

const Q_START = 500;
const Q_PER_CHAR = 30;
const ANSWER_MS = 2600;
const HOLD_MS = 4200;
const FADE_MS = 450;

/**
 * The hero's animated "app window": a question is typed, the three stages light
 * up, the answer streams in with citation chips, then the source shows. Loops
 * while on screen; shows the finished state at once with reduced motion.
 */
export function HeroDemo() {
  const { t, lang } = useI18n();
  const reduced = useReducedMotion();
  const { ref, onScreen } = useOnScreen<HTMLDivElement>();
  const [elapsed, setElapsed] = useState(0);

  const question = t('fx.demo.q');
  const tokens = useMemo(() => tokenize(t('fx.demo.a'), lang === 'zh'), [t, lang]);

  const qChars = Array.from(question).length;
  const qEnd = Q_START + qChars * Q_PER_CHAR;
  const searchEnd = qEnd + 900;
  const perToken = Math.max(14, Math.min(70, ANSWER_MS / tokens.length));
  const answerEnd = searchEnd + tokens.length * perToken;
  const total = answerEnd + HOLD_MS;

  useEffect(() => setElapsed(0), [lang]);

  useEffect(() => {
    if (reduced || !onScreen) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(now - last, 200);
      last = now;
      setElapsed((e) => (e + dt > total ? 0 : e + dt));
    }, 40);
    return () => window.clearInterval(id);
  }, [reduced, onScreen, total]);

  const time = reduced ? total - FADE_MS - 1 : elapsed;
  const typed = Array.from(question)
    .slice(0, Math.max(0, Math.floor((time - Q_START) / Q_PER_CHAR)))
    .join('');
  const shownTokens = time < searchEnd ? 0 : Math.min(tokens.length, Math.floor((time - searchEnd) / perToken) + 1);
  const stage = time < qEnd + 150 ? 0 : time < searchEnd ? 1 : shownTokens < tokens.length ? 2 : 3;
  const streaming = stage === 2;
  const showSource = time > answerEnd + 250;
  const fading = !reduced && time > total - FADE_MS;

  const stages = [t('fx.demo.stage1'), t('fx.demo.stage2'), t('fx.demo.stage3')];

  const renderChat = (v: {
    typed: string;
    qCaret: boolean;
    thinking: boolean;
    count: number;
    caret: boolean;
    source: boolean;
  }) => (
    <>
      {v.typed && (
        <div className="demo-q">
          {v.typed}
          {v.qCaret && <span className="demo-caret" />}
        </div>
      )}
      {v.thinking && (
        <div className="demo-thinking">
          <i />
          <i />
          <i />
        </div>
      )}
      {v.count > 0 && (
        <div className="demo-a">
          <span className="demo-avatar">AI</span>
          <p>
            {tokens.slice(0, v.count).map((tok, i) =>
              tok.kind === 'cite' ? (
                <sup key={i} className="demo-cite">
                  {tok.value}
                </sup>
              ) : (
                <span key={i} className="demo-tok">
                  {tok.value}
                </span>
              ),
            )}
            {v.caret && <span className="demo-caret" />}
          </p>
        </div>
      )}
      {v.source && (
        <div className="demo-source">
          <span className="demo-source-label">{t('fx.demo.source')}</span>
          <span className="demo-file">IRS Publication 583 · p583.pdf</span>
        </div>
      )}
    </>
  );

  return (
    <figure className="hero-demo">
      <div ref={ref} className="demo-float">
        <div className="demo-window" data-fx="tilt spot" aria-hidden="true">
          <div className="demo-chrome">
            <span className="demo-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="demo-title">{t('fx.demo.title')}</span>
            <span className="demo-offline">{t('fx.demo.offline')}</span>
          </div>
          <div className={`demo-body${fading ? ' is-fading' : ''}`}>
            <div className="demo-meta">{t('fx.demo.meta')}</div>
            <ol className="demo-stages">
              {stages.map((label, i) => {
                const n = i + 1;
                const cls = stage > n || (n === 3 && stage === 3) ? 'done' : stage === n ? 'active' : '';
                return (
                  <li key={label} className={cls}>
                    <span className="demo-stage-dot" />
                    {label}
                  </li>
                );
              })}
            </ol>
            <div className="demo-chat">
              {/* Invisible finished copy keeps the window at its final height. */}
              <div className="demo-layer demo-ghost">
                {renderChat({ typed: question, qCaret: false, thinking: false, count: tokens.length, caret: false, source: true })}
              </div>
              <div className="demo-layer">
                {renderChat({
                  typed,
                  qCaret: time < qEnd,
                  thinking: stage === 1,
                  count: shownTokens,
                  caret: streaming,
                  source: showSource,
                })}
              </div>
            </div>
            <div className="demo-foot">
              <span>qwen3:14b · Ollama</span>
              <span>{t('fx.demo.cloud')}</span>
            </div>
          </div>
        </div>
      </div>
      <p className="visually-hidden">
        {question} {t('fx.demo.a')}
      </p>
      <figcaption>{t('fx.demo.caption')}</figcaption>
    </figure>
  );
}
