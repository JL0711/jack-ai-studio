import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { useOnScreen, useReducedMotion } from '../../lib/motion';
import { ClipCells, useClipboardSync } from './Clipboard';
import { activeRun, initialTerm, termReducer } from './commands';
import { FileCells, useFileSender } from './Files';
import { MacPairCell, PcPairCell, PcStatus } from './PairCells';
import { attemptsLeft, initialPair, pairReducer } from './pairing';
import { Terminal } from './Terminal';
import { TEXT } from './text';
import { busyTransfer, initialTransfers, transferReducer } from './transfer';
import './demo.css';

function randomDigits(): string {
  try {
    return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
  } catch {
    return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
  }
}

function randomHex(n: number): string {
  try {
    return Array.from(crypto.getRandomValues(new Uint8Array(Math.ceil(n / 2))), (b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, n);
  } catch {
    return Math.random().toString(16).slice(2, 2 + n).padEnd(n, '0');
  }
}

export default function BridgeDemo() {
  const { lang } = useI18n();
  const T = TEXT[lang];
  const reduced = useReducedMotion();
  const { ref, onScreen } = useOnScreen<HTMLDivElement>();
  const [pair, dispatchPair] = useReducer(pairReducer, undefined, () => initialPair(randomDigits()));
  const [term, dispatchTerm] = useReducer(termReducer, initialTerm);
  const [transfers, dispatchTransfer] = useReducer(transferReducer, initialTransfers);
  const [epoch, setEpoch] = useState(0);
  const [tour, setTour] = useState({ clip: false, file: false, cmd: false });

  const [live, setLive] = useState('');
  const announce = useCallback((text: string) => setLive((prev) => (prev === text ? `${text}\u00a0` : text)), []);

  const paired = pair.phase === 'paired';
  const markClip = useCallback(() => setTour((t) => (t.clip ? t : { ...t, clip: true })), []);
  const markFile = useCallback(() => setTour((t) => (t.file ? t : { ...t, file: true })), []);
  const markCmd = useCallback(() => setTour((t) => (t.cmd ? t : { ...t, cmd: true })), []);
  const clip = useClipboardSync(paired, reduced, markClip);
  const files = useFileSender(transfers, dispatchTransfer, T, announce, markFile);

  // One clock for everything that plays out over time (handshake, transfer, command output).
  // It only runs while something is in progress and the demo is on screen in a visible tab.
  const busy = pair.phase === 'connecting' || !!busyTransfer(transfers) || !!activeRun(term);
  useEffect(() => {
    if (!busy || !onScreen) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const ms = Math.min(120, now - last); // a throttled timer must not jump ahead
      last = now;
      dispatchPair({ type: 'tick', ms });
      dispatchTransfer({ type: 'tick', ms });
      dispatchTerm({ type: 'tick', ms });
    }, 40);
    return () => window.clearInterval(id);
  }, [busy, onScreen]);

  // Say when pairing finishes or fails.
  const lastPhase = useRef(pair.phase);
  useEffect(() => {
    if (lastPhase.current === 'connecting' && pair.phase === 'paired') announce(T.pairedSay(T.pc));
    if (lastPhase.current === 'connecting' && pair.phase === 'unpaired') {
      announce(pair.error === 'newCode' ? T.errNew : T.errWrong(attemptsLeft(pair)));
    }
    lastPhase.current = pair.phase;
  }, [pair, T, announce]);

  const submitCode = (entered: string) => dispatchPair({ type: 'submit', entered, token: randomHex(4), spare: randomDigits() });
  const unpair = () => {
    if (activeRun(term)) dispatchTerm({ type: 'stop' });
    const moving = busyTransfer(transfers);
    if (moving) dispatchTransfer({ type: 'failed', id: moving.id, reason: 'aborted' });
    dispatchPair({ type: 'unpair', code: randomDigits() });
    announce(T.unpairedSay);
  };
  const reset = () => {
    dispatchPair({ type: 'reset', code: randomDigits() });
    dispatchTerm({ type: 'reset' });
    dispatchTransfer({ type: 'reset' });
    clip.reset();
    files.reset();
    setTour({ clip: false, file: false, cmd: false });
    setEpoch((e) => e + 1);
    announce(T.resetDone);
  };

  const steps = [paired, tour.clip, tour.file, tour.cmd];
  const run = activeRun(term);

  return (
    <div ref={ref} className="demo mb">
      <div className="mb-top">
        <span className={`mb-state is-${pair.phase}`}>
          <span className={`led ${paired ? 'is-live' : pair.phase === 'connecting' ? 'is-wip' : 'is-off'}`} aria-hidden="true" />
          {T.status[pair.phase]}
        </span>
        <span className="mb-top-title">
          {T.mac} ↔ {T.pc} <span className="mb-top-sub">· {T.lan}</span>
        </span>
        <span className="spacer" />
        <button type="button" className="btn btn-ghost btn-small" onClick={reset}>
          {T.reset}
        </button>
      </div>
      <p className="mb-sim">{T.simNote}</p>
      <ol className="mb-tour" aria-label={T.tourLabel}>
        {T.tour.map((label, i) => (
          <li key={label} className={steps[i] ? 'is-done' : ''}>
            <span className="mb-tour-n" aria-hidden="true">
              {steps[i] ? '✓' : i + 1}
            </span>
            {label}
            {steps[i] && <span className="visually-hidden"> ✓</span>}
          </li>
        ))}
      </ol>

      <div key={epoch} className="mb-body">
        <div className="mb-rig">
          <div className="mb-frame is-mac" aria-hidden="true" />
          <div className="mb-frame is-pc" aria-hidden="true" />
          <div className="mb-devhead is-mac">
            <span className={`led ${paired ? 'is-live' : 'is-off'}`} aria-hidden="true" />
            <span className="mb-devname">{T.mac}</span>
            <span className="mb-devsub">{T.macHost}</span>
          </div>
          <div className="mb-devhead is-pc">
            <span className={`led ${paired ? 'is-live' : 'is-off'}`} aria-hidden="true" />
            <span className="mb-devname">{T.pc}</span>
            <span className="mb-devsub is-gpu">{T.gpu}</span>
            <PcStatus T={T} run={run} />
          </div>

          <MacPairCell T={T} pair={pair} reduced={reduced} onSubmit={submitCode} onUnpair={unpair} />
          <div className={`mb-lane mb-row-pair${pair.phase === 'connecting' ? ' is-busy' : ''}`} data-dir="both" aria-hidden="true">
            <span className="mb-wire">
              <i className="mb-packet" />
              <i className="mb-packet is-back" />
            </span>
          </div>
          <PcPairCell T={T} pair={pair} />

          <ClipCells T={T} paired={paired} clip={clip} />
          <FileCells T={T} paired={paired} transfers={transfers} files={files} />
        </div>

        <Terminal
          T={T}
          lang={lang}
          paired={paired}
          term={term}
          dispatch={dispatchTerm}
          announce={announce}
          onFinished={markCmd}
        />
      </div>

      <p className="visually-hidden" aria-live="polite">
        {live}
      </p>
    </div>
  );
}
