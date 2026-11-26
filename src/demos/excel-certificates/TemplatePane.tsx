import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Lang } from '../../i18n/strings';
import { CERT_H, CERT_W, THEMES, THEME_KEYS, UNIT_PT, drawCertificate, type DrawResult } from './draw';
import { ChevronIcon } from './icons';
import { cleanPrefix, formatCertNumber, type CheckedRow } from './roster';
import { certContent, isoDate, type Settings } from './state';
import type { DemoText } from './text';

interface Props {
  t: DemoText;
  lang: Lang;
  settings: Settings;
  settingsChanged: boolean;
  onSettings: (patch: Partial<Settings>) => void;
  onResetSettings: () => void;
  okRows: CheckedRow[];
  index: number;
  onIndex: (i: number) => void;
}

/** The certificate drawn at the pane's width × devicePixelRatio, so it stays sharp on any screen. */
function Preview({
  row,
  settings,
  lang,
  label,
  onDrawn,
}: {
  row: CheckedRow;
  settings: Settings;
  lang: Lang;
  label: string;
  onDrawn: (r: DrawResult) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    setWidth(Math.round(el.clientWidth));
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.round(width * dpr);
    const h = Math.round((w * CERT_H) / CERT_W);
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    onDrawn(drawCertificate(ctx, w / CERT_W, certContent(row, settings, lang), settings.theme));
  }, [row, settings, lang, width, onDrawn]);

  return (
    <div ref={wrap} className="xc-paper">
      <canvas ref={canvas} className="xc-canvas" role="img" aria-label={label} />
    </div>
  );
}

export function TemplatePane({
  t,
  lang,
  settings,
  settingsChanged,
  onSettings,
  onResetSettings,
  okRows,
  index,
  onIndex,
}: Props) {
  const uid = useId();
  const [drawn, setDrawn] = useState<DrawResult | null>(null);
  const year = Number(settings.issueDate.slice(0, 4)) || new Date().getFullYear();
  const example = formatCertNumber(cleanPrefix(settings.prefix), year, 1);
  const realRow = okRows[index];
  // With nothing to generate yet, the template still previews with placeholder text.
  const placeholder = useMemo<CheckedRow>(
    () => ({
      r: 0,
      ...t.placeholder,
      dateRaw: '',
      date: settings.issueDate || isoDate(new Date()),
      dateFromIssue: true,
      number: example,
      numberIsNew: true,
      status: 'ok',
      issues: [],
    }),
    [t, settings.issueDate, example],
  );
  const row = realRow ?? placeholder;
  const shrunk = !!drawn && drawn.nameSize < drawn.nameBaseSize;
  const step = (d: number) => okRows.length && onIndex((index + d + okRows.length) % okRows.length);

  const text = (key: 'title' | 'org' | 'signer' | 'role' | 'prefix', label: string, max: number, hint?: string) => (
    <div className="field">
      <label htmlFor={`${uid}-${key}`}>{label}</label>
      <input
        id={`${uid}-${key}`}
        className="input"
        value={settings[key]}
        maxLength={max}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => onSettings({ [key]: e.target.value } as Partial<Settings>)}
        aria-describedby={hint ? `${uid}-${key}-hint` : undefined}
      />
      {hint && (
        <span className="hint" id={`${uid}-${key}-hint`}>
          {hint}
        </span>
      )}
    </div>
  );

  return (
    <section className="demo-pane xc-pane xc-tpl" aria-labelledby={`${uid}-h`}>
      <div className="xc-head-row">
        <h3 className="demo-pane-head xc-head" id={`${uid}-h`}>
          <span className="xc-step" aria-hidden="true">
            02
          </span>
          {t.step2}
        </h3>
        <button type="button" className="btn btn-ghost btn-small" onClick={onResetSettings} disabled={!settingsChanged}>
          {t.resetTemplate}
        </button>
      </div>

      <div className="xc-tpl-body">
        <div className="xc-tpl-view">
          <Preview
            row={row}
            settings={settings}
            lang={lang}
            label={t.canvasLabel(row.name, row.course, row.number)}
            onDrawn={setDrawn}
          />
          {realRow ? (
            <div className="xc-nav">
              <button
                type="button"
                className="btn btn-secondary btn-small xc-iconbtn"
                onClick={() => step(-1)}
                aria-label={t.prev}
              >
                <ChevronIcon dir="left" />
              </button>
              <select
                className="select xc-pick"
                aria-label={t.pickRow}
                value={index}
                onChange={(e) => onIndex(Number(e.target.value))}
              >
                {okRows.map((r, i) => (
                  <option key={r.r} value={i}>
                    {r.number} · {r.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-secondary btn-small xc-iconbtn"
                onClick={() => step(1)}
                aria-label={t.next}
              >
                <ChevronIcon dir="right" />
              </button>
              <span className="xc-counter" aria-hidden="true">
                {t.counter(index + 1, okRows.length)}
              </span>
            </div>
          ) : (
            <p className="small muted xc-placeholder">{t.previewNone}</p>
          )}
          <p className={`xc-shrink small${shrunk ? ' is-on' : ''}`} aria-live="polite">
            {shrunk && drawn
              ? t.shrunk(Math.round(drawn.nameBaseSize * UNIT_PT), Math.round(drawn.nameSize * UNIT_PT))
              : ''}
          </p>
        </div>

        <div className="xc-form-box">
          <div className="xc-form">
            {text('title', t.tplTitle, 40)}
            {text('org', t.tplOrg, 60)}
            {text('signer', t.tplSigner, 30)}
            {text('role', t.tplRole, 30)}
            {text('prefix', t.tplPrefix, 12, t.tplPrefixHint(example))}
            <div className="field">
              <label htmlFor={`${uid}-date`}>{t.tplIssue}</label>
              <input
                id={`${uid}-date`}
                className="input"
                type="date"
                value={settings.issueDate}
                min="1990-01-01"
                max="2099-12-31"
                onChange={(e) => onSettings({ issueDate: e.target.value })}
                aria-describedby={`${uid}-date-hint`}
              />
              <span className="hint" id={`${uid}-date-hint`}>
                {t.tplIssueHint}
              </span>
            </div>
            <div className="field xc-themes">
              <span className="field-label" id={`${uid}-theme`}>
                {t.tplTheme}
              </span>
              <div className="demo-seg" role="group" aria-labelledby={`${uid}-theme`}>
                {THEME_KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={settings.theme === k}
                    onClick={() => onSettings({ theme: k })}
                  >
                    <span
                      className="xc-swatch"
                      aria-hidden="true"
                      style={{
                        background: `linear-gradient(135deg, ${THEMES[k].primary} 0 55%, ${THEMES[k].gold} 55% 100%)`,
                      }}
                    />
                    {t.themes[k]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
