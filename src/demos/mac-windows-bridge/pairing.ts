// LAN pairing for the bridge simulation: the PC shows a 6-digit code, the Mac
// sends what the visitor typed, and a short handshake runs (find the PC on the
// LAN → check the code → exchange a token → paired). Time-driven by `tick` so
// it pauses with the page. Random values come in with the actions (pure reducer).

export type PairPhase = 'unpaired' | 'connecting' | 'paired';
export type PairStep = 'discover' | 'verify' | 'token' | 'paired';
export const PAIR_STEPS: readonly PairStep[] = ['discover', 'verify', 'token', 'paired'];

/** How long each handshake step takes on screen (ms). */
export const STEP_MS: Readonly<Record<PairStep, number>> = { discover: 850, verify: 600, token: 700, paired: 250 };

/** Wrong codes allowed before the PC switches to a new one. */
export const MAX_ATTEMPTS = 3;

export type PairError = 'format' | 'wrong' | 'newCode';

export interface PairState {
  phase: PairPhase;
  /** The code on the PC's screen. */
  code: string;
  /** What the Mac sent in the current (or last) attempt. */
  entered: string;
  /** Handshake steps finished in the current (or last) attempt. */
  done: number;
  stepElapsed: number;
  failedAt: PairStep | null;
  error: PairError | null;
  /** Wrong codes so far for the current code. */
  attempts: number;
  /** Token fingerprint once paired. */
  token: string | null;
  /** Prepared for this attempt: the token to issue, and the code to switch to after too many misses. */
  pendingToken: string;
  spare: string;
  /** Counts attempts, so the UI can replay the log animation. */
  tries: number;
}

export type PairAction =
  | { type: 'submit'; entered: string; token: string; spare: string }
  | { type: 'tick'; ms: number }
  | { type: 'unpair'; code: string }
  | { type: 'reset'; code: string };

export function initialPair(code: string): PairState {
  return {
    phase: 'unpaired',
    code,
    entered: '',
    done: 0,
    stepElapsed: 0,
    failedAt: null,
    error: null,
    attempts: 0,
    token: null,
    pendingToken: '',
    spare: '',
    tries: 0,
  };
}

export function isCode(text: string): boolean {
  return /^\d{6}$/.test(text);
}

/** Keeps digits only (spaces and dashes people type are dropped), at most 6. */
export function cleanCode(text: string): string {
  return text.replace(/\D/g, '').slice(0, 6);
}

function finishStep(s: PairState): PairState {
  const step = PAIR_STEPS[s.done];
  if (step === 'verify' && s.entered !== s.code) {
    const attempts = s.attempts + 1;
    const fresh = attempts >= MAX_ATTEMPTS;
    return {
      ...s,
      phase: 'unpaired',
      failedAt: 'verify',
      error: fresh ? 'newCode' : 'wrong',
      attempts: fresh ? 0 : attempts,
      code: fresh ? s.spare : s.code,
      stepElapsed: 0,
    };
  }
  const done = s.done + 1;
  if (step === 'token') return { ...s, done, token: s.pendingToken };
  if (step === 'paired') return { ...s, done, phase: 'paired', attempts: 0, stepElapsed: 0 };
  return { ...s, done };
}

export function pairReducer(state: PairState, action: PairAction): PairState {
  switch (action.type) {
    case 'submit': {
      if (state.phase !== 'unpaired') return state;
      const entered = cleanCode(action.entered);
      if (!isCode(entered)) return { ...state, error: 'format', failedAt: null, done: 0, entered };
      return {
        ...state,
        phase: 'connecting',
        entered,
        done: 0,
        stepElapsed: 0,
        failedAt: null,
        error: null,
        token: null,
        pendingToken: action.token,
        // never "switch" to the code that is already on screen
        spare: action.spare === state.code ? String((Number(action.spare) + 1) % 1_000_000).padStart(6, '0') : action.spare,
        tries: state.tries + 1,
      };
    }
    case 'tick': {
      if (state.phase !== 'connecting' || action.ms <= 0) return state;
      let s: PairState = { ...state, stepElapsed: state.stepElapsed + action.ms };
      while (s.phase === 'connecting' && s.stepElapsed >= STEP_MS[PAIR_STEPS[s.done]]) {
        const used = STEP_MS[PAIR_STEPS[s.done]];
        s = finishStep({ ...s, stepElapsed: s.stepElapsed - used });
      }
      return s;
    }
    case 'unpair':
    case 'reset':
      return { ...initialPair(action.code), tries: state.tries };
  }
}

export type LineState = 'active' | 'ok' | 'failed';

/** The handshake log of the current (or last) attempt. */
export function handshake(state: PairState): { step: PairStep; state: LineState }[] {
  if (state.tries === 0 || state.error === 'format') return [];
  const lines: { step: PairStep; state: LineState }[] = [];
  for (let i = 0; i < PAIR_STEPS.length; i++) {
    const step = PAIR_STEPS[i];
    if (i < state.done) lines.push({ step, state: 'ok' });
    else if (state.failedAt === step) {
      lines.push({ step, state: 'failed' });
      break;
    } else if (state.phase === 'connecting' && i === state.done) {
      lines.push({ step, state: 'active' });
      break;
    } else break;
  }
  return lines;
}

export function attemptsLeft(state: PairState): number {
  return MAX_ATTEMPTS - state.attempts;
}
