// Presentational pieces of the document Q&A demo (no state of their own
// beyond what a piece needs to draw itself).

import { Fragment, useEffect, useRef, type ReactNode, type RefObject, type SVGProps } from 'react';
import { markSpans, segments } from './answer';
import { isHeadingLine, lineSpans, type Span } from './chunk';
import type { AnalyzedQuery } from './query';
import { fmt, type DemoText } from './text';
import type { Citation, Hit, QaResult, SourceDoc, Timings } from './types';

// ---------- formatting ----------

/** A measured duration: "0.4 ms", "12 ms" (never rounded up into something it wasn't). */
export function fmtMs(ms: number): string {
  if (ms < 0.1) return '< 0.1 ms';
  if (ms < 10) return `${ms.toFixed(1)} ms`;
  return `${Math.round(ms)} ms`;
}

export function fmtNum(n: number, lang: 'zh' | 'en'): string {
  return n.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US');
}

/** "第 2 页" / "page 2", "第 3 部分" / "part 3", or "全文" for a single part. */
export function pageName(doc: SourceDoc, page: number, T: DemoText): string {
  if (doc.pageLabel === 'part') return doc.pages.length === 1 ? T.wholeText : fmt(T.partN, { n: page + 1 });
  return fmt(T.pageN, { n: page + 1 });
}

export function pageCount(doc: SourceDoc, T: DemoText): string {
  return doc.pageLabel === 'part' ? fmt(doc.pages.length === 1 ? T.wholeText : T.ofParts, { n: doc.pages.length }) : fmt(T.pages, { n: doc.pages.length });
}

export function kindLabel(doc: SourceDoc, T: DemoText): string {
  switch (doc.kind) {
    case 'sample':
      return T.kindSample;
    case 'pdf':
      return 'PDF';
    case 'docx':
      return 'Word';
    case 'md':
      return 'Markdown';
    default:
      return 'TXT';
  }
}

// ---------- icons ----------

type IconProps = SVGProps<SVGSVGElement>;
const icon = (p: IconProps) => ({
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
  ...p,
});

