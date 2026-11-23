import { useMemo } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { useReducedMotion } from '../../lib/motion';
import { hhmm, useNow, zoneTime, PACIFIC } from '../../lib/replyHours';
import { phase, useLoop } from './useLoop';

/*
 * One small animated "screen" per showcase project. They are illustrations of
 * what each project does (not screenshots), built from HTML and CSS so they stay
 * sharp at any size and follow the theme. Each scene only animates while
 * `playing`; otherwise it shows a finished frame.
 */

export interface SceneProps {
  playing: boolean;
}

/** Seeded random numbers, so bars and grids look the same on every visit. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function Caret() {
  return <span className="sc-caret" aria-hidden="true" />;
}

function Bar({ w, tone }: { w: number; tone?: 'dim' | 'ink' | 'signal' | 'red' }) {
  return <i className={`sc-line${tone ? ` is-${tone}` : ''}`} style={{ width: `${w}%` }} />;
}

/* ───────────── 1. Local document Q&A ───────────── */

type Token = { kind: 'text'; value: string } | { kind: 'cite'; value: string };

/** "text [1] more [2]." → words (or Chinese characters) and citation chips. */
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

const DOC_RANK = [2, 0, 3, 0, 1, 0]; // which of the six files the search ranks 1st, 2nd, 3rd

export function DocQaScene({ playing }: SceneProps) {
  const { t, lang } = useI18n();
  const reduced = useReducedMotion();
  const question = t('fx.demo.q');
  const tokens = useMemo(() => tokenize(t('fx.demo.a'), lang === 'zh'), [t, lang]);
  const qChars = Array.from(question).length;
  const qEnd = 500 + qChars * 55;
  const searchEnd = qEnd + 1500;
  const perToken = Math.max(18, Math.min(80, 2600 / tokens.length));
  const answerEnd = searchEnd + tokens.length * perToken;
  const D = answerEnd + 4200;
  const live = playing && !reduced;
  const loop = useLoop(D, live, lang);
  const time = live ? loop : D - 600;

  const typed = Array.from(question)
    .slice(0, Math.max(0, Math.floor((time - 500) / 55)))
    .join('');
  const scan = phase(time, qEnd + 100, searchEnd - 300);
  const shown = time < searchEnd ? 0 : Math.min(tokens.length, Math.floor((time - searchEnd) / perToken) + 1);
  const stage = time < qEnd ? 0 : time < searchEnd ? 1 : shown < tokens.length ? 2 : 3;
  const stages = [t('fx.demo.stage1'), t('fx.demo.stage2'), t('fx.demo.stage3')];

  return (
    <div className="scene sc-docqa">
      <div className="sc-bar">
        <span>local-doc-qa</span>
        <span className="sc-chip is-live">{t('fx.demo.offline')}</span>
      </div>
      <div className="sc-docqa-body">
        <div className="sc-docs" aria-hidden="true">
          {DOC_RANK.map((rank, i) => {
            const lit = scan > (i + 1) / 7;
            const ranked = time >= searchEnd - 300 && rank > 0;
            return (
              <div key={i} className={`sc-doc${lit ? ' is-read' : ''}${ranked ? ` is-hit rank-${rank}` : ''}`}>
                <Bar w={70} tone="dim" />
                <Bar w={90} tone="dim" />
                <Bar w={55} tone="dim" />
                <Bar w={80} tone="dim" />
                {ranked && <span className="sc-rank">{rank}</span>}
                {rank === 1 && ranked && <span className="sc-file">p583.pdf</span>}
              </div>
            );
          })}
          {scan > 0 && scan < 1 && <span className="sc-scanbar" style={{ top: `${scan * 100}%` }} />}
        </div>
        <div className="sc-term">
          <p className="sc-meta">{t('fx.demo.meta')}</p>
          <p className="sc-q">
            <span className="sc-prompt">›</span>
            {typed}
            {time < qEnd + 200 && <Caret />}
          </p>
          <ol className="sc-stages">
            {stages.map((label, i) => {
              const n = i + 1;
              const cls = stage > n || (n === 3 && stage === 3) ? 'done' : stage === n ? 'active' : '';
              return (
                <li key={label} className={cls}>
                  {label}
                </li>
              );
            })}
          </ol>
          <p className="sc-a">
            {tokens.slice(0, shown).map((tok, i) =>
              tok.kind === 'cite' ? (
                <sup key={i} className="sc-cite">
                  {tok.value}
                </sup>
              ) : (
                <span key={i}>{tok.value}</span>
              ),
            )}
            {stage === 2 && <Caret />}
          </p>
          {time > answerEnd + 250 && (
            <p className="sc-src">
              <span className="sc-src-label">{t('fx.demo.source')}</span> IRS Publication 583 · p583.pdf
            </p>
          )}
        </div>
      </div>
      <div className="sc-foot">
        <span>qwen3:14b · Ollama</span>
        <span>{t('fx.demo.cloud')}</span>
      </div>
    </div>
  );
}

