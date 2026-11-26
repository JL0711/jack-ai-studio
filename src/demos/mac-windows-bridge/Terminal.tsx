import { memo, useEffect, useId, useLayoutEffect, useRef, useState, type Dispatch, type FormEvent, type KeyboardEvent } from 'react';
import {
  COMMANDS,
  activeRun,
  findCommand,
  formatExit,
  historyStep,
  normalizeCommand,
  palette,
  viewRun,
  type Lang,
  type Run,
  type TermAction,
  type TermState,
} from './commands';
import type { BridgeText } from './text';

const PROMPT = 'C:\\work>';

function seconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

export function Terminal({
  T,
  lang,
  paired,
  term,
  dispatch,
  announce,
  onFinished,
}: {
  T: BridgeText;
  lang: Lang;
  paired: boolean;
  term: TermState;
  dispatch: Dispatch<TermAction>;
  announce: (text: string) => void;
  onFinished: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [hIndex, setHIndex] = useState<number | null>(null);
  const saved = useRef('');
  const outRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const running = activeRun(term);
  const last = term.runs[term.runs.length - 1];
  const ids = palette(lang);
  const known = ids.map((cid) => COMMANDS[cid]).join(lang === 'zh' ? '、' : ', ');

  // Keep the newest output in view, unless the visitor scrolled up to read.
  const lastLines = last ? viewRun(last).lines.length : 0;
  useLayoutEffect(() => {
    const el = outRef.current;
    if (el && follow.current) el.scrollTop = el.scrollHeight;
  }, [term.runs.length, lastLines, last?.status]);

  // Announce the end of a command once (start and end only; streaming lines are not read out).
  const prev = useRef<{ n: number; status: Run['status'] } | null>(null);
  useEffect(() => {
    if (!last) return;
    const p = prev.current;
    if (p && p.n === last.n && p.status === 'running' && last.status !== 'running') {
      const v = viewRun(last);
      announce(last.status === 'stopped' ? T.stopSay(last.input) : T.endSay(last.input, formatExit(v.exitCode ?? 0), seconds(v.durationMs)));
      onFinished();
    }
    prev.current = { n: last.n, status: last.status };
  }, [last, T, announce, onFinished]);

  const start = (input: string) => {
    const text = input.trim();
    if (!text || running || !paired) return;
    follow.current = true;
    dispatch({ type: 'run', input: text, now: Date.now() });
    setDraft('');
    setHIndex(null);
    const word = normalizeCommand(text);
    if (findCommand(text)) announce(T.startSay(text));
    else if (word === 'help') announce(`${T.help} ${known}`);
    else if (word !== 'cls' && word !== 'clear') announce(T.unknown(known));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    start(draft);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const next = historyStep(term.history, hIndex, e.key === 'ArrowUp' ? 'up' : 'down');
      if (next === hIndex && next === null) return;
      e.preventDefault();
      if (hIndex === null) saved.current = draft;
      setHIndex(next);
      setDraft(next === null ? saved.current : term.history[next]);
      return;
    }
    // Ctrl+C stops a running command (only when nothing is selected, so copying still works).
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C') && running) {
      const el = e.currentTarget;
      if (el.selectionStart === el.selectionEnd) {
        e.preventDefault();
        dispatch({ type: 'stop' });
      }
    }
  };

  return (
    <section className={`mb-term${paired ? '' : ' is-locked'}`} aria-labelledby={`${id}-h`}>
      <div className="mb-term-head">
        <span className="mb-term-title" id={`${id}-h`}>
          {T.termTitle}
        </span>
        <span className="mb-term-sub">{T.termSub}</span>
        <span className="mb-term-tag">{T.sampleOutput}</span>
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-danger btn-small mb-stop"
          onClick={() => dispatch({ type: 'stop' })}
          disabled={!running}
          aria-keyshortcuts="Control+C"
        >
          <span className="mb-stop-sq" aria-hidden="true" />
          {T.stop}
          <kbd className="demo-kbd">Ctrl+C</kbd>
        </button>
      </div>

      <div className="mb-palette" role="group" aria-label={T.inputLabel}>
        {ids.map((cid) => (
          <button
            key={cid}
            type="button"
            className={`mb-cmd${cid === 'train-oom' ? ' is-fail' : ''}`}
            disabled={!paired || !!running}
            title={cid === 'train-oom' ? T.failHint : undefined}
            onClick={() => start(COMMANDS[cid])}
          >
            <span aria-hidden="true">›</span> {COMMANDS[cid]}
            {cid === 'train-oom' && <span className="visually-hidden"> ({T.failHint})</span>}
          </button>
        ))}
      </div>

      <div
        ref={outRef}
        className="mb-out"
        tabIndex={0}
        role="log"
        aria-live="off"
        aria-label={T.termTitle}
        onScroll={(e) => {
          const el = e.currentTarget;
          follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 28;
        }}
      >
        {term.runs.length === 0 && <p className="mb-out-empty">{paired ? T.termEmpty : T.pairFirst}</p>}
        {term.runs.map((run) => (
          <RunBlock key={run.n} T={T} run={run} known={known} />
        ))}
      </div>

      <form className="mb-input-row" onSubmit={submit}>
        <label htmlFor={`${id}-in`} className="mb-prompt">
          {PROMPT}
          <span className="visually-hidden"> {T.inputLabel}</span>
        </label>
        <input
          id={`${id}-in`}
          className="mb-input"
          value={draft}
          disabled={!paired}
          placeholder={paired ? T.placeholder : T.pairFirst}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => {
            setDraft(e.target.value);
            setHIndex(null);
          }}
          onKeyDown={onKey}
        />
        <button type="submit" className="btn btn-secondary btn-small" disabled={!paired || !!running || !draft.trim()}>
          {T.run} <span aria-hidden="true">↵</span>
        </button>
      </form>
    </section>
  );
}

/** Memoised: a finished run keeps its object identity, so only the running one re-renders on each tick. */
const RunBlock = memo(function RunBlock({ T, run, known }: { T: BridgeText; run: Run; known: string }) {
  const view = viewRun(run);
  return (
    <div className="mb-run">
      <p className="mb-line mb-cmdline">
        <span className="mb-prompt">{PROMPT}</span> {run.input}
      </p>
      {run.status === 'unknown' && <p className="mb-line mb-simmsg">[sim] {T.unknown(known)}</p>}
      {run.status === 'help' && (
        <p className="mb-line mb-simmsg">
          [sim] {T.help} {known}. {T.helpLocal}
        </p>
      )}
      {view.lines.map((line, i) => (
        <p key={i} className={`mb-line${line.stream === 'err' ? ' is-err' : ''}`}>
          {line.text || '\u00a0'}
        </p>
      ))}
      {run.status === 'running' && <span className="mb-caret" aria-hidden="true" />}
      {view.exitCode !== null && (
        <p className="mb-exit">
          <span className={`badge ${view.interrupted ? 'badge-pending_approval' : view.exitCode === 0 ? 'badge-live' : 'badge-danger'}`}>
            {view.interrupted ? T.interrupted : T.exit(formatExit(view.exitCode))}
          </span>
          {/* the Windows status code stays out of the badge, which would upper-case its 0x */}
          {view.interrupted && <code className="mb-code">{T.exit(formatExit(view.exitCode))}</code>}
          <span className="mb-took">{T.took(seconds(view.durationMs))}</span>
        </p>
      )}
    </div>
  );
});
