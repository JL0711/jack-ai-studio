import { useEffect, useId, useRef, useState } from 'react';
import { CheckIcon } from '../../components/Icons';
import type { Lang } from '../../i18n/strings';
import { MIME, downloadBytes, downloadText, formatBytes } from '../../lib/files/download';
import { generateCertificates, type GenProgress, type GenResult } from './generate';
import { DownloadIcon } from './icons';
import type { CheckedRow } from './roster';
import { MAX_GENERATE, type Settings } from './state';
import type { DemoText } from './text';

interface Props {
  t: DemoText;
  lang: Lang;
  okRows: CheckedRow[];
  allRows: CheckedRow[];
  stopped: number;
  /** False until the name and course columns are known. */
  ready: boolean;
  settings: Settings;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; progress: GenProgress }
  | { kind: 'done'; result: GenResult }
  | { kind: 'cancelled' }
  | { kind: 'error' };

const utf8 = new TextEncoder();

function seconds(ms: number): string {
  return (ms / 1000).toFixed(ms < 10_000 ? 2 : 1);
}

export function GeneratePane({ t, lang, okRows, allRows, stopped, ready, settings }: Props) {
  const uid = useId();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [announce, setAnnounce] = useState('');
  const run = useRef(0);
  const stopRequested = useRef(false);
  const urls = useRef<string[]>([]);

  const releaseUrls = () => {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = [];
  };
  useEffect(() => () => releaseUrls(), []);
  // The list or the template changed: earlier files no longer match, and a run in progress stops.
  useEffect(() => {
    run.current++;
    releaseUrls();
    setPhase({ kind: 'idle' });
  }, [okRows, allRows, settings, lang]);

  const count = okRows.length;
  const tooMany = count > MAX_GENERATE;
  const running = phase.kind === 'running';

  const start = async () => {
    if (!count || tooMany || running) return;
    releaseUrls();
    stopRequested.current = false;
    const id = ++run.current;
    setAnnounce('');
    setPhase({ kind: 'running', progress: { done: 0, total: count, current: okRows[0].name } });
    try {
      const result = await generateCertificates(
        okRows,
        allRows,
        settings,
        lang,
        (progress) => {
          if (run.current === id) setPhase({ kind: 'running', progress });
        },
        () => stopRequested.current || run.current !== id,
      );
      if (run.current !== id) {
        result?.thumbs.forEach((th) => URL.revokeObjectURL(th.url));
        return;
      }
      if (!result) {
        setPhase({ kind: 'cancelled' });
        setAnnounce(t.stopped);
        return;
      }
      urls.current = result.thumbs.map((th) => th.url);
      setPhase({ kind: 'done', result });
      setAnnounce(`${t.done(result.count, seconds(result.ms))} (${t.measured})`);
    } catch (e) {
      console.error('[excel-certificates]', e);
      if (run.current === id) {
        setPhase({ kind: 'error' });
        setAnnounce(t.genError);
      }
    }
  };

  const result = phase.kind === 'done' ? phase.result : null;
  const progress = phase.kind === 'running' ? phase.progress : null;

  return (
    <section className="demo-pane xc-pane xc-gen" aria-labelledby={`${uid}-h`}>
      <h3 className="demo-pane-head xc-head" id={`${uid}-h`}>
        <span className="xc-step" aria-hidden="true">
          03
        </span>
        {t.step3}
      </h3>

      <div className="xc-gen-row">
        <button
          type="button"
          className={`btn ${result ? 'btn-secondary' : 'btn-primary'} xc-gen-btn`}
          onClick={start}
          disabled={!count || tooMany || running}
        >
          {result ? t.regenerate : t.generate(count)}
        </button>
        <p className="xc-gen-info small">
          <span>{ready ? t.outputs : t.pickColumnsFirst}</span>
          {stopped > 0 && <span className="xc-gen-stops">{t.stopsNote(stopped)}</span>}
        </p>
      </div>
      {tooMany && <p className="notice notice-info">{t.tooMany(MAX_GENERATE)}</p>}

      {progress && (
        <div className="xc-progress">
          <div className="progress">
            <div
              className="progress-track"
              role="progressbar"
              aria-label={t.step3}
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
            >
              <div className="progress-fill" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
            <span className="progress-value">{t.counter(progress.done, progress.total)}</span>
          </div>
          <div className="xc-progress-row">
            <span className="small muted xc-progress-name">
              {progress.current
                ? t.progress(Math.min(progress.done + 1, progress.total), progress.total, progress.current)
                : ''}
            </span>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => (stopRequested.current = true)}>
              {t.stop}
            </button>
          </div>
        </div>
      )}
      {phase.kind === 'cancelled' && <p className="small muted">{t.stopped}</p>}
      {phase.kind === 'error' && <p className="notice notice-error">{t.genError}</p>}

      {result && (
        <div className="xc-result">
          <p className="xc-done">
            <CheckIcon width={18} height={18} aria-hidden="true" />
            <span>{t.done(result.count, seconds(result.ms))}</span>
            <span className="xc-measured">{t.measured}</span>
          </p>
          <div className="xc-dl">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => downloadBytes(result.zip, t.files.zip(result.count), MIME.zip)}
            >
              <DownloadIcon />
              {t.dlZip}
              <span className="xc-dl-meta">
                {t.pngCount(result.count)} · {formatBytes(result.zip.length)}
              </span>
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => downloadBytes(result.pdf, t.files.pdf, MIME.pdf)}
            >
              <DownloadIcon />
              {t.dlPdf}
              <span className="xc-dl-meta">
                {t.pdfPages(result.count)} · {formatBytes(result.pdf.length)}
              </span>
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => downloadText(result.log, t.files.log, MIME.csv)}
            >
              <DownloadIcon />
              {t.dlLog}
              <span className="xc-dl-meta">
                {t.logRows(result.logRows)} · {formatBytes(utf8.encode(result.log).length + 3)}
              </span>
            </button>
          </div>
          <ul className="xc-thumbs" aria-label={t.thumbs}>
            {result.thumbs.map((th, i) => (
              <li key={th.url} style={{ animationDelay: `${Math.min(i, 11) * 45}ms` }}>
                <img src={th.url} alt={th.label} width={360} height={254} decoding="async" />
                <span>{th.label}</span>
              </li>
            ))}
          </ul>
          {result.count > result.thumbs.length && (
            <p className="small muted">{t.moreThumbs(result.count - result.thumbs.length)}</p>
          )}
        </div>
      )}
      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>
    </section>
  );
}