/* ───────────── 2. Robotics team operations (QR check-in) ───────────── */

const QR_SIZE = 13;
const QR_CELLS = (() => {
  const rand = seeded(11);
  const finder = (r: number, c: number) =>
    [
      [0, 0],
      [0, QR_SIZE - 5],
      [QR_SIZE - 5, 0],
    ].some(([fr, fc]) => r >= fr && r < fr + 5 && c >= fc && c < fc + 5);
  const cells: [number, number][] = [];
  for (let r = 0; r < QR_SIZE; r++) for (let c = 0; c < QR_SIZE; c++) if (!finder(r, c) && rand() > 0.5) cells.push([r, c]);
  return cells;
})();
const ROSTER = (() => {
  const rand = seeded(5);
  return Array.from({ length: 12 }, () => ({ name: 38 + rand() * 40, role: 20 + rand() * 18 }));
})();

export function RoboticsScene({ playing }: SceneProps) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const live = playing && !reduced;
  const SCAN = 1500;
  const D = SCAN * 8;
  const loop = useLoop(D, live);
  const time = live ? loop : D - 200;
  const now = useNow(30000);
  const clock = hhmm(zoneTime(now, PACIFIC));
  const scans = Math.floor(time / SCAN); // completed check-ins this loop
  const within = (time % SCAN) / SCAN;
  const rows = Array.from({ length: Math.min(5, scans + 1) }, (_, k) => ROSTER[(scans - k + ROSTER.length) % ROSTER.length]);
  const flash = within < 0.12 && scans > 0;

  return (
    <div className="scene sc-robo">
      <div className="sc-bar">
        <span>team-ops · check-in</span>
        <span className="sc-chip is-live">LIVE</span>
      </div>
      <div className="sc-robo-body">
        <div className={`sc-qr${flash ? ' is-flash' : ''}`} aria-hidden="true">
          <div className="sc-qr-grid" style={{ ['--n' as string]: QR_SIZE }}>
            {[
              [0, 0],
              [0, QR_SIZE - 5],
              [QR_SIZE - 5, 0],
            ].map(([r, c]) => (
              <span key={`${r}-${c}`} className="sc-qr-finder" style={{ gridRow: `${r + 1} / span 5`, gridColumn: `${c + 1} / span 5` }} />
            ))}
            {QR_CELLS.map(([r, c], i) => (
              <span key={i} className="sc-qr-cell" style={{ gridRow: r + 1, gridColumn: c + 1 }} />
            ))}
          </div>
          {live && <span className="sc-qr-laser" style={{ top: `${8 + Math.abs(Math.sin(within * Math.PI)) * 84}%` }} />}
          <span className="sc-qr-corners" />
        </div>
        <ul className="sc-log" aria-hidden="true">
          {rows.map((row, k) => (
            <li key={`${scans}-${k}`} className={k === 0 && live ? 'is-new' : ''}>
              <span className="sc-ok">✓</span>
              <Bar w={row.name} tone="ink" />
              <Bar w={row.role} tone="dim" />
              <span className="sc-time">{clock}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="sc-foot">
        <span>{t('scene.robo.roles')}</span>
        <span>{t('scene.robo.users')}</span>
      </div>
    </div>
  );
}

/* ───────────── 3. Mac ↔ Windows bridge ───────────── */

export function BridgeScene({ playing }: SceneProps) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const live = playing && !reduced;
  const D = 6400;
  const loop = useLoop(D, live);
  const time = live ? loop : D - 400;
  const run = phase(time, 1400, 4200);
  const lines = Math.floor(run * 6);
  const exited = time > 4400;
  const lanes = [
    { key: 'sync', label: t('bridge.sync'), dir: 'both' },
    { key: 'cmd', label: t('bridge.cmd'), dir: 'right' },
    { key: 'out', label: t('bridge.out'), dir: 'left' },
  ] as const;

  return (
    <div className={`scene sc-bridge${live ? ' is-playing' : ''}`}>
      <div className="sc-bar">
        <span>bridge.py</span>
        <span className="sc-chip">{t('bridge.lan')}</span>
      </div>
      <div className="sc-bridge-body">
        <div className="sc-dev">
          <div className="sc-dev-title">{t('bridge.mac')}</div>
          <div className="sc-dev-screen">
            <p className="sc-q">
              <span className="sc-prompt">›</span> run
              {time < 1400 && <Caret />}
            </p>
            <Bar w={64} tone="dim" />
            <Bar w={40} tone="dim" />
          </div>
        </div>
        <div className="sc-lanes" aria-hidden="true">
          {lanes.map((lane, i) => (
            <div key={lane.key} className={`sc-lane dir-${lane.dir}`} style={{ ['--i' as string]: i }}>
              <span className="sc-lane-label">{lane.label}</span>
              <span className="sc-lane-wire">
                <i className="sc-packet" />
                {lane.dir === 'both' && <i className="sc-packet is-back" />}
              </span>
            </div>
          ))}
        </div>
        <div className="sc-dev is-gpu">
          <div className="sc-dev-title">
            Windows <span>{t('bridge.gpu')}</span>
          </div>
          <div className="sc-dev-screen">
            {Array.from({ length: lines }, (_, i) => (
              <Bar key={i} w={[72, 54, 88, 46, 66, 38][i]} tone="ink" />
            ))}
            {exited && <p className="sc-exit">exit 0</p>}
          </div>
        </div>
      </div>
      <div className="sc-foot">
        <span>Python stdlib · token auth</span>
        <span>{t('bridge.out')}</span>
      </div>
    </div>
  );
}

/* ───────────── 4. AI call copilot (in progress) ───────────── */

export function CallScene({ playing }: SceneProps) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const live = playing && !reduced;
  const D = 9000;
  const loop = useLoop(D, live);
  const time = live ? loop : D - 900;
  const talking = time < 3800 || (time > 5600 && time < 7600);
  const bars = 40;
  const sug = phase(time, 4200, 5600);

  return (
    <div className="scene sc-call">
      <div className="sc-bar">
        <span>call-copilot</span>
        <span className="sc-chip is-wip">{t('status.in_progress')}</span>
      </div>
      <div className="sc-wave" aria-hidden="true">
        {Array.from({ length: bars }, (_, i) => {
          const base = 0.18 + 0.12 * Math.sin(i * 1.7);
          const amp = talking ? Math.abs(Math.sin(time / 140 + i * 0.55) * Math.cos(time / 310 + i * 0.21)) : 0.05;
          return <i key={i} style={{ height: `${Math.round((base + amp * 0.8) * 100)}%` }} />;
        })}
      </div>
      <div className="sc-transcript" aria-hidden="true">
        <p>
          <span className="sc-who">{t('scene.call.them')}</span>
          <Bar w={62} tone="ink" />
        </p>
        <p>
          <span className="sc-who is-you">{t('scene.call.you')}</span>
          <Bar w={38} tone="dim" />
        </p>
        <p className={time > 5600 ? '' : 'is-hidden'}>
          <span className="sc-who">{t('scene.call.them')}</span>
          <Bar w={48} tone="ink" />
        </p>
      </div>
      <div className={`sc-suggest${sug > 0 ? ' is-on' : ''}`}>
        <span className="sc-suggest-label">{t('scene.call.suggest')}</span>
        <Bar w={Math.round(20 + sug * 66)} tone="signal" />
        <Bar w={Math.round(sug * 48)} tone="signal" />
      </div>
      <div className="sc-foot">
        <span>Whisper · Apple Silicon · Ollama</span>
        <span>{t('scene.call.nosave')}</span>
      </div>
    </div>
  );
}

