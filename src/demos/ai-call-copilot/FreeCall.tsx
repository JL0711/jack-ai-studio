// "Type it yourself": the visitor types what the other side said, and the
// rule-based copilot answers, remembering facts from earlier lines.

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { CallHead, FactList, HeardTags, Suggestions, SummaryView, ThinkingBars, Transcript, Waveform } from './parts';
import { RestartIcon } from './ScriptCall';
import { agreedFromTurns, emptyMemory, hear, respond, summarize } from './suggest';
import { bare, fill, type DemoText } from './text';
import { FACT_KEYS, type CallSummary, type Heard, type Lang, type Memory, type Suggestion, type Turn } from './types';

interface Props {
  lang: Lang;
  T: DemoText;
  modeSwitch: ReactNode;
  onScreen: boolean;
  reduced: boolean;
  showKeys: boolean;
}

const MAX_LEN = 200;

export function FreeCall({ lang, T, modeSwitch, onScreen, reduced, showKeys }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [memory, setMemory] = useState<Memory>(emptyMemory);
  const memoryRef = useRef<Memory>(memory);
  const [heard, setHeard] = useState<Heard | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState('');
  const [summary, setSummary] = useState<CallSummary | null>(null);
  const [callMs, setCallMs] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  const pending = useRef<number>();

  const started = turns.length > 0;
  // The call timer runs from the first line, while the demo is on screen.
  useEffect(() => {
    if (!started || summary || !onScreen) return;
    const id = window.setInterval(() => setCallMs((ms) => ms + 1000), 1000);
    return () => window.clearInterval(id);
  }, [started, summary, onScreen]);

  useEffect(() => () => window.clearTimeout(pending.current), []);

  const setMem = (m: Memory) => {
    memoryRef.current = m;
    setMemory(m);
  };

  const send = (raw: string) => {
    const line = raw.trim().slice(0, MAX_LEN);
    if (!line) return;
    const r = respond(memoryRef.current, line, lang);
    // Remember at once (a quick second line builds on this one), show with the suggestions.
    memoryRef.current = r.memory;
    setTurns((t) => [...t, { who: 'them', text: line, entities: r.heard.entities }]);
    setDraft('');
    setSummary(null);
    setSuggestions([]);
    window.clearTimeout(pending.current);
    const show = () => {
      setMemory(r.memory);
      setHeard(r.heard);
      setSuggestions(r.suggestions);
      setThinking(false);
      setAnnouncement(fill(T.announce, { who: T.them, line: bare(line), n: r.suggestions.length }));
    };
    // A short pause reads as "thinking"; with reduced motion the answer is just there.
    if (reduced) show();
    else {
      setThinking(true);
      pending.current = window.setTimeout(show, 550);
    }
  };

  const pick = (id: string) => {
    const s = suggestions.find((x) => x.id === id);
    if (!s) return;
    const h = hear(memoryRef.current, s.text, 'you', lang);
    setMem(h.memory);
    setTurns((t) => [...t, { who: 'you', text: s.text, entities: h.heard.entities, tactic: s.tactic }]);
    setSuggestions([]);
    inputRef.current?.focus({ preventScroll: true });
  };

  const reset = () => {
    window.clearTimeout(pending.current);
    setTurns([]);
    setMem(emptyMemory());
    setHeard(null);
    setSuggestions([]);
    setThinking(false);
    setSummary(null);
    setCallMs(0);
    setDraft('');
  };

  const keepFocus = useCallback(() => paneRef.current?.focus({ preventScroll: true }), []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(draft);
  };

  const onPaneKey = (e: KeyboardEvent<HTMLElement>) => {
    if (!suggestions.length || e.altKey || e.ctrlKey || e.metaKey) return;
    if ((e.target as HTMLElement).closest('input, textarea, select')) return;
    const s = suggestions[Number(e.key) - 1];
    if (s) {
      e.preventDefault();
      pick(s.id);
    }
  };

  const facts = FACT_KEYS.flatMap((k) => (memory.facts[k] ? [memory.facts[k]!] : []));
  const fresh = new Set(heard?.changed ?? []);
  const status = summary ? T.ended : thinking ? T.thinking : suggestions.length ? T.yourTurn : T.listening;
  const lastThem = [...turns].reverse().find((t) => t.who === 'them');

  return (
    <div className="cc-mode">
      <div className="demo-bar cc-bar">
        {modeSwitch}
        <span className="spacer" />
        <button type="button" className="btn btn-ghost btn-small cc-btn" onClick={reset} disabled={!started}>
          <RestartIcon />
          {T.startOver}
        </button>
      </div>

      <div className="cc-grid">
        <section className="demo-pane cc-call" aria-label={T.transcript}>
          <CallHead T={T} state={summary ? 'ended' : started ? (onScreen ? 'live' : 'paused') : 'dialing'} callMs={callMs} />
          <Waveform who={thinking ? 'them' : null} />
          <Transcript T={T} turns={turns} caption={null} empty={<span className="cc-free-empty">{T.freeTitle}</span>} />
          <form className="cc-free" onSubmit={onSubmit}>
            <label className="visually-hidden" htmlFor="cc-free-input">
              {T.freeLabel}
            </label>
            <div className="cc-free-row">
              <span className="cc-who" aria-hidden="true">
                {T.them}
              </span>
              <input
                id="cc-free-input"
                ref={inputRef}
                className="input"
                type="text"
                value={draft}
                maxLength={MAX_LEN}
                placeholder={T.freePlaceholder}
                autoComplete="off"
                enterKeyHint="send"
                onChange={(e) => setDraft(e.target.value)}
              />
              <button type="submit" className="btn btn-primary btn-small cc-btn" disabled={!draft.trim()}>
                {T.send}
              </button>
            </div>
            <div className="cc-examples">
              <span className="demo-label">{T.examples}</span>
              <div className="demo-chips">
                {T.examplesList.map((ex) => (
                  <button key={ex} type="button" className="demo-chip" onClick={() => send(ex)}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </form>
        </section>

        <section
          ref={paneRef}
          className={`demo-pane cc-copilot${summary ? ' is-ended' : ''}`}
          aria-labelledby="cc-copilot-title-free"
          tabIndex={-1}
          onKeyDown={onPaneKey}
        >
          <header className="demo-pane-head">
            <span id="cc-copilot-title-free" className="cc-copilot-title">
              {T.suggest}
            </span>
            <span className="spacer" />
            <span className={`cc-status${thinking ? ' is-thinking' : suggestions.length ? ' is-choose' : ''}`}>{status}</span>
          </header>

          {summary ? (
            <SummaryView
              T={T}
              summary={summary}
              actions={
                <>
                  <button
                    type="button"
                    className="btn btn-primary btn-small cc-btn"
                    onClick={() => {
                      setSummary(null);
                      inputRef.current?.focus({ preventScroll: true });
                    }}
                  >
                    {T.keepTalking}
                  </button>
                  <button type="button" className="btn btn-secondary btn-small cc-btn" onClick={reset}>
                    <RestartIcon />
                    {T.startOver}
                  </button>
                </>
              }
            />
          ) : (
            <>
              <HeardTags T={T} heard={heard} />
              <div className="cc-sug-area">
                {thinking && <ThinkingBars />}
                {!thinking && suggestions.length > 0 && (
                  <Suggestions key={lastThem?.text ?? ''} T={T} items={suggestions} onPick={pick} showKeys={showKeys} onFocusLost={keepFocus} />
                )}
                {!thinking && !suggestions.length && <div className="cc-idle">{started ? T.listening : T.freeEmpty}</div>}
                {!thinking && suggestions.length > 0 && <p className="cc-hint">{T.tapHint}</p>}
              </div>
              <div className="cc-facts-box">
                <span className="demo-label">{T.facts}</span>
                <FactList T={T} facts={facts} fresh={fresh} />
              </div>
              {started && (
                <div className="cc-end-row">
                  <button
                    type="button"
                    className="btn btn-secondary btn-small cc-btn"
                    onClick={() => {
                      // Focus stays in the pane, so the summary can take it when it appears.
                      keepFocus();
                      setSummary(summarize(memoryRef.current, lang, agreedFromTurns(turns, lang), 'sales'));
                      setAnnouncement(T.announceEnd);
                    }}
                  >
                    {T.endCall}
                  </button>
                </div>
              )}
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