export const LockIcon = (p: IconProps) => (
  <svg {...icon(p)}>
    <rect x="5" y="11" width="14" height="9" rx="1.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);
export const UploadIcon = (p: IconProps) => (
  <svg {...icon(p)}>
    <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
    <path d="M4 14v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
  </svg>
);
export const PageIcon = (p: IconProps) => (
  <svg {...icon(p)}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </svg>
);
export const XIcon = (p: IconProps) => (
  <svg {...icon(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const ChevronIcon = ({ dir, ...p }: IconProps & { dir: 'left' | 'right' }) => (
  <svg {...icon(p)}>
    <path d={dir === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
  </svg>
);
export const CopyIcon = (p: IconProps) => (
  <svg {...icon(p)}>
    <rect x="9" y="9" width="11" height="11" rx="1.5" />
    <path d="M5 15V5a1 1 0 0 1 1-1h10" />
  </svg>
);
export const ReturnIcon = (p: IconProps) => (
  <svg {...icon(p)}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </svg>
);

// ---------- highlighted text ----------

/** Text with the question's matches marked and (optionally) quoted ranges highlighted. */
export function Highlighted({ text, offset, marks, quotes }: { text: string; offset: number; marks: Span[]; quotes?: Span[] }) {
  return (
    <>
      {segments(text, offset, marks, quotes).map((s) => {
        if (s.mark) {
          return (
            <mark key={s.start} className={s.quote ? 'demo-mark dq-hl' : 'demo-mark'}>
              {s.text}
            </mark>
          );
        }
        if (s.quote) {
          return (
            <span key={s.start} className="dq-hl">
              {s.text}
            </span>
          );
        }
        return <Fragment key={s.start}>{s.text}</Fragment>;
      })}
    </>
  );
}

// ---------- pipeline ----------

export function Pipeline({ T, timings, passages, run }: { T: DemoText; timings: Timings | null; passages: number; run: number }) {
  const stages: Array<[string, number | null]> = [
    [T.stageSearch, timings?.search ?? null],
    [T.stageRank, timings?.rank ?? null],
    [T.stageCite, timings?.cite ?? null],
  ];
  const total = timings ? timings.search + timings.rank + timings.cite : 0;
  return (
    <div className="dq-pipe-wrap">
      <ol className={`dq-pipe${timings ? ' is-run' : ''}`} aria-label={T.pipeline} key={run}>
        {stages.map(([label, ms], i) => (
          <li key={label}>
            <span className="dq-stage" style={{ animationDelay: `${i * 90}ms` }}>
              <span className="dq-pipe-n" aria-hidden="true">
                {i + 1}
              </span>
              {label}
              {ms !== null && <b>{fmtMs(ms)}</b>}
            </span>
            {i < stages.length - 1 && (
              <span className="dq-arrow" aria-hidden="true">
                →
              </span>
            )}
          </li>
        ))}
      </ol>
      {timings && <p className="dq-pipe-meta">{fmt(T.searchedIn, { ms: fmtMs(total), n: passages })}</p>}
    </div>
  );
}

// ---------- results list ----------

export function HitList({
  T,
  hits,
  query,
  onOpen,
  dim,
}: {
  T: DemoText;
  hits: Hit[];
  query: AnalyzedQuery;
  onOpen: (hit: Hit, el: HTMLElement) => void;
  dim?: boolean;
}) {
  return (
    <ol className={`dq-hits${dim ? ' is-dim' : ''}`}>
      {hits.map((h, i) => {
        const text = h.doc.pages[h.page].slice(h.best.start, h.best.end);
        const pct = Math.max(4, Math.round(h.rel * 100));
        return (
          <li key={`${h.doc.id}-${h.page}-${h.passage.start}`}>
            <button type="button" className="dq-hit" onClick={(e) => onOpen(h, e.currentTarget)}>
              <span className="dq-hit-top">
                <span className="dq-rank" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="dq-hit-src">
                  <b>{h.doc.title}</b> · {pageName(h.doc, h.page, T)}
                </span>
                <span className="dq-hit-score" title={`BM25 ${h.bm25.toFixed(2)}`}>
                  {T.score} {h.score.toFixed(1)}
                </span>
              </span>
              <span className="dq-bar" role="img" aria-label={fmt(T.relAria, { p: Math.round(h.rel * 100) })}>
                <i style={{ width: `${pct}%` }} />
              </span>
              <span className="dq-hit-text">
                <Highlighted text={text} offset={h.best.start} marks={markSpans(text, h.best.start, query)} />
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ---------- the answer ----------

export function AnswerView({
  T,
  result,
  onCite,
  copyLabel,
  onCopy,
}: {
  T: DemoText;
  result: QaResult;
  onCite: (c: Citation, el: HTMLElement) => void;
  copyLabel: string;
  onCopy: () => void;
}) {
  const { answer, query } = result;
  const byN = new Map(answer.citations.map((c) => [c.n, c]));
  return (
    <section className="dq-answer" aria-label={T.answer}>
      <header className="dq-answer-head">
        <span className="demo-label">{T.answer}</span>
        <span className="spacer" />
        <button type="button" className="btn btn-ghost btn-small dq-copy" onClick={onCopy}>
          <CopyIcon />
          {copyLabel}
        </button>
      </header>
      <div className="dq-quotes">
        {answer.quotes.map((q, i) => {
          const text = q.doc.pages[q.page].slice(q.span.start, q.span.end);
          const c = byN.get(q.cite);
          return (
            <blockquote key={i} className="dq-quote">
              <p>
                <span className="dq-qmark" aria-hidden="true">
                  “
                </span>
                <Highlighted text={text} offset={q.span.start} marks={markSpans(text, q.span.start, query)} />
                <span className="dq-qmark" aria-hidden="true">
                  ”
                </span>
                {c && (
                  <button
                    type="button"
                    className="dq-cite"
                    id={`dq-cite-${c.n}-${i}`}
                    aria-label={fmt(T.citeAria, { n: c.n, doc: c.doc.title, page: pageName(c.doc, c.page, T) })}
                    onClick={(e) => onCite(c, e.currentTarget)}
                  >
                    {c.n}
                  </button>
                )}
              </p>
            </blockquote>
          );
        })}
      </div>
      <p className="dq-answer-note small">{T.answerNote}</p>
      <h3 className="demo-label dq-sub">{T.sources}</h3>
      <ol className="dq-sources">
        {answer.citations.map((c) => {
          // Start the snippet at the paragraph that holds the quote, so the clamp never hides it.
          const page = c.doc.pages[c.page];
          const first = c.quoted[0]?.start ?? c.passage.start;
          const lineStart = page.lastIndexOf('\n', first - 1) + 1;
          const from = Math.min(first, Math.max(c.passage.start, lineStart));
          const to = Math.max(c.passage.end, c.quoted[c.quoted.length - 1]?.end ?? 0);
          const text = page.slice(from, to);
          const cut = from > 0;
          return (
            <li key={c.n}>
              <button type="button" className="dq-src" onClick={(e) => onCite(c, e.currentTarget)}>
                <span className="dq-src-head">
                  <span className="dq-cite is-static" aria-hidden="true">
                    {c.n}
                  </span>
                  <span className="dq-src-name">
                    <b>{c.doc.title}</b>
                    <span>{pageName(c.doc, c.page, T)}</span>
                  </span>
                  <span className="dq-src-go">
                    {T.viewSource}
                    <ChevronIcon dir="right" width={14} height={14} />
                  </span>
                </span>
                <span className="dq-src-text">
                  {cut && <span aria-hidden="true">… </span>}
                  <Highlighted text={text} offset={from} marks={markSpans(text, from, query)} quotes={c.quoted} />
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function NoAnswer({ T, status, onLoadOther }: { T: DemoText; status: 'none' | 'vague' | 'empty'; onLoadOther?: () => void }) {
  const [title, body] =
    status === 'vague' ? [T.vagueTitle, T.vagueBody] : status === 'empty' ? [T.emptyTitle, T.emptyBody] : [T.noneTitle, T.noneBody];
  return (
    <section className="dq-none" aria-label={title}>
      <p className="dq-none-title">
        <span className="led is-off" aria-hidden="true" />
        {title}
      </p>
      {onLoadOther ? (
        <>
          <p>{T.crossLang}</p>
          <p>
            <button type="button" className="btn btn-secondary btn-small dq-cross" onClick={onLoadOther}>
              {T.crossLangLoad}
            </button>
          </p>
        </>
      ) : (
        <>
          <p>{body}</p>
          {status === 'none' && <p className="muted small">{T.noneTip}</p>}
        </>
      )}
    </section>
  );
}

export function Intro({ T }: { T: DemoText }) {
  const steps: Array<[string, string]> = [
    [T.stageSearch, T.introSearch],
    [T.stageRank, T.introRank],
    [T.stageCite, T.introCite],
  ];
  return (
    <section className="dq-intro" aria-label={T.introTitle}>
      <p className="dq-intro-title">{T.introTitle}</p>
      <ol>
        {steps.map(([name, body], i) => (
          <li key={name}>
            <span className="dq-pipe-n" aria-hidden="true">
              {i + 1}
            </span>
            <b>{name}</b>
            <span>{body}</span>
          </li>
        ))}
      </ol>
      <p className="muted small">{T.introReal}</p>
    </section>
  );
}

// ---------- source viewer ----------

export function Viewer({
  T,
  doc,
  page,
  quoted,
  query,
  onPage,
  onBack,
  headingRef,
  motion,
  note,
}: {
  T: DemoText;
  doc: SourceDoc;
  page: number;
  quoted: Span[];
  note: string | null;
  query: AnalyzedQuery | null;
  onPage: (page: number) => void;
  onBack: (() => void) | null;
  headingRef: RefObject<HTMLHeadingElement>;
  motion: boolean;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const text = doc.pages[page] ?? '';
  const marks = query ? markSpans(text, 0, query) : [];
  const first = quoted[0]?.start ?? -1;

  // Bring the quoted passage into view inside the page (not by scrolling the whole page).
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const target = body.querySelector<HTMLElement>('.dq-hl');
    const top = target ? Math.max(0, target.offsetTop - body.clientHeight * 0.25) : 0;
    body.scrollTo({ top, behavior: motion && target ? 'smooth' : 'auto' });
  }, [doc, page, first, motion]);

  const lines = lineSpans(text);
  const total = doc.pages.length;
  return (
    <div className="dq-viewer">
      <div className="dq-viewer-head">
        <h3 ref={headingRef} tabIndex={-1} className="dq-viewer-title">
          <PageIcon />
          <span>
            <b>{doc.title}</b>
            <span className="dq-viewer-page">
              {pageName(doc, page, T)}
              {total > 1 && <span className="muted"> · {fmt(doc.pageLabel === 'part' ? T.ofParts : T.ofPages, { n: total })}</span>}
            </span>
          </span>
        </h3>
        <span className="spacer" />
        {total > 1 && (
          <span className="dq-pager">
            <button type="button" className="btn btn-secondary btn-small dq-icon-btn" aria-label={T.prevPage} disabled={page <= 0} onClick={() => onPage(page - 1)}>
              <ChevronIcon dir="left" />
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-small dq-icon-btn"
              aria-label={T.nextPage}
              disabled={page >= total - 1}
              onClick={() => onPage(page + 1)}
            >
              <ChevronIcon dir="right" />
            </button>
          </span>
        )}
      </div>
      {note && quoted.length > 0 && <p className="dq-viewer-note small">{note}</p>}
      <div ref={bodyRef} className={`dq-page${quoted.length ? ' has-quote' : ''}`} key={`${doc.id}:${page}:${first}`} lang={doc.lang === 'zh' ? 'zh-CN' : doc.lang === 'en' ? 'en' : undefined}>
        {lines.map((l) => {
          const line = text.slice(l.start, l.end);
          if (!line.trim()) return <div key={l.start} className="dq-line-gap" />;
          const heading = isHeadingLine(line);
          return (
            <p key={l.start} className={heading ? 'dq-line is-heading' : 'dq-line'}>
              <Highlighted text={line} offset={l.start} marks={marks} quotes={quoted} />
            </p>
          );
        })}
      </div>
      {onBack && (
        <button type="button" className="btn btn-ghost btn-small dq-back" onClick={onBack}>
          <ReturnIcon />
          {T.backToAnswer}
        </button>
      )}
    </div>
  );
}

/** A small framed note (used for scope changes and limits). */
export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' }) {
  return <p className={`notice ${tone === 'error' ? 'notice-error' : 'notice-info'} dq-note`}>{children}</p>;
}
