import { useCallback, useEffect, useId, useRef, useState, type Dispatch, type DragEvent } from 'react';
import { formatBytes, readFileBytes } from '../../lib/files/download';
import { CONFIG_YAML, type BridgeText } from './text';
import {
  CHUNK_SIZE,
  MAX_FILE,
  SAMPLE_WEIGHTS_SIZE,
  busyTransfer,
  bytesDone,
  canHash,
  chunksDone,
  isVerified,
  planChunks,
  pseudoRandomBytes,
  reassemble,
  sha256Hex,
  sliceChunks,
  type SampleId,
  type Transfer,
  type TransferAction,
  type TransferState,
} from './transfer';

type FileError = 'tooBig' | 'readFail' | 'noCrypto' | null;

export interface FileSender {
  sendSample: (id: SampleId) => void;
  sendOwn: (file: File) => void;
  error: FileError;
  reset: () => void;
}

const SAMPLE_IDS: SampleId[] = ['config', 'notes', 'weights'];

function sampleBytes(id: SampleId, T: BridgeText): Uint8Array {
  if (id === 'config') return new TextEncoder().encode(CONFIG_YAML);
  if (id === 'notes') return new TextEncoder().encode(T.notesContent);
  return pseudoRandomBytes(SAMPLE_WEIGHTS_SIZE);
}

function sampleSize(id: SampleId, T: BridgeText): number {
  return id === 'weights' ? SAMPLE_WEIGHTS_SIZE : sampleBytes(id, T).length;
}

/**
 * Sends a file across the simulated link: hash it on the "Mac", step through its
 * chunks, rebuild it from the chunks on the "PC" and hash it again. The bytes stay
 * in this page and are dropped once verified.
 */
export function useFileSender(
  transfers: TransferState,
  dispatch: Dispatch<TransferAction>,
  T: BridgeText,
  announce: (text: string) => void,
  onDone: () => void,
): FileSender {
  const [error, setError] = useState<FileError>(null);
  const bytes = useRef(new Map<number, Uint8Array>());
  // Set synchronously, so two quick clicks can't start two transfers before a re-render.
  const starting = useRef(false);
  const busy = !!busyTransfer(transfers);

  const send = useCallback(
    async (name: string, size: number, own: boolean, read: () => Promise<Uint8Array>) => {
      if (busy || starting.current) return;
      if (!canHash()) {
        setError('noCrypto');
        return;
      }
      if (size > MAX_FILE) {
        setError('tooBig');
        return;
      }
      setError(null);
      const id = transfers.nextId;
      starting.current = true;
      dispatch({ type: 'start', name, size, own });
      try {
        const data = await read();
        const sha = await sha256Hex(data);
        bytes.current.set(id, data);
        dispatch({ type: 'hashed', id, sha });
      } catch {
        dispatch({ type: 'failed', id, reason: 'read' });
        setError('readFail');
      } finally {
        starting.current = false;
      }
    },
    [busy, transfers.nextId, dispatch],
  );

  // Drop the bytes of a transfer that failed or was cut off.
  useEffect(() => {
    for (const t of transfers.items) if (t.status === 'failed') bytes.current.delete(t.id);
  }, [transfers.items]);

  // The receiving side: once every chunk has "arrived", rebuild the file and check it.
  const verifying = transfers.items.find((t) => t.status === 'verifying');
  useEffect(() => {
    if (!verifying) return;
    const data = bytes.current.get(verifying.id);
    if (!data) return;
    let cancelled = false;
    (async () => {
      const received = reassemble(sliceChunks(data, planChunks(data.length)), data.length);
      const sha = await sha256Hex(received);
      if (cancelled) return;
      bytes.current.delete(verifying.id);
      dispatch({ type: 'verified', id: verifying.id, sha });
      announce(T.receivedSay(verifying.name));
      onDone();
    })();
    return () => {
      cancelled = true;
    };
    // Runs once per transfer reaching this stage (keyed on its id).
  }, [verifying?.id]);

  return {
    sendSample: (id) => {
      const name = T.sampleFiles[id].name;
      void send(name, sampleSize(id, T), false, async () => sampleBytes(id, T));
    },
    sendOwn: (file) => void send(file.name, file.size, true, () => readFileBytes(file)),
    error,
    reset: () => {
      bytes.current.clear();
      starting.current = false;
      setError(null);
    },
  };
}

function shortHash(hex: string | undefined): string {
  return hex ? `${hex.slice(0, 10)}…${hex.slice(-8)}` : '';
}

