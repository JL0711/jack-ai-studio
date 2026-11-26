// Presentational pieces shared by both modes: the call header, waveform,
// transcript, suggestions, facts and the summary.

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { Caption } from './player';
import { fill, type DemoText } from './text';
import type { CallSummary, Entity, Fact, FactKey, Heard, Suggestion, Turn } from './types';

export function mmss(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export type CallState = 'dialing' | 'live' | 'paused' | 'ended';

export function CallHead({ T, state, callMs }: { T: DemoText; state: CallState; callMs: number }) {
  const label = state === 'dialing' ? T.dialing : state === 'paused' ? T.paused : state === 'ended' ? T.ended : T.onCall;
  const led = state === 'live' ? 'is-live' : state === 'dialing' ? 'is-wip' : 'is-off';
  return (
    <div className="cc-head">
      <span className="cc-state">
        <span className={`led ${led}`} aria-hidden="true" />
        <span>{label}</span>
      </span>
      <span className="cc-timer" role="timer" aria-label={T.callTime}>
        <span className="cc-timer-ghost" aria-hidden="true">
          88:88
        </span>
        <span className="cc-timer-value">{mmss(callMs)}</span>
      </span>
      <span className="cc-rec">
        <span className="cc-rec-dot" aria-hidden="true" />
        {T.recording}
      </span>
    </div>
  );
}

export function WhoRow({ caller, you, T }: { caller: string; you: string; T: DemoText }) {
  const initial = Array.from(caller.trim())[0] ?? '?';
  return (
    <div className="cc-who-row">
      <span className="cc-avatar" aria-hidden="true">
        {initial}
      </span>
      <span className="cc-caller">
        <b>{caller}</b>
        <span>{fill(T.youAre, { role: you })}</span>
      </span>
      <span className="cc-sim">{T.simulated}</span>
    </div>
  );
}

const BARS = 48;

/** Bars that move while someone is talking: amber for them, grey for you. */
export function Waveform({ who }: { who: 'them' | 'you' | null }) {
  return (
    <div className={`cc-wave${who ? ` is-on is-${who}` : ''}`} aria-hidden="true">
      {Array.from({ length: BARS }, (_, i) => (
        <i key={i} style={{ ['--i' as string]: i, ['--h' as string]: (0.25 + 0.2 * Math.abs(Math.sin(i * 1.7))).toFixed(2) }} />
      ))}
    </div>
  );
}

/** Text with the heard facts marked. */
export function LineText({ text, entities }: { text: string; entities: Entity[] }) {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const e of [...entities].sort((a, b) => a.index - b.index)) {
    if (e.index < at) continue;
    if (e.index > at) parts.push(text.slice(at, e.index));
    parts.push(
      <mark key={e.index} className="demo-mark cc-ent">
        {text.slice(e.index, e.index + e.text.length)}
      </mark>,
    );
    at = e.index + e.text.length;
  }
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

export function Transcript({
  T,
  turns,
  caption,
  empty,
}: {
  T: DemoText;
  turns: Turn[];
  caption: Caption | null;
  empty?: ReactNode;
}) {
  const ref = useRef<HTMLOListElement>(null);
  const size = turns.length + (caption ? caption.settled.length + caption.partial.length : 0);
  // Keep the newest line in view by scrolling the list itself, never the page.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [size]);

  return (
    <ol ref={ref} className="cc-transcript" aria-label={T.transcript} tabIndex={0}>
      {turns.length === 0 && !caption && empty ? <li className="cc-empty">{empty}</li> : null}
      {turns.map((turn, i) => (
        <li key={i} className={`cc-line is-${turn.who}`}>
          <span className="cc-who">{turn.who === 'them' ? T.them : T.you}</span>
          <p className="cc-text">
            {turn.who === 'them' ? <LineText text={turn.text} entities={turn.entities} /> : turn.text}
          </p>
          {turn.tactic && (
            <span className="cc-line-tag">
              {T.tactics[turn.tactic]}
              {turn.auto ? ` · ${T.autoPicked}` : ''}
            </span>
          )}
        </li>
      ))}
      {caption && (
        <li className={`cc-line is-${caption.who} is-live`}>
          <span className="cc-who">{caption.who === 'them' ? T.them : T.you}</span>
          <p className="cc-text">
            {caption.settled}
            <span className="cc-partial">{caption.partial}</span>
            <span className="cc-caret" aria-hidden="true" />
          </p>
          <span className="cc-line-tag is-live">{T.transcribing}</span>
        </li>
      )}
    </ol>
  );
}

export function HeardTags({ T, heard }: { T: DemoText; heard: Heard | null }) {
  const list = heard ? heard.intents.filter((s, i) => i === 0 || s.score >= 2).slice(0, 3) : [];
  return (
    <div className="cc-heard">
      <span className="demo-label">{T.heard}</span>
      {list.length ? (
        <ul className="tags">
          {list.map((s) => (
            <li key={s.intent} className="tag">
              {T.intents[s.intent]}
            </li>
          ))}
        </ul>
      ) : (
        <span className="cc-dash" aria-hidden="true">
          —
        </span>
      )}
    </div>
  );
}

/** Empty suggestion cards: still while listening, with a light sweep while thinking. */
export function ThinkingBars({ still = false }: { still?: boolean }) {
  return (
    <div className={`cc-thinking${still ? ' is-still' : ''}`} aria-hidden="true">
      {[86, 64, 74].map((w, i) => (
        <div key={i} className="cc-ghost-card">
          <i style={{ width: '34%' }} />
          <i style={{ width: `${w}%` }} />
        </div>
      ))}
    </div>
  );
}

export interface AutoInfo {
  id: string;
  /** 1 → 0 as the countdown runs out. */
  left: number;
  seconds: number;
}

export function Suggestions({
  T,
  items,
  onPick,
  auto,
  chosen,
  showKeys,
  onFocusLost,
}: {
  T: DemoText;
  items: Suggestion[];
  onPick: (id: string) => void;
  auto?: AutoInfo | null;
  /** The reply being said: the others fade, nothing can be picked. */
  chosen?: string | null;
  showKeys: boolean;
  /** Called when the list goes away while one of its buttons has focus. */
  onFocusLost?: () => void;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const lost = useRef(onFocusLost);
  lost.current = onFocusLost;
  // Runs before the buttons leave the page, so keyboard focus can be moved somewhere sensible.
  useLayoutEffect(
    () => () => {
      if (ref.current?.contains(document.activeElement)) lost.current?.();
    },
    [],
  );
  return (
    <ul ref={ref} className={`cc-sugs${chosen ? ' is-said' : ''}`}>
      {items.map((s, i) => {
        const isAuto = !chosen && auto?.id === s.id;
        const state = chosen ? (chosen === s.id ? ' is-chosen' : ' is-dropped') : '';
        return (
          <li key={s.id} style={{ ['--k' as string]: i }}>
            <button
              type="button"
              className={`cc-sug${isAuto ? ' is-auto' : ''}${state}`}
              aria-disabled={chosen ? true : undefined}
              onClick={() => {
                if (!chosen) onPick(s.id);
              }}
            >
              <span className="cc-tactic">{T.tactics[s.tactic]}</span>
              <span className="cc-sug-text">{s.text}</span>
              {showKeys && !chosen && (
                <kbd className="cc-key" aria-hidden="true">
                  {i + 1}
                </kbd>
              )}
              {isAuto && auto && (
                <>
                  <span className="cc-auto">{fill(T.autoIn, { s: auto.seconds })}</span>
                  <i className="cc-auto-bar" style={{ transform: `scaleX(${auto.left.toFixed(3)})` }} aria-hidden="true" />
                </>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function FactList({ T, facts, fresh }: { T: DemoText; facts: Fact[]; fresh: ReadonlySet<FactKey> }) {
  if (!facts.length) return <p className="cc-nofacts">{T.noFacts}</p>;
  return (
    <ul className="cc-facts">
      {facts.map((f) => (
        <li key={f.key} className={`cc-fact${fresh.has(f.key) ? ' is-new' : ''}`}>
          <span>{T.factLabels[f.key]}</span>
          <b>{f.value}</b>
        </li>
      ))}
    </ul>
  );
}

export function SummaryView({ T, summary, actions }: { T: DemoText; summary: CallSummary; actions: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Move keyboard focus to the summary when it appears, without scrolling the page.
  useEffect(() => {
    const el = ref.current;
    if (el && el.contains(document.activeElement) === false && document.activeElement?.closest('.cc')) {
      el.focus({ preventScroll: true });
    }
  }, []);
  return (
    <div ref={ref} className="cc-summary" tabIndex={-1} aria-labelledby="cc-summary-title">
      <h3 id="cc-summary-title" className="cc-summary-title">
        {T.summary}
      </h3>
      <p className="cc-summary-note">{T.summaryNote}</p>
      <div className="cc-summary-block">
        <span className="demo-label">{T.facts}</span>
        <FactList T={T} facts={summary.facts} fresh={new Set()} />
      </div>
      <div className="cc-summary-block">
        <span className="demo-label">{T.agreed}</span>
        {summary.agreed.length ? (
          <ul className="cc-list">
            {summary.agreed.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : (
          <p className="cc-nofacts">{T.nothingAgreed}</p>
        )}
      </div>
      <div className="cc-summary-block">
        <span className="demo-label">{T.followUp}</span>
        <ul className="cc-list is-todo">
          {summary.followUps.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>
      <div className="cc-summary-actions">{actions}</div>
    </div>
  );
}
