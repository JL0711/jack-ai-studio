// "Listen to a call": a scripted call plays on its own; the visitor can pick
// any suggested reply, and the script follows that choice.

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CallHead, FactList, HeardTags, Suggestions, SummaryView, ThinkingBars, Transcript, Waveform, WhoRow, type CallState } from './parts';
import { choose, currentCaption, startState, tick, timingFor, type PlayerState } from './player';
import { findScenario, nodeOf, autoReply, scenariosFor, SCENARIO_IDS } from './scenarios';
import { summarize } from './suggest';
import { bare, fill, type DemoText } from './text';
import { FACT_KEYS, type Lang, type ScenarioId, type Suggestion } from './types';

interface Props {
  lang: Lang;
  T: DemoText;
  modeSwitch: ReactNode;
  onScreen: boolean;
  reduced: boolean;
  showKeys: boolean;
}

export const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7 4.5v15l12.5-7.5z" />
  </svg>
);
export const PauseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 4.5h4v15H6zM14 4.5h4v15h-4z" />
  </svg>
);
export const RestartIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" />
    <path d="M4 3.5v5h5" />
  </svg>
);

export function ScriptCall({ lang, T, modeSwitch, onScreen, reduced, showKeys }: Props) {
  const [scenarioId, setScenarioId] = useState<ScenarioId>('inquiry');
  const scenario = findScenario(lang, scenarioId);
  const [state, setState] = useState<PlayerState>(() => startState(scenario));
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [autoPick, setAutoPick] = useState(true);
  const [announcement, setAnnouncement] = useState('');
  const paneRef = useRef<HTMLElement>(null);
  const timing = useMemo(() => timingFor(lang, reduced), [lang, reduced]);
  const ended = state.phase === 'ended';
  const running = playing && onScreen && !ended;

  // The clock: about 20 updates a second, only while the demo is on screen and playing.
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const frame = (now: number) => {
      // Real elapsed time, so a slow or throttled page still plays at the right pace;
      // capped so one very late frame cannot skip a whole line.
      acc += Math.min(now - last, 1000);
      last = now;
      if (acc >= 50) {
        const step = acc * speed;
        acc = 0;
        setState((s) => tick(s, step, scenario, lang, timing, autoPick));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running, speed, scenario, lang, timing, autoPick]);

  const node = nodeOf(scenario, state.nodeId);
  const choosing = state.phase === 'choose';
  const saying = state.phase === 'you' || state.phase === 'gap';

  // One short announcement per turn for screen readers (captions are not announced word by word).
  useEffect(() => {
    if (state.phase === 'choose') setAnnouncement(fill(T.announce, { who: T.them, line: bare(node.them), n: node.replies.length }));
    else if (state.phase === 'ended') setAnnouncement(T.announceEnd);
  }, [state.phase, node, T]);

  const keepFocus = useCallback(() => paneRef.current?.focus({ preventScroll: true }), []);

  const restart = useCallback(
    (id: ScenarioId = scenarioId, opts: { autoPick?: boolean } = {}) => {
      setScenarioId(id);
      setState(startState(findScenario(lang, id)));
      setPlaying(true);
      if (opts.autoPick !== undefined) setAutoPick(opts.autoPick);
    },
    [lang, scenarioId],
  );

  const pick = useCallback(
    (id: string) => {
      setAutoPick(false);
      setPlaying(true);
      setState((s) => choose(s, scenario, id));
    },
    [scenario],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!choosing || e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select')) return;
    const n = Number(e.key);
    const reply = node.replies[n - 1];
    if (reply) {
      e.preventDefault();
      pick(reply.id);
    }
  };

  const suggestions: Suggestion[] = node.replies.map((r) => ({ id: r.id, tactic: r.tactic, text: r.text, uses: [] }));
  const auto = autoReply(node);
  const autoInfo =
    choosing && autoPick && auto
      ? {
          id: auto.id,
          left: Math.max(0, 1 - state.t / timing.autoPick),
          seconds: Math.max(1, Math.ceil((timing.autoPick - state.t) / speed / 1000)),
        }
      : null;

  const caption = currentCaption(state, scenario, lang, timing);
  const callState: CallState = state.phase === 'dialing' ? 'dialing' : ended ? 'ended' : running ? 'live' : 'paused';
  const facts = FACT_KEYS.flatMap((k) => (state.memory.facts[k] ? [state.memory.facts[k]!] : []));
  const fresh = new Set(state.heard?.changed ?? []);
  const status = ended
    ? T.ended
    : state.phase === 'thinking'
      ? T.thinking
      : choosing
        ? T.yourTurn
        : T.listening;
  const nextId = SCENARIO_IDS[(SCENARIO_IDS.indexOf(scenarioId) + 1) % SCENARIO_IDS.length];

  return (
    <div className="cc-mode" onKeyDown={onKeyDown}>
      <div className="demo-bar cc-bar">
        {modeSwitch}
        <span className="spacer" />
        <div className="cc-controls">
          <button
            type="button"
            className="btn btn-secondary btn-small cc-btn"
            onClick={() => (ended ? restart() : setPlaying((p) => !p))}
            aria-label={ended ? T.restart : playing ? T.pause : T.play}
          >
            {ended ? <RestartIcon /> : playing ? <PauseIcon /> : <PlayIcon />}
            <span className="cc-btn-label">{ended ? T.restart : playing ? T.pause : T.resume}</span>
          </button>
          {!ended && (
            <button type="button" className="btn btn-ghost btn-small cc-btn" onClick={() => restart()} aria-label={T.restart}>
              <RestartIcon />
              <span className="cc-btn-label">{T.restart}</span>
            </button>
          )}
          <div className="demo-seg cc-speed" role="group" aria-label={T.speed}>
            {([1, 2] as const).map((v) => (
              <button key={v} type="button" aria-pressed={speed === v} onClick={() => setSpeed(v)}>
                {v}×
              </button>
            ))}
          </div>
          <button
            type="button"
            className="demo-chip cc-autopick"
            aria-pressed={autoPick}
            title={T.autoPickTitle}
            onClick={() => setAutoPick((a) => !a)}
          >
            <span className={`led ${autoPick ? 'is-live' : 'is-off'}`} aria-hidden="true" />
            {T.autoPick}
          </button>
        </div>
      </div>

      <div className="demo-chips cc-scenarios" role="group" aria-label={T.scenarioLabel}>
        {scenariosFor(lang).map((s) => (
          <button key={s.id} type="button" className="demo-chip" aria-pressed={s.id === scenarioId} onClick={() => restart(s.id)}>
            {s.title}
          </button>
        ))}
      </div>

      <div className="cc-grid">
        <section className="demo-pane cc-call" aria-label={T.transcript}>
          <CallHead T={T} state={callState} callMs={state.callMs} />
          <WhoRow T={T} caller={scenario.caller} you={scenario.you} />
          <Waveform who={running && caption && !caption.done ? caption.who : null} />
          <Transcript
            T={T}
            turns={state.turns}
            caption={caption}
            empty={<span className={`cc-dialing${state.phase === 'dialing' ? ' is-on' : ''}`}>{T.dialing}</span>}
          />
        </section>

        <section ref={paneRef} className={`demo-pane cc-copilot${ended ? ' is-ended' : ''}`} aria-labelledby="cc-copilot-title" tabIndex={-1}>
          <header className="demo-pane-head">
            <span id="cc-copilot-title" className="cc-copilot-title">
              {T.suggest}
            </span>
            <span className="spacer" />
            <span className={`cc-status is-${state.phase}`}>{status}</span>
          </header>

          {ended ? (
            <SummaryView
              T={T}
              summary={summarize(state.memory, lang, state.agreed, scenario.kind)}
              actions={
                <>
                  <button type="button" className="btn btn-primary btn-small cc-btn" onClick={() => restart(scenarioId, { autoPick: false })}>
                    <RestartIcon />
                    {T.replay}
                  </button>
                  <button type="button" className="btn btn-secondary btn-small cc-btn" onClick={() => restart(nextId)}>
                    {T.nextCall}
                  </button>
                </>
              }
            />
          ) : (
            <>
              <HeardTags T={T} heard={state.heard} />
              <div className="cc-sug-area">
                {state.phase === 'thinking' && <ThinkingBars />}
                {(choosing || saying) && (
                  <Suggestions
                    key={state.nodeId}
                    T={T}
                    items={suggestions}
                    onPick={pick}
                    auto={autoInfo}
                    chosen={saying ? state.saying?.id ?? null : null}
                    showKeys={showKeys}
                    onFocusLost={keepFocus}
                  />
                )}
                {(state.phase === 'dialing' || state.phase === 'them') && <ThinkingBars still />}
                {choosing && (
                  <p className="cc-hint">
                    {T.tapHint}
                    {showKeys ? ` · ${T.keysHint}` : ''}
                  </p>
                )}
              </div>
              <div className="cc-facts-box">
                <span className="demo-label">{T.facts}</span>
                <FactList T={T} facts={facts} fresh={fresh} />
              </div>
            </>
          )}
        </section>
      </div>
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