/* ───────────── 5. Word batch annotation export ───────────── */

const DOC_LINES = (() => {
  const rand = seeded(23);
  return Array.from({ length: 11 }, (_, i) => ({
    w: 60 + rand() * 36,
    mark: i === 2 || i === 5 || i === 8 ? 12 + rand() * 20 : 0,
    at: 10 + rand() * 40,
  }));
})();

export function DocxScene({ playing }: SceneProps) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const live = playing && !reduced;
  const D = 8000;
  const loop = useLoop(D, live);
  const time = live ? loop : D - 600;
  const marks = DOC_LINES.filter((l) => l.mark).length;
  const shownMarks = Math.floor(phase(time, 600, 3200) * marks + 0.0001);
  const split = phase(time, 3800, 5000);
  let markIndex = 0;

  return (
    <div className="scene sc-docx">
      <div className="sc-bar">
        <span>merged.docx</span>
        <span className="sc-chip">python-docx</span>
      </div>
      <div className="sc-docx-body">
        <div className="sc-page" aria-hidden="true">
          <i className="sc-line is-ink sc-title" style={{ width: '46%' }} />
          {DOC_LINES.map((l, i) => {
            const isMark = l.mark > 0;
            const visible = isMark && markIndex++ < shownMarks;
            return (
              <span key={i} className="sc-docline" style={{ width: `${l.w}%` }}>
                {visible && <mark className="sc-mark" style={{ left: `${l.at}%`, width: `${l.mark}%` }} />}
              </span>
            );
          })}
        </div>
        <div className="sc-split" style={{ ['--s' as string]: split }} aria-hidden="true">
          {['01', '02', '03'].map((n, i) => (
            <div key={n} className="sc-mini" style={{ ['--k' as string]: i }}>
              <i className="sc-line is-ink" style={{ width: '60%' }} />
              <i className="sc-line is-dim" style={{ width: '85%' }} />
              <i className="sc-line is-red" style={{ width: '40%' }} />
              <i className="sc-line is-dim" style={{ width: '70%' }} />
              <span className="sc-mini-name">{n}.docx</span>
            </div>
          ))}
        </div>
      </div>
      <div className="sc-foot">
        <span>{t('scene.docx.marks')}</span>
        <span>Gemini API</span>
      </div>
    </div>
  );
}

