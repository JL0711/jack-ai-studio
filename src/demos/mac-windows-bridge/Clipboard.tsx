import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { BridgeText } from './text';
import { utf8Bytes } from './transfer';

type Side = 'mac' | 'pc';

export interface ClipSync {
  mac: string;
  pc: string;
  status: { from: Side; phase: 'syncing' | 'done'; bytes: number; n: number } | null;
  edit: (side: Side, text: string, now?: boolean) => void;
  reset: () => void;
}

/** Two clipboards kept in sync: an edit settles for a moment, then travels to the other side. */
export function useClipboardSync(paired: boolean, reduced: boolean, onSynced: () => void): ClipSync {
  const [mac, setMac] = useState('');
  const [pc, setPc] = useState('');
  const [status, setStatus] = useState<ClipSync['status']>(null);
  const timers = useRef<number[]>([]);
  const count = useRef(0);
  const synced = useRef(onSynced);
  synced.current = onSynced;

  const clear = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
  };
  useEffect(() => clear, []);

  const edit = useCallback(
    (side: Side, text: string, now = false) => {
      (side === 'mac' ? setMac : setPc)(text);
      if (!paired) return;
      clear(); // the latest edit wins
      const send = () => {
        const n = ++count.current;
        const bytes = utf8Bytes(text);
        setStatus({ from: side, phase: 'syncing', bytes, n });
        timers.current.push(
          window.setTimeout(
            () => {
              (side === 'mac' ? setPc : setMac)(text);
              setStatus({ from: side, phase: 'done', bytes, n });
              synced.current();
            },
            reduced ? 0 : 450,
          ),
        );
      };
      if (now) send();
      else timers.current.push(window.setTimeout(send, 380));
    },
    [paired, reduced],
  );

  const reset = useCallback(() => {
    clear();
    setMac('');
    setPc('');
    setStatus(null);
  }, []);

  return { mac, pc, status, edit, reset };
}

export function ClipCells({ T, paired, clip }: { T: BridgeText; paired: boolean; clip: ClipSync }) {
  const id = useId();
  const { status } = clip;
  const dir = status?.from === 'pc' ? 'left' : 'right';

  const cell = (side: Side) => {
    const value = side === 'mac' ? clip.mac : clip.pc;
    const other = side === 'mac' ? T.pc : T.mac;
    const mine = status && status.from === side;
    const received = status && status.from !== side && status.phase === 'done';
    return (
      <section className={`mb-cell is-${side} mb-row-clip${received ? ' is-received' : ''}`} aria-labelledby={`${id}-${side}`}>
        <p className="mb-cell-head" id={`${id}-${side}`}>
          <span className="mb-dev-tag">{side === 'mac' ? T.mac : T.pc}</span>
          {side === 'mac' ? T.clipMac : T.clipPc}
        </p>
        <label htmlFor={`${id}-${side}-t`} className="visually-hidden">
          {side === 'mac' ? T.clipMac : T.clipPc}
        </label>
        <div className="mb-clip-wrap">
          <textarea
            id={`${id}-${side}-t`}
            className="textarea mb-clip"
            value={value}
            disabled={!paired}
            placeholder={paired ? (side === 'mac' ? T.clipMacHint : T.clipPcHint) : T.pairFirst}
            spellCheck={false}
            onChange={(e) => clip.edit(side, e.target.value)}
          />
          {/* a separate element flashes on arrival, so the textarea itself never remounts */}
          {received && <span key={status?.n} className="mb-clip-flash" aria-hidden="true" />}
        </div>
        {side === 'mac' && (
          <div className="mb-samples">
            <span className="mb-label">{T.tryLabel}</span>
            {T.clipSamples.map((s) => (
              <button key={s} type="button" className="demo-chip" disabled={!paired} onClick={() => clip.edit('mac', s, true)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <p className="mb-clip-status" role="status">
          {mine && status
            ? status.phase === 'syncing'
              ? T.syncing
              : T.syncedTo(other, status.bytes)
            : ''}
        </p>
      </section>
    );
  };

  return (
    <>
      {cell('mac')}
      <div
        key={status ? `${status.n}-${status.phase}` : 'idle'}
        className={`mb-lane mb-row-clip${status?.phase === 'syncing' ? ' is-pulse' : ''}`}
        data-dir={dir}
        aria-hidden="true"
      >
        <span className="mb-wire">
          <i className="mb-packet" />
        </span>
      </div>
      {cell('pc')}
    </>
  );
}