function Progress({ T, t }: { T: BridgeText; t: Transfer }) {
  const plan = planChunks(t.size);
  const done = t.status === 'sending' ? chunksDone(plan.length, t.elapsed, t.duration) : t.status === 'hashing' ? 0 : plan.length;
  const pct = t.size === 0 ? (done ? 100 : 0) : Math.round((bytesDone(plan, done) / t.size) * 100);
  const label =
    t.status === 'hashing'
      ? T.hashing
      : t.status === 'sending'
        ? T.sending(Math.min(plan.length, done + 1), plan.length)
        : t.status === 'verifying'
          ? T.verifying
          : t.status === 'done'
            ? T.sentOk(t.name)
            : t.reason === 'aborted'
              ? T.aborted
              : T.readFail;
  return (
    <div className={`mb-xfer is-${t.status}`}>
      <p className="mb-xfer-name">
        <b>{t.name}</b> <span>{formatBytes(t.size)}</span>
      </p>
      <div className="progress" aria-hidden="true">
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="progress-value">{pct}%</span>
      </div>
      <p className="mb-xfer-state" role="status">
        {label}
      </p>
      {t.macSha && (
        <p className="mb-sha">
          SHA-256 <code title={t.macSha}>{shortHash(t.macSha)}</code>
        </p>
      )}
    </div>
  );
}

export function FileCells({ T, paired, transfers, files }: { T: BridgeText; paired: boolean; transfers: TransferState; files: FileSender }) {
  const id = useId();
  const [over, setOver] = useState(false);
  const busy = busyTransfer(transfers);
  const current = busy ?? transfers.items[transfers.items.length - 1];
  const received = transfers.items.filter((t) => t.status === 'done').reverse();
  const disabled = !paired || !!busy;
  const sending = busy?.status === 'sending';

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && !disabled) files.sendOwn(file);
  };

  const errorText = files.error === 'tooBig' ? T.tooBig : files.error === 'readFail' ? T.readFail : files.error === 'noCrypto' ? T.noCrypto : '';

  return (
    <>
      <section className="mb-cell is-mac mb-row-file" aria-labelledby={`${id}-mac`}>
        <p className="mb-cell-head" id={`${id}-mac`}>
          <span className="mb-dev-tag">{T.mac}</span>
          {T.filesTitle}
        </p>
        <p className="mb-label">{T.samplesLabel}</p>
        <div className="demo-chips mb-file-chips">
          {SAMPLE_IDS.map((sid) => (
            <button key={sid} type="button" className="demo-chip" disabled={disabled} onClick={() => files.sendSample(sid)}>
              <FileIcon />
              {T.sampleFiles[sid].name}
              <span className="mb-chip-size">{formatBytes(sampleSize(sid, T))}</span>
            </button>
          ))}
        </div>
        <label
          className={`demo-drop mb-drop${over ? ' is-over' : ''}${disabled ? ' is-disabled' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          <input
            type="file"
            disabled={disabled}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && !disabled) files.sendOwn(file);
              e.target.value = '';
            }}
          />
          <span className="mb-drop-title">{T.dropTitle}</span>
          <span className="btn btn-secondary btn-small mb-drop-btn" aria-hidden="true">
            {T.dropButton}
          </span>
          <span className="mb-drop-hint">{paired ? T.dropHint : T.pairFirst}</span>
        </label>
        {errorText && (
          <p className="error-text" role="alert">
            {errorText}
          </p>
        )}
        {current && <Progress T={T} t={current} />}
      </section>

      <div className={`mb-lane mb-row-file${sending ? ' is-stream' : ''}`} data-dir="right" aria-hidden="true">
        <span className="mb-wire">
          <i className="mb-packet" />
          <i className="mb-packet is-2" />
          <i className="mb-packet is-3" />
        </span>
      </div>

      <section className="mb-cell is-pc mb-row-file" aria-labelledby={`${id}-pc`}>
        <p className="mb-cell-head" id={`${id}-pc`}>
          <span className="mb-dev-tag">{T.pc}</span>
          {T.downloads}
          <span className="mb-path">C:\Users\demo\Downloads</span>
        </p>
        {received.length === 0 ? (
          <p className="mb-empty">{T.downloadsEmpty}</p>
        ) : (
          <ul className="mb-downloads">
            {received.map((t, i) => {
              const ok = isVerified(t);
              return (
                <li key={t.id} className={i === 0 ? 'is-new' : undefined}>
                  <p className="mb-dl-name">
                    <FileIcon />
                    <b>{t.name}</b>
                    <span className="mb-dl-tag">{t.own ? T.yours : T.sample}</span>
                  </p>
                  <p className="mb-dl-meta">
                    {formatBytes(t.size)} · {T.chunksOf(t.chunks, formatBytes(CHUNK_SIZE))}
                  </p>
                  <p className={`mb-dl-check ${ok ? 'is-ok' : 'is-bad'}`}>
                    <span aria-hidden="true">{ok ? '✓' : '✕'}</span> {ok ? T.verified : T.mismatch}
                  </p>
                  <dl className="mb-dl-sha">
                    <div>
                      <dt>{T.shaMac}</dt>
                      <dd>
                        <code title={t.macSha}>{shortHash(t.macSha)}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>{T.shaPc}</dt>
                      <dd>
                        <code title={t.pcSha}>{shortHash(t.pcSha)}</code>
                      </dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function FileIcon() {
  return (
    <svg className="mb-file-icon" width="12" height="14" viewBox="0 0 12 14" aria-hidden="true" focusable="false">
      <path d="M1 1h6l4 4v8H1z" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 1v4h4" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