/* ───────────── 6. Bulk certificates from an Excel list ───────────── */

const SHEET_ROWS = 32;
const BAD_ROWS: Record<number, 'bad1' | 'bad2'> = { 9: 'bad1', 22: 'bad2' };
const SHEET = (() => {
  const rand = seeded(41);
  return Array.from({ length: SHEET_ROWS }, () => ({ a: 40 + rand() * 45, b: 35 + rand() * 50 }));
})();

export function ExcelScene({ playing }: SceneProps) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const live = playing && !reduced;
  const D = 9000;
  const loop = useLoop(D, live);
  const time = live ? loop : D - 500;
  const progress = phase(time, 600, 5600);
  const row = Math.min(SHEET_ROWS, Math.floor(progress * SHEET_ROWS));
  const made = Array.from({ length: row }, (_, i) => i).filter((i) => !BAD_ROWS[i]).length;
  const visibleStart = Math.max(0, Math.min(SHEET_ROWS - 9, row - 5));

  return (
    <div className="scene sc-xl">
      <div className="sc-bar">
        <span>certificates.xlsx</span>
        <span className="sc-chip">openpyxl · Pillow</span>
      </div>
      <div className="sc-xl-body">
        <div className="sc-sheet" aria-hidden="true">
          {SHEET.slice(visibleStart, visibleStart + 9).map((r, k) => {
            const i = visibleStart + k;
            const bad = BAD_ROWS[i];
            const done = i < row;
            return (
              <div key={i} className={`sc-row${i === row ? ' is-cursor' : ''}${done && bad ? ' is-bad' : ''}${done && !bad ? ' is-done' : ''}`}>
                <span className="sc-rownum">{String(i + 1).padStart(2, '0')}</span>
                <i className="sc-cell" style={{ width: `${r.a}%` }} />
                <i className="sc-cell" style={{ width: `${r.b}%` }} />
                <span className="sc-flag">{done && bad ? t(`scene.xl.${bad}`) : done ? '✓' : ''}</span>
              </div>
            );
          })}
        </div>
        <div className="sc-certs" aria-hidden="true">
          <div className="sc-stack">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className={`sc-cert${made > i ? ' is-on' : ''}`} style={{ ['--k' as string]: i }}>
                <i className="sc-line is-signal" style={{ width: '40%' }} />
                <i className="sc-line is-ink" style={{ width: '68%' }} />
                <i className="sc-line is-dim" style={{ width: '50%' }} />
              </div>
            ))}
          </div>
          <p className="sc-count">
            <b>{String(made).padStart(2, '0')}</b> / 30
          </p>
        </div>
      </div>
      <div className="sc-foot">
        <span>{t('scene.xl.summary')}</span>
        <span>{progress >= 1 ? t('scene.xl.time') : '…'}</span>
      </div>
    </div>
  );
}

/* ───────────── by slug ───────────── */

const BY_SLUG: Record<string, (p: SceneProps) => JSX.Element> = {
  'local-doc-qa': DocQaScene,
  'robotics-ops': RoboticsScene,
  'mac-windows-bridge': BridgeScene,
  'ai-call-copilot': CallScene,
  'word-annotation-export': DocxScene,
  'excel-certificates': ExcelScene,
};

export function hasScene(slug: string): boolean {
  return slug in BY_SLUG;
}

export function ProjectScene({ slug, playing }: { slug: string; playing: boolean }) {
  const Scene = BY_SLUG[slug];
  return Scene ? <Scene playing={playing} /> : null;
}
