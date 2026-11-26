import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { PC_HOST, PC_IP, type Run } from './commands';
import { attemptsLeft, cleanCode, handshake, type PairState, type PairStep } from './pairing';
import type { BridgeText } from './text';

export function fingerprint(token: string | null): string {
  return token ? `tk_••••${token}` : '';
}

function stepText(T: BridgeText, step: PairStep, state: 'active' | 'ok' | 'failed', token: string | null): string {
  const s = T.steps[step];
  if (state === 'active') return s.active;
  if (step === 'discover') return T.steps.discover.ok(PC_HOST, PC_IP);
  if (step === 'verify') return state === 'failed' ? T.steps.verify.failed : T.steps.verify.ok;
  if (step === 'token') return T.steps.token.ok(fingerprint(token));
  return T.steps.paired.ok;
}

const FAILED_LED = { '--led': 'var(--danger)' } as CSSProperties;

export function MacPairCell({
  T,
  pair,
  reduced,
  onSubmit,
  onUnpair,
}: {
  T: BridgeText;
  pair: PairState;
  reduced: boolean;
  onSubmit: (code: string) => void;
  onUnpair: () => void;
}) {
  const id = useId();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const typing = useRef<number[]>([]);
  const stopTyping = () => {
    typing.current.forEach(window.clearTimeout);
    typing.current = [];
  };
  useEffect(() => stopTyping, []);

  // After a failed attempt, put the cursor back in the field (a new code clears it).
  useEffect(() => {
    if (pair.phase !== 'unpaired' || !pair.error || pair.error === 'format') return;
    if (pair.error === 'newCode') setValue('');
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, [pair.tries, pair.error, pair.phase]);

  // Unpairing starts over with an empty field.
  useEffect(() => {
    if (pair.phase === 'unpaired' && pair.tries > 0 && !pair.error && pair.done === 0) setValue('');
  }, [pair.phase, pair.tries, pair.error, pair.done]);

  const fill = () => {
    stopTyping();
    if (reduced) {
      setValue(pair.code);
      return;
    }
    setValue('');
    Array.from(pair.code).forEach((_, i) => {
      typing.current.push(window.setTimeout(() => setValue(pair.code.slice(0, i + 1)), 65 * (i + 1)));
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    stopTyping();
    onSubmit(value);
  };

  const lines = handshake(pair);
  const busy = pair.phase === 'connecting';
  const errorText =
    pair.phase !== 'unpaired' || !pair.error
      ? ''
      : pair.error === 'format'
        ? T.errFormat
        : pair.error === 'newCode'
          ? T.errNew
          : T.errWrong(attemptsLeft(pair));

  return (
    <section className="mb-cell is-mac mb-row-pair" aria-labelledby={`${id}-h`}>
      <p className="mb-cell-head" id={`${id}-h`}>
        <span className="mb-dev-tag">{T.mac}</span>
        {T.pairTitle}
      </p>
      {pair.phase === 'paired' ? (
        <div className="mb-paired">
          <p className="mb-paired-line">
            <span className="led is-live" aria-hidden="true" />
            {T.connected(PC_HOST, PC_IP)}
          </p>
          <p className="mb-token">
            {T.tokenLabel} <code>{fingerprint(pair.token)}</code>
          </p>
          <button type="button" className="btn btn-secondary btn-small" onClick={onUnpair}>
            {T.unpair}
          </button>
        </div>
      ) : (
        <form className="mb-pair-form" onSubmit={submit} noValidate>
          <label htmlFor={`${id}-code`} className="mb-label">
            {T.enterLabel}
          </label>
          <div className="mb-pair-row">
            <input
              ref={inputRef}
              id={`${id}-code`}
              className="input mb-code-input"
              value={value}
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              maxLength={7}
              placeholder="000000"
              disabled={busy}
              aria-invalid={errorText ? true : undefined}
              aria-describedby={errorText ? `${id}-err` : undefined}
              onChange={(e) => {
                stopTyping();
                setValue(cleanCode(e.target.value));
              }}
            />
            <button type="submit" className="btn btn-primary btn-small" disabled={busy}>
              {T.pair}
            </button>
            <button type="button" className="btn btn-secondary btn-small" onClick={fill} disabled={busy}>
              {T.fill}
            </button>
          </div>
          {errorText && (
            <p id={`${id}-err`} className="error-text mb-pair-err">
              {errorText}
            </p>
          )}
        </form>
      )}
      {lines.length > 0 && (
        <ol className="mb-hs">
          {lines.map(({ step, state }) => (
            <li key={`${pair.tries}-${step}`} className={`is-${state}`}>
              <span
                className={`led${state === 'ok' ? ' is-live' : state === 'active' ? ' is-wip' : ''}`}
                style={state === 'failed' ? FAILED_LED : undefined}
                aria-hidden="true"
              />
              <span>{stepText(T, step, state, pair.token)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function PcPairCell({ T, pair }: { T: BridgeText; pair: PairState }) {
  const id = useId();
  const digits = `${pair.code.slice(0, 3)} ${pair.code.slice(3)}`;
  return (
    <section className="mb-cell is-pc mb-row-pair" aria-labelledby={`${id}-h`}>
      <p className="mb-cell-head" id={`${id}-h`}>
        <span className="mb-dev-tag">{T.pc}</span>
        {T.pairTitle}
      </p>
      {pair.phase === 'paired' ? (
        <div className="mb-paired">
          <p className="mb-paired-line">
            <span className="led is-live" aria-hidden="true" />
            {T.pcPaired(T.macHost)}
          </p>
          <p className="mb-token">
            {T.tokenLabel} <code>{fingerprint(pair.token)}</code>
          </p>
        </div>
      ) : (
        <div className="mb-code-box">
          <span className="mb-label">{T.codeLabel}</span>
          {/* keyed by code: a new code flashes in */}
          <span key={pair.code} className="mb-seg" role="img" aria-label={`${T.codeLabel}: ${Array.from(pair.code).join(' ')}`}>
            <span className="mb-seg-ghost" aria-hidden="true">
              888 888
            </span>
            <span className="mb-seg-lit" aria-hidden="true">
              {digits}
            </span>
          </span>
          <span className="mb-code-hint">{pair.error === 'newCode' ? T.codeNew : pair.phase === 'connecting' ? T.steps.verify.active : T.codeHint}</span>
        </div>
      )}
    </section>
  );
}

export function PcStatus({ T, run }: { T: BridgeText; run: Run | undefined }) {
  return (
    <span className={`mb-proc${run ? ' is-busy' : ''}`}>
      <span className="visually-hidden">{T.pcProcess}: </span>
      {run ? T.pcRunning(run.input) : T.pcIdle}
    </span>
  );
}
