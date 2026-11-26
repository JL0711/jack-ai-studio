// "Try it" demo for the local document Q&A project: ask questions about a
// sample library (or your own files) and get answers quoted from the source,
// with file name and page. Runs entirely in the browser: keyword search
// (BM25) and quoting stand in for the real system's vector search and local LLM.

import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { copyText } from '../../lib/clipboard';
import { formatBytes } from '../../lib/files/download';
import { useReducedMotion } from '../../lib/motion';
import type { Span } from './chunk';
import { LIMITS, ParseError, disposePdfReader, parseFile, pdfReaderLoaded, type ParseErrorCode } from './parse';
import { SAMPLE_SETS } from './samples';
import { Engine } from './search';
import { deriveSuggestions } from './suggest';
import { TEXT, fmt, type DemoText } from './text';
import { mostlyCjk } from './tokenize';
import type { Citation, DocLang, Hit, QaResult, SourceDoc } from './types';
import {
  AnswerView,
  HitList,
  Intro,
  LockIcon,
  NoAnswer,
  Note,
  PageIcon,
  Pipeline,
  UploadIcon,
  Viewer,
  XIcon,
  fmtMs,
  fmtNum,
  kindLabel,
  pageCount,
  pageName,
} from './ui';
import './demo.css';

type Scope = 'all' | 'samples' | 'mine';
type UploadError = ParseErrorCode | 'too_many' | 'char_limit' | 'duplicate';

interface Upload {
  id: string;
  name: string;
  size: number;
  status: 'queued' | 'reading' | 'indexing' | 'ready' | 'error';
  progress?: { done: number; total: number };
  error?: UploadError;
  doc?: SourceDoc;
  passages?: number;
  ms?: number;
  headings?: string[];
  emptyPages?: number;
  pdf?: boolean;
}

interface ViewState {
  docId: string;
  page: number;
  /** The page the highlight belongs to (paging away and back keeps it). */
  quotePage: number;
  quoted: Span[];
  note: 'quote' | 'passage' | null;
  from: HTMLElement | null;
}

/** Same breakpoint as the two-column container query in demo.css. */
const WIDE = 880;
const ACCEPT =
  '.pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown';

function errorText(code: UploadError, T: DemoText): string {
  switch (code) {
    case 'too_big':
      return T.errTooBig;
    case 'unsupported':
      return T.errUnsupported;
    case 'old_word':
      return T.errOldWord;
    case 'encrypted':
      return T.errEncrypted;
    case 'scanned':
      return T.errScanned;
    case 'empty':
      return T.errEmpty;
    case 'pdf_engine':
      return T.errPdfEngine;
    case 'too_many':
      return T.errTooMany;
    case 'char_limit':
      return T.errCharLimit;
    case 'duplicate':
      return T.errDuplicate;
    default:
      return T.errCorrupt;
  }
}

/** Puts the sample sets that should be loaded into the engine (and takes others out). */
function syncSamples(engine: Engine, sets: DocLang[], times: Partial<Record<DocLang, number>>): void {
  for (const l of ['zh', 'en'] as const) {
    const docs = SAMPLE_SETS[l].docs;
    if (sets.includes(l)) {
      if (docs.some((d) => !engine.has(d.id))) {
        const t0 = performance.now();
        for (const d of docs) if (!engine.has(d.id)) engine.addDoc(d);
        engine.warm();
        times[l] = performance.now() - t0;
      }
    } else {
      for (const d of docs) if (engine.has(d.id)) engine.removeDoc(d.id);
    }
  }
}

let uid = 0;
const nextId = () => `f${Date.now().toString(36)}${(uid++).toString(36)}`;

export default function DocQaDemo() {
  const { lang } = useI18n();
  const T = TEXT[lang];
  const TRef = useRef(T);
  TRef.current = T;
  const reduced = useReducedMotion();
  const inputId = useId();
  const other: DocLang = lang === 'zh' ? 'en' : 'zh';

  const engineRef = useRef<Engine | null>(null);
  if (!engineRef.current) engineRef.current = new Engine();
  const engine = engineRef.current;

  // ---------- library ----------
  const [alsoOther, setAlsoOther] = useState(false);
  const sets = useMemo<DocLang[]>(() => (alsoOther ? [lang, other] : [lang]), [alsoOther, lang, other]);
  const indexTimes = useRef<Partial<Record<DocLang, number>>>({});
  syncSamples(engine, sets, indexTimes.current);

  const [uploads, setUploads] = useState<Upload[]>([]);
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;
  const files = useRef(new Map<string, File>());
  const queue = useRef<string[]>([]);
  const cancelled = useRef(new Set<string>());
  const usedChars = useRef(0);
  const busy = useRef(false);
  const alive = useRef(true);

  const [scope, setScope] = useState<Scope>('all');
  const scopeTouched = useRef(false);
  const [scopeNote, setScopeNote] = useState(false);

  const readyUploads = uploads.filter((u): u is Upload & { doc: SourceDoc } => u.status === 'ready' && !!u.doc);
  const hasUploads = readyUploads.length > 0;
  const effectiveScope: Scope = hasUploads ? scope : 'all';
  const sampleIds = sets.flatMap((l) => SAMPLE_SETS[l].docs.map((d) => d.id));
  const uploadIds = readyUploads.map((u) => u.doc.id);
  const activeIds = effectiveScope === 'samples' ? sampleIds : effectiveScope === 'mine' ? uploadIds : [...uploadIds, ...sampleIds];
  const stats = engine.stats(activeIds);
  const sampleIndexMs = sets.reduce((sum, l) => sum + (indexTimes.current[l] ?? 0), 0);

  // ---------- question & answer ----------
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<QaResult | null>(null);
  const [run, setRun] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [live, setLive] = useState('');
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  // ---------- side pane ----------
  const [tab, setTab] = useState<'library' | 'source'>('library');
  const [view, setView] = useState<ViewState | null>(null);
  const viewerHeading = useRef<HTMLHeadingElement>(null);
  const sideRef = useRef<HTMLElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const dragDepth = useRef(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= WIDE));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    // Set here too: React's development double-mount runs the cleanup once in between.
    alive.current = true;
    return () => {
      alive.current = false;
      disposePdfReader();
    };
  }, []);

  // Forget an answer or open page whose document left the library (language switch, file removed).
  useEffect(() => {
    if (result && result.hits.some((h) => !engine.has(h.doc.id))) setResult(null);
    if (view && !engine.has(view.docId)) setView(null);
  });

  // The first file that finishes: answer from the visitor's files from now on (they can switch back).
  const hadUploads = useRef(false);
  useEffect(() => {
    if (hasUploads && !hadUploads.current && !scopeTouched.current) {
      setScope('mine');
      setScopeNote(true);
    }
    hadUploads.current = hasUploads;
  }, [hasUploads]);

  // Suggested questions built from the visitor's files.
  const [fileQuestions, setFileQuestions] = useState<string[]>([]);
  const readyKey = uploadIds.join('|');
  useEffect(() => {
    if (!readyKey) {
      setFileQuestions([]);
      return;
    }
    const timer = window.setTimeout(() => {
      const ready = uploadsRef.current.filter((u): u is Upload & { doc: SourceDoc } => u.status === 'ready' && !!u.doc);
      engine.setActive(ready.map((u) => u.doc.id));
      setFileQuestions(deriveSuggestions(engine, ready.map((u) => ({ id: u.doc.id, title: u.name, headings: u.headings ?? [] }))));
    }, 60);
    return () => window.clearTimeout(timer);
  }, [readyKey, engine]);

  const sampleQuestions = sets.flatMap((l, i) => (i === 0 ? SAMPLE_SETS[l].questions : SAMPLE_SETS[l].questions.slice(0, 3)).map((q) => q.q));
  const chips = effectiveScope === 'mine' ? fileQuestions : effectiveScope === 'samples' ? sampleQuestions : [...fileQuestions, ...sampleQuestions];

  const patch = useCallback((id: string, p: Partial<Upload>) => {
    setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...p } : u)));
  }, []);

  const openView = useCallback(
    (v: ViewState, opts: { focus: boolean; scroll: boolean }) => {
      setView(v);
      setTab('source');
      if (!opts.focus && !opts.scroll) return;
      window.requestAnimationFrame(() => {
        if (opts.scroll && !wide) sideRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        if (opts.focus) viewerHeading.current?.focus({ preventScroll: true });
      });
    },
    [reduced, wide],
  );

  const ask = (raw: string) => {
    const question = raw.trim();
    if (!question) {
      inputRef.current?.focus();
      return;
    }
    engine.setActive(activeIds);
    const r = engine.ask(question);
    setResult(r);
    setRun((n) => n + 1);
    setQuery(question);
    setHistory((h) => [question, ...h.filter((x) => x !== question)].slice(0, 8));
    setCopied(false);
    // A highlight from the previous answer would now point at the wrong thing.
    setView((v) => (v && v.note ? { ...v, quoted: [], note: null, from: null } : v));
    if (r.answer.status === 'ok') {
      const quoteText = r.answer.quotes.map((q) => q.doc.pages[q.page].slice(q.span.start, q.span.end)).join(' ');
      setLive(fmt(T.liveAnswer, { n: r.answer.citations.length, text: quoteText.slice(0, 280) }));
      const c = r.answer.citations[0];
      // Wide screens: the cited page opens next to the answer straight away.
      if (wide && c && !uploadsRef.current.some((u) => u.status === 'reading' || u.status === 'indexing' || u.status === 'queued')) {
        openView({ docId: c.doc.id, page: c.page, quotePage: c.page, quoted: c.quoted, note: 'quote', from: null }, { focus: false, scroll: false });
      }
    } else {
      setLive(T.liveNone);
    }
  };

  // Ask again once the other language's samples are in the engine (after the next render).
  const [askAfterLoad, setAskAfterLoad] = useState<string | null>(null);
  useEffect(() => {
    if (askAfterLoad && alsoOther) {
      setAskAfterLoad(null);
      ask(askAfterLoad);
    }
  });
  const loadOtherAndAsk = () => {
    if (!result) return;
    setAlsoOther(true);
    setAskAfterLoad(result.question);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    ask(query);
  };

  const onCite = (c: Citation, el: HTMLElement) =>
    openView({ docId: c.doc.id, page: c.page, quotePage: c.page, quoted: c.quoted, note: 'quote', from: el }, { focus: true, scroll: true });
  const onHit = (h: Hit, el: HTMLElement) =>
    openView({ docId: h.doc.id, page: h.page, quotePage: h.page, quoted: [h.passage], note: 'passage', from: el }, { focus: true, scroll: true });
  const openDoc = (doc: SourceDoc, el: HTMLElement) =>
    openView({ docId: doc.id, page: 0, quotePage: 0, quoted: [], note: null, from: el }, { focus: true, scroll: false });

  const backToAnswer = () => {
    const from = view?.from;
    const target = from && document.contains(from) ? from : answerRef.current;
    target?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    target?.focus({ preventScroll: true });
  };

  const onCopy = async () => {
    if (!result || result.answer.status !== 'ok') return;
    const { quotes, citations } = result.answer;
    const lines = [
      `${T.askLabel}: ${result.question}`,
      '',
      ...quotes.map((q) => `“${q.doc.pages[q.page].slice(q.span.start, q.span.end)}” [${q.cite}]`),
      '',
      `${T.sources}:`,
      ...citations.map((c) => `[${c.n}] ${c.doc.title}, ${pageName(c.doc, c.page, T)}`),
    ];
    if (await copyText(lines.join('\n'))) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  // ---------- importing files ----------
  const processFile = async (id: string, file: File) => {
    const isCancelled = () => !alive.current || cancelled.current.has(id);
    patch(id, { status: 'reading' });
    try {
      const parsed = await parseFile(file, {
        onProgress: (done, total) => patch(id, { progress: { done, total } }),
        cancelled: isCancelled,
      });
      if (isCancelled()) return;
      const chars = parsed.pages.reduce((n, p) => n + p.length, 0);
      if (usedChars.current + chars > LIMITS.chars) {
        patch(id, { status: 'error', error: 'char_limit', progress: undefined });
        return;
      }
      patch(id, { status: 'indexing', progress: undefined, pdf: parsed.kind === 'pdf' });
      const doc: SourceDoc = {
        id: `up:${id}`,
        title: file.name,
        origin: 'upload',
        kind: parsed.kind,
        lang: mostlyCjk(parsed.pages.join('\n').slice(0, 4000)) ? 'zh' : 'en',
        pageLabel: parsed.pageLabel,
        approxPages: parsed.approxPages,
        pages: parsed.pages,
      };
      const t0 = performance.now();
      const ok = await engine.addDocAsync(doc, { cancelled: isCancelled });
      const ms = performance.now() - t0;
      if (!ok || isCancelled()) {
        engine.removeDoc(doc.id);
        return;
      }
      usedChars.current += chars;
      patch(id, { status: 'ready', doc, passages: engine.passageCount(doc.id), ms, headings: parsed.headings, emptyPages: parsed.emptyPages });
      setLive(fmt(TRef.current.added, { name: file.name, pages: pageCount(doc, TRef.current) }));
    } catch (e) {
      if (isCancelled()) return;
      const code: UploadError = e instanceof ParseError ? e.code : 'corrupt';
      if (code === 'cancelled') return;
      if (!(e instanceof ParseError)) console.warn('[doc-qa] could not read file', e);
      patch(id, { status: 'error', error: code, progress: undefined });
      setLive(fmt(TRef.current.failed, { name: file.name, reason: errorText(code, TRef.current) }));
    }
  };

  const pump = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      while (queue.current.length && alive.current) {
        const id = queue.current.shift();
        if (!id) break;
        const file = files.current.get(id);
        files.current.delete(id);
        if (!file || cancelled.current.has(id)) continue;
        await processFile(id, file);
      }
    } finally {
      busy.current = false;
    }
  };

  const addFiles = (list: File[]) => {
    if (!list.length) return;
    const kept = uploadsRef.current.filter((u) => u.status !== 'error');
    const added: Upload[] = [];
    let count = kept.length;
    for (const f of list) {
      const base = { id: nextId(), name: f.name, size: f.size };
      if (count >= LIMITS.files) added.push({ ...base, status: 'error', error: 'too_many' });
      else if ([...kept, ...added].some((u) => u.status !== 'error' && u.name === f.name && u.size === f.size)) added.push({ ...base, status: 'error', error: 'duplicate' });
      else if (f.size > LIMITS.bytes) added.push({ ...base, status: 'error', error: 'too_big' });
      else {
        files.current.set(base.id, f);
        queue.current.push(base.id);
        count++;
        added.push({ ...base, status: 'queued', pdf: /\.pdf$/i.test(f.name) });
      }
    }
    setUploads((u) => [...u, ...added]);
    setTab('library');
    void pump();
  };

  const removeUpload = (u: Upload) => {
    cancelled.current.add(u.id);
    files.current.delete(u.id);
    queue.current = queue.current.filter((x) => x !== u.id);
    if (u.doc) {
      engine.removeDoc(u.doc.id);
      usedChars.current = Math.max(0, usedChars.current - u.doc.pages.reduce((n, p) => n + p.length, 0));
    }
    setUploads((list) => list.filter((x) => x.id !== u.id));
    fileInput.current?.focus();
  };

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  const dragHandlers = {
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current++;
      setOver(true);
      setTab('library');
    },
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setOver(false);
    },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setOver(false);
      addFiles(Array.from(e.dataTransfer.files));
    },
  };

  const chooseScope = (s: Scope) => {
    scopeTouched.current = true;
    setScopeNote(false);
    setScope(s);
  };

  // ---------- rendering ----------
  const viewDoc = view ? engine.doc(view.docId) : undefined;
  const company = sets.map((l) => SAMPLE_SETS[l].company).join(' · ');
  const placeholder = effectiveScope === 'mine' ? T.placeholderMine : T.placeholder;
  const busyCount = uploads.filter((u) => u.status === 'queued' || u.status === 'reading' || u.status === 'indexing').length;
  const status = result?.answer.status;
  const pastQuestions = history.filter((h) => h !== result?.question);
  // An English question with only the Chinese samples loaded (or the other way round).
  const questionLang: DocLang | null = result && /\p{L}/u.test(result.question) ? (mostlyCjk(result.question) ? 'zh' : 'en') : null;
  const crossLanguage = !!questionLang && effectiveScope !== 'mine' && !sets.includes(questionLang);

  const uploadMeta = (u: Upload): string => {
    switch (u.status) {
      case 'queued':
        return T.queued;
      case 'reading':
        if (u.progress) return fmt(T.pdfPage, { n: u.progress.done, total: u.progress.total });
        return u.pdf && !pdfReaderLoaded() ? T.loadingPdf : T.reading;
      case 'indexing':
        return T.indexing;
      case 'ready':
        return u.doc ? fmt(T.readyMeta, { pages: pageCount(u.doc, T), passages: fmt(T.passages, { n: u.passages ?? 0 }), ms: fmtMs(u.ms ?? 0) }) : '';
      default:
        return u.error ? errorText(u.error, T) : '';
    }
  };

  return (
    <div ref={rootRef} className="demo dq">
      <div className="demo-bar dq-top">
        <span className="dq-local" title={T.localHint}>
          <span className="led is-live" aria-hidden="true" />
          <span className="demo-label">{T.local}</span>
        </span>
        <span className="dq-company">{effectiveScope === 'mine' ? T.yourFiles : company}</span>
        <span className="dq-stats">
          {fmt(T.docs, { n: stats.docs })}
          {stats.parts === 0 && ` · ${fmt(T.pages, { n: stats.pages })}`} · {fmt(T.passages, { n: fmtNum(stats.passages, lang) })}
          {effectiveScope !== 'mine' && sampleIndexMs > 0 && <span className="dq-stats-ms"> · {fmt(T.indexed, { ms: fmtMs(sampleIndexMs) })}</span>}
        </span>
        <span className="spacer" />
        <span className="dq-also">
          <span className="demo-label">{T.alsoLoad}</span>
          <button type="button" className="demo-chip" aria-pressed={alsoOther} title={T.otherSamplesHint} onClick={() => setAlsoOther((v) => !v)}>
            {T.otherSamples}
          </button>
        </span>
      </div>

      <div className="dq-main">
        <div className="dq-qa">
          <form className="dq-ask" role="search" onSubmit={onSubmit}>
            <label htmlFor={inputId} className="visually-hidden">
              {T.askLabel}
            </label>
            <span className="dq-prompt" aria-hidden="true">
              ›
            </span>
            <input
              ref={inputRef}
              id={inputId}
              className="input dq-input"
              type="text"
              enterKeyHint="search"
              autoComplete="off"
              spellCheck={false}
              maxLength={300}
              value={query}
              placeholder={placeholder}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" className="btn btn-primary dq-ask-btn">
              {T.ask}
              <span className="dq-enter" aria-hidden="true">
                ↵
              </span>
            </button>
          </form>

          {hasUploads && (
            <div className="dq-scope">
              <span className="demo-label" id={`${inputId}-scope`}>
                {T.scope}
              </span>
              <div className="demo-seg" role="group" aria-labelledby={`${inputId}-scope`}>
                {(
                  [
                    ['mine', T.scopeMine],
                    ['samples', T.scopeSamples],
                    ['all', T.scopeAll],
                  ] as const
                ).map(([s, label]) => (
                  <button key={s} type="button" aria-pressed={effectiveScope === s} onClick={() => chooseScope(s)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {scopeNote && effectiveScope === 'mine' && <Note>{T.scopeSwitched}</Note>}

          <div className="dq-suggest">
            <span className="demo-label">{effectiveScope === 'mine' ? T.fromYourFiles : T.tryThese}</span>
            {chips.length > 0 ? (
              <div className="demo-chips dq-chips">
                {chips.map((q) => (
                  <button key={q} type="button" className="demo-chip dq-chip" aria-pressed={result?.question === q} onClick={() => ask(q)}>
                    {q}
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted small dq-chips-empty">{T.noFileSuggestions}</p>
            )}
          </div>

          {pastQuestions.length > 0 && (
            <div className="dq-history">
              <span className="demo-label">{T.history}</span>
              <ul>
                {pastQuestions.map((h) => (
                  <li key={h}>
                    <button type="button" className="dq-history-item" onClick={() => ask(h)}>
                      {h}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
            {live}
          </p>

          <div ref={answerRef} tabIndex={-1} className="dq-result">
            {result ? (
              <>
                <Pipeline T={T} timings={result.timings} passages={result.passages} run={run} />
                <div className={`dq-reveal${reduced ? '' : ' is-animated'}`} key={run}>
                  {status === 'ok' ? (
                    <AnswerView T={T} result={result} onCite={onCite} copyLabel={copied ? T.copied : T.copy} onCopy={onCopy} />
                  ) : (
                    <NoAnswer
                      T={T}
                      status={status === 'vague' || status === 'empty' ? status : 'none'}
                      onLoadOther={status === 'none' && crossLanguage ? loadOtherAndAsk : undefined}
                    />
                  )}
                  {result.hits.length > 0 && (
                    <section className="dq-results" aria-label={status === 'ok' ? fmt(T.results, { n: result.hits.length }) : T.closest}>
                      <h3 className="demo-label dq-sub">{status === 'ok' ? fmt(T.results, { n: result.hits.length }) : T.closest}</h3>
                      <HitList T={T} hits={result.hits} query={result.query} onOpen={onHit} dim={status !== 'ok'} />
                    </section>
                  )}
                </div>
              </>
            ) : (
              <Intro T={T} />
            )}
          </div>
        </div>

        <aside ref={sideRef} className={`demo-pane dq-side${over ? ' is-over' : ''}`} {...dragHandlers}>
          <div className="demo-seg dq-tabs" role="group" aria-label={`${T.library} / ${T.source}`}>
            <button type="button" aria-pressed={tab === 'library'} onClick={() => setTab('library')}>
              {T.library}
              <span className="dq-tab-n">{busyCount > 0 ? `${busyCount}…` : sampleIds.length + readyUploads.length}</span>
            </button>
            <button type="button" aria-pressed={tab === 'source'} onClick={() => setTab('source')}>
              {T.source}
            </button>
          </div>

          {tab === 'library' ? (
            <div className="dq-lib">
              {uploads.length > 0 && (
                <>
                  <h3 className="demo-label dq-sub">{T.yourFiles}</h3>
                  <ul className={`dq-files${effectiveScope === 'samples' ? ' is-off' : ''}`}>
                    {uploads.map((u) => {
                      const meta = uploadMeta(u);
                      const notes: string[] = [];
                      if (u.doc?.pageLabel === 'part' && u.doc.pages.length > 1) notes.push(T.partsNote);
                      if (u.doc?.approxPages) notes.push(T.approxPages);
                      if (u.emptyPages) notes.push(fmt(T.emptyPages, { n: u.emptyPages }));
                      const pct = u.progress ? Math.round((u.progress.done / Math.max(1, u.progress.total)) * 100) : null;
                      return (
                        <li key={u.id} className={`dq-file is-${u.status}`}>
                          {u.doc ? (
                            <button type="button" className="dq-file-main" onClick={(e) => u.doc && openDoc(u.doc, e.currentTarget)}>
                              <PageIcon />
                              <span className="dq-file-text">
                                <span className="dq-file-name">{u.name}</span>
                                <span className="dq-file-meta">
                                  <span className="demo-state is-ok">{kindLabel(u.doc, T)}</span> {meta}
                                </span>
                                {notes.map((n) => (
                                  <span key={n} className="dq-file-note">
                                    {n}
                                  </span>
                                ))}
                              </span>
                            </button>
                          ) : (
                            <div className="dq-file-main">
                              <PageIcon />
                              <span className="dq-file-text">
                                <span className="dq-file-name">{u.name}</span>
                                <span className="dq-file-meta">
                                  <span className={`demo-state ${u.status === 'error' ? 'is-bad' : 'is-wip'}`}>
                                    {u.status === 'error' ? '×' : <span className="dq-spin" aria-hidden="true" />}
                                  </span>{' '}
                                  {meta} <span className="dq-file-size">{formatBytes(u.size)}</span>
                                </span>
                                {(u.status === 'reading' || u.status === 'indexing') && (
                                  <span className={`dq-progress${pct === null ? ' is-indeterminate' : ''}`} aria-hidden="true">
                                    <i style={pct === null ? undefined : { width: `${pct}%` }} />
                                  </span>
                                )}
                              </span>
                            </div>
                          )}
                          <button
                            type="button"
                            className="dq-icon-btn dq-remove"
                            aria-label={fmt(u.status === 'ready' || u.status === 'error' ? T.remove : T.cancel, { name: u.name })}
                            onClick={() => removeUpload(u)}
                          >
                            <XIcon />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              <label className={`demo-drop dq-drop${over ? ' is-over' : ''}`}>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  aria-label={`${T.choose}: ${T.dropBody}`}
                  onChange={(e) => {
                    addFiles(Array.from(e.target.files ?? []));
                    e.target.value = '';
                  }}
                />
                <UploadIcon width={22} height={22} />
                <span className="dq-drop-title">{T.dropTitle}</span>
                <span className="small">{T.dropBody}</span>
                <span className="btn btn-secondary btn-small dq-drop-btn" aria-hidden="true">
                  {T.choose}
                </span>
                <span className="dq-drop-limits">{T.limits}</span>
              </label>
              <p className="dq-privacy">
                <LockIcon />
                <span>{T.privacy}</span>
              </p>

              <h3 className="demo-label dq-sub">
                {T.samples} · {company}
              </h3>
              <ul className={`dq-docs${effectiveScope === 'mine' ? ' is-off' : ''}`}>
                {sets.flatMap((l) =>
                  SAMPLE_SETS[l].docs.map((d) => (
                    <li key={d.id}>
                      <button type="button" className="dq-doc" aria-label={fmt(T.openDoc, { doc: d.title })} onClick={(e) => openDoc(d, e.currentTarget)}>
                        <span className="dq-doc-icon" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                        <span className="dq-doc-name">{d.title}</span>
                        <span className="dq-doc-meta">
                          {pageCount(d, T)} · {fmt(T.passages, { n: engine.passageCount(d.id) })}
                        </span>
                        {alsoOther && <span className="dq-doc-lang">{d.lang === 'zh' ? '中' : 'EN'}</span>}
                      </button>
                    </li>
                  )),
                )}
              </ul>
            </div>
          ) : viewDoc && view ? (
            <Viewer
              T={T}
              doc={viewDoc}
              page={Math.min(view.page, viewDoc.pages.length - 1)}
              quoted={view.page === view.quotePage ? view.quoted : []}
              note={view.note === 'quote' ? T.highlightNote : view.note === 'passage' ? T.passageNote : null}
              query={result?.query ?? null}
              onPage={(page) => setView({ ...view, page })}
              onBack={!wide && view.from ? backToAnswer : null}
              headingRef={viewerHeading}
              motion={!reduced}
            />
          ) : (
            <p className="demo-empty">{T.viewerEmpty}</p>
          )}
        </aside>
      </div>
    </div>
  );
}
