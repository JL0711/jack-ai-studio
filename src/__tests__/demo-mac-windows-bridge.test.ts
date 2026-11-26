import { describe, expect, it } from 'vitest';
import {
  COMMANDS,
  CTRL_C_EXIT,
  MAX_HISTORY,
  activeRun,
  buildScript,
  findCommand,
  formatExit,
  historyStep,
  initialTerm,
  linesAt,
  palette,
  termReducer,
  viewRun,
  type CommandId,
  type TermAction,
  type TermState,
} from '../demos/mac-windows-bridge/commands';
import {
  MAX_ATTEMPTS,
  PAIR_STEPS,
  STEP_MS,
  attemptsLeft,
  cleanCode,
  handshake,
  initialPair,
  pairReducer,
  type PairAction,
  type PairState,
} from '../demos/mac-windows-bridge/pairing';
import { TEXT } from '../demos/mac-windows-bridge/text';
import {
  CHUNK_SIZE,
  busyTransfer,
  bytesDone,
  chunksDone,
  initialTransfers,
  isVerified,
  planChunks,
  pseudoRandomBytes,
  reassemble,
  sha256Hex,
  sliceChunks,
  transferMs,
  transferReducer,
  utf8Bytes,
} from '../demos/mac-windows-bridge/transfer';

// ───────────── pairing ─────────────

const pair = (state: PairState, ...actions: PairAction[]) => actions.reduce(pairReducer, state);
const submit = (entered: string): PairAction => ({ type: 'submit', entered, token: 'beef', spare: '222222' });
const HANDSHAKE_MS = PAIR_STEPS.reduce((n, s) => n + STEP_MS[s], 0);

describe('pairing', () => {
  it('pairs with the right code after the four handshake steps', () => {
    let s = pair(initialPair('482913'), submit('482 913'));
    expect(s.phase).toBe('connecting');
    expect(s.entered).toBe('482913');
    expect(handshake(s)).toEqual([{ step: 'discover', state: 'active' }]);
    s = pair(s, { type: 'tick', ms: STEP_MS.discover + 10 });
    expect(handshake(s)).toEqual([
      { step: 'discover', state: 'ok' },
      { step: 'verify', state: 'active' },
    ]);
    expect(s.token).toBeNull();
    s = pair(s, { type: 'tick', ms: HANDSHAKE_MS });
    expect(s.phase).toBe('paired');
    expect(s.token).toBe('beef');
    expect(handshake(s).map((l) => l.state)).toEqual(['ok', 'ok', 'ok', 'ok']);
  });

  it('advances on many small ticks the same as on one big one', () => {
    let small = pair(initialPair('482913'), submit('482913'));
    for (let i = 0; i < HANDSHAKE_MS / 40 + 1; i++) small = pair(small, { type: 'tick', ms: 40 });
    const big = pair(initialPair('482913'), submit('482913'), { type: 'tick', ms: HANDSHAKE_MS });
    expect(small.phase).toBe('paired');
    expect(big.phase).toBe('paired');
  });

  it('rejects a malformed code without starting a handshake', () => {
    const s = pair(initialPair('482913'), submit('48291'));
    expect(s.phase).toBe('unpaired');
    expect(s.error).toBe('format');
    expect(handshake(s)).toEqual([]);
  });

  it('fails at the code check for a wrong code, then switches code after three misses', () => {
    let s = pair(initialPair('482913'), submit('111111'), { type: 'tick', ms: HANDSHAKE_MS });
    expect(s.phase).toBe('unpaired');
    expect(s.error).toBe('wrong');
    expect(handshake(s)).toEqual([
      { step: 'discover', state: 'ok' },
      { step: 'verify', state: 'failed' },
    ]);
    expect(attemptsLeft(s)).toBe(MAX_ATTEMPTS - 1);
    s = pair(s, submit('111111'), { type: 'tick', ms: HANDSHAKE_MS });
    expect(attemptsLeft(s)).toBe(1);
    expect(s.code).toBe('482913');
    s = pair(s, submit('111111'), { type: 'tick', ms: HANDSHAKE_MS });
    expect(s.error).toBe('newCode');
    expect(s.code).toBe('222222');
    expect(s.attempts).toBe(0);
    // the old code no longer works…
    s = pair(s, submit('482913'), { type: 'tick', ms: HANDSHAKE_MS });
    expect(s.error).toBe('wrong');
    // …the new one does
    s = pair(s, submit('222222'), { type: 'tick', ms: HANDSHAKE_MS });
    expect(s.phase).toBe('paired');
  });

  it('never switches to the code already on screen', () => {
    let s = initialPair('222222');
    for (let i = 0; i < MAX_ATTEMPTS; i++) s = pair(s, submit('000000'), { type: 'tick', ms: HANDSHAKE_MS });
    expect(s.error).toBe('newCode');
    expect(s.code).not.toBe('222222');
    expect(s.code).toMatch(/^\d{6}$/);
  });

  it('ignores input while connecting or paired, and unpair starts over with a new code', () => {
    let s = pair(initialPair('482913'), submit('482913'));
    expect(pair(s, submit('999999'))).toBe(s);
    s = pair(s, { type: 'tick', ms: HANDSHAKE_MS });
    expect(pair(s, submit('999999'))).toBe(s);
    expect(pair(initialPair('1'), { type: 'tick', ms: 500 })).toEqual(initialPair('1'));
    s = pair(s, { type: 'unpair', code: '777777' });
    expect(s).toMatchObject({ phase: 'unpaired', code: '777777', token: null, error: null, done: 0 });
    expect(handshake(s)).toEqual([]);
  });

  it('cleans what people type', () => {
    expect(cleanCode('482-913')).toBe('482913');
    expect(cleanCode(' 48 29 13 9')).toBe('482913');
    expect(cleanCode('abc')).toBe('');
  });
});

// ───────────── commands and the terminal ─────────────

const term = (state: TermState, ...actions: TermAction[]) => actions.reduce(termReducer, state);
const IDS = Object.keys(COMMANDS) as CommandId[];

describe('command scripts', () => {
  it('recognises the listed commands regardless of case, spacing and curly quotes', () => {
    expect(findCommand('NVIDIA-SMI')).toBe('nvidia-smi');
    expect(findCommand('  ollama   list ')).toBe('ollama-list');
    expect(findCommand('ollama run qwen3:14b “你好”')).toBe('ollama-zh');
    expect(findCommand('ollama run qwen3:14b "hi"')).toBe('ollama-en');
    expect(findCommand('dir c:\\models')).toBe('dir');
    expect(findCommand('del C:\\models')).toBeNull();
    expect(findCommand('')).toBeNull();
  });

  it('offers the prompt in the page language', () => {
    expect(palette('zh')).toContain('ollama-zh');
    expect(palette('en')).toContain('ollama-en');
    expect(palette('zh')).toHaveLength(7);
  });

  it.each(IDS)('%s: steps are in time order and the process ends after the last line', (id) => {
    const s = buildScript(id, Date.UTC(2026, 10, 26, 10, 0, 0));
    for (let i = 1; i < s.steps.length; i++) expect(s.steps[i].at).toBeGreaterThanOrEqual(s.steps[i - 1].at);
    expect(s.end).toBeGreaterThanOrEqual(s.steps[s.steps.length - 1].at);
    expect(s.exitCode).toBe(id === 'train-oom' ? 1 : 0);
  });

  it('streams model output token by token into one line', () => {
    const s = buildScript('ollama-en');
    const answerAt = s.steps.findIndex((x) => x.text.startsWith('Hi!'));
    const mid = linesAt(s.steps, s.steps[answerAt + 2].at);
    expect(mid[mid.length - 1].text).toBe('Hi! How can');
    const done = linesAt(s.steps, s.end);
    expect(done.map((l) => l.text)).toEqual([
      'Thinking...',
      'The user said hi. A short, friendly reply is enough.',
      '...done thinking.',
      '',
      'Hi! How can I help you today?',
    ]);
  });

  it('rewrites the training progress bar in place', () => {
    const s = buildScript('train');
    const lines = linesAt(s.steps, s.end).map((l) => l.text);
    expect(lines.filter((l) => l.includes('/150'))).toEqual(['  [####################] 150/150  loss 0.64']);
    expect(lines[lines.length - 1]).toBe('done');
  });

  it('prints errors on stderr for the failing command', () => {
    const s = buildScript('train-oom');
    const err = linesAt(s.steps, s.end).filter((l) => l.stream === 'err');
    expect(err[err.length - 2].text).toMatch(/^torch\.OutOfMemoryError/);
  });

  it('prints ping statistics for the replies so far when interrupted', () => {
    const s = buildScript('ping');
    const extra = s.interrupt(2500).map((x) => x.text);
    expect(extra).toContain('    Packets: Sent = 3, Received = 3, Lost = 0 (0% loss),');
    expect(extra.slice(-2)).toEqual(['Control-C', '^C']);
  });

  it('formats exit codes like Windows reports them', () => {
    expect(formatExit(0)).toBe('0');
    expect(formatExit(1)).toBe('1');
    expect(formatExit(CTRL_C_EXIT)).toBe('0xC000013A');
  });
});

describe('terminal', () => {
  it('runs a command to completion and measures its duration', () => {
    let s = term(initialTerm, { type: 'run', input: 'nvidia-smi', now: 0 });
    expect(activeRun(s)?.id).toBe('nvidia-smi');
    const end = buildScript('nvidia-smi').end;
    s = term(s, { type: 'tick', ms: end - 1 });
    expect(activeRun(s)).toBeDefined();
    expect(viewRun(s.runs[0]).exitCode).toBeNull();
    s = term(s, { type: 'tick', ms: 40 });
    const v = viewRun(s.runs[0]);
    expect(s.runs[0].status).toBe('done');
    expect(v.exitCode).toBe(0);
    expect(v.durationMs).toBe(end + 39);
    expect(v.lines.length).toBeGreaterThan(15);
  });

  it('reports a failing command with its exit code', () => {
    const s = term(initialTerm, { type: 'run', input: 'python train.py --batch-size 512', now: 0 }, { type: 'tick', ms: 60_000 });
    expect(viewRun(s.runs[0])).toMatchObject({ exitCode: 1, interrupted: false });
  });

  it('stops with Ctrl+C: interrupt lines and STATUS_CONTROL_C_EXIT', () => {
    let s = term(initialTerm, { type: 'run', input: 'python train.py --epochs 1', now: 0 }, { type: 'tick', ms: 3000 });
    s = term(s, { type: 'stop' });
    const v = viewRun(s.runs[0]);
    expect(s.runs[0].status).toBe('stopped');
    expect(v).toMatchObject({ exitCode: CTRL_C_EXIT, interrupted: true, durationMs: 3000 });
    expect(v.lines[v.lines.length - 1]).toEqual({ text: 'KeyboardInterrupt', stream: 'err' });
    // later ticks change nothing
    expect(term(s, { type: 'tick', ms: 5000 })).toBe(s);
    expect(term(s, { type: 'stop' })).toBe(s);
  });

  it('runs one command at a time', () => {
    const s = term(initialTerm, { type: 'run', input: 'ping -n 6 192.168.1.20', now: 0 });
    expect(term(s, { type: 'run', input: 'dir C:\\models', now: 1 })).toBe(s);
  });

  it('answers unknown commands honestly, and knows help and cls', () => {
    let s = term(initialTerm, { type: 'run', input: 'format C:', now: 0 });
    expect(s.runs[0]).toMatchObject({ status: 'unknown', id: null });
    expect(activeRun(s)).toBeUndefined();
    s = term(s, { type: 'run', input: 'help', now: 0 });
    expect(s.runs[1].status).toBe('help');
    s = term(s, { type: 'run', input: 'CLS', now: 0 });
    expect(s.runs).toEqual([]);
    expect(s.history).toEqual(['format C:', 'help', 'CLS']);
    expect(term(s, { type: 'run', input: '   ', now: 0 })).toBe(s);
  });

  it('keeps a bounded history without repeating the same command twice in a row', () => {
    let s = initialTerm;
    for (let i = 0; i < 3; i++) s = term(s, { type: 'run', input: 'help', now: 0 });
    expect(s.history).toEqual(['help']);
    for (let i = 0; i < MAX_HISTORY + 5; i++) s = term(s, { type: 'run', input: `x${i}`, now: 0 });
    expect(s.history).toHaveLength(MAX_HISTORY);
    expect(s.history[s.history.length - 1]).toBe(`x${MAX_HISTORY + 4}`);
  });

  it('moves through history like a shell', () => {
    const h = ['a', 'b', 'c'];
    expect(historyStep(h, null, 'up')).toBe(2);
    expect(historyStep(h, 2, 'up')).toBe(1);
    expect(historyStep(h, 0, 'up')).toBe(0);
    expect(historyStep(h, 1, 'down')).toBe(2);
    expect(historyStep(h, 2, 'down')).toBeNull();
    expect(historyStep(h, null, 'down')).toBeNull();
    expect(historyStep([], null, 'up')).toBeNull();
  });
});

// ───────────── file transfer ─────────────

describe('file chunks and progress', () => {
  it('splits a file into contiguous chunks that cover every byte once', () => {
    expect(planChunks(0)).toEqual([{ index: 0, offset: 0, length: 0 }]);
    expect(planChunks(1)).toEqual([{ index: 0, offset: 0, length: 1 }]);
    expect(planChunks(CHUNK_SIZE)).toHaveLength(1);
    const plan = planChunks(CHUNK_SIZE * 3 + 5);
    expect(plan.map((c) => c.length)).toEqual([CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE, 5]);
    for (let i = 1; i < plan.length; i++) expect(plan[i].offset).toBe(plan[i - 1].offset + plan[i - 1].length);
    expect(bytesDone(plan, plan.length)).toBe(CHUNK_SIZE * 3 + 5);
    expect(() => planChunks(-1)).toThrow(RangeError);
  });

  it('reports progress chunk by chunk, never past the end', () => {
    const total = 32;
    const d = transferMs(8 * 1024 * 1024);
    let last = 0;
    for (let t = 0; t <= d + 500; t += 37) {
      const n = chunksDone(total, t, d);
      expect(n).toBeGreaterThanOrEqual(last);
      expect(n).toBeLessThanOrEqual(total);
      last = n;
    }
    expect(chunksDone(total, 0, d)).toBe(0);
    expect(chunksDone(total, d, d)).toBe(total);
    expect(chunksDone(total, d - 1, d)).toBeLessThan(total);
  });

  it('keeps the on-screen transfer between 0.7 and 3.6 seconds', () => {
    expect(transferMs(0)).toBe(700);
    expect(transferMs(1024)).toBeGreaterThan(700);
    expect(transferMs(50 * 1024 * 1024)).toBe(3600);
  });

  it('rebuilds the same bytes from the chunks, so both checksums match', async () => {
    const data = pseudoRandomBytes(CHUNK_SIZE * 2 + 123);
    const back = reassemble(sliceChunks(data, planChunks(data.length)), data.length);
    expect(back).toEqual(data);
    expect(await sha256Hex(back)).toBe(await sha256Hex(data));
  });

  it('computes real SHA-256 (FIPS 180-2 test vectors)', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await sha256Hex(new Uint8Array(0))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('makes the same sample bytes every time', () => {
    expect(pseudoRandomBytes(64)).toEqual(pseudoRandomBytes(64));
    expect(pseudoRandomBytes(10)).toHaveLength(10);
  });

  it('counts clipboard bytes as UTF-8', () => {
    expect(utf8Bytes('abc')).toBe(3);
    expect(utf8Bytes('你好')).toBe(6);
    expect(utf8Bytes('C:\\work 📁')).toBe(12);
  });

  it('walks a transfer through hashing, sending, verifying and done', () => {
    let s = transferReducer(initialTransfers, { type: 'start', name: 'a.bin', size: CHUNK_SIZE * 4, own: true });
    const t = s.items[0];
    expect(t).toMatchObject({ id: 1, status: 'hashing', chunks: 4 });
    // one transfer at a time
    expect(transferReducer(s, { type: 'start', name: 'b', size: 1, own: false })).toBe(s);
    s = transferReducer(s, { type: 'tick', ms: 100 });
    expect(s.items[0].elapsed).toBe(0); // not sending yet
    s = transferReducer(s, { type: 'hashed', id: 1, sha: 'aa' });
    s = transferReducer(s, { type: 'tick', ms: t.duration / 2 });
    expect(s.items[0].status).toBe('sending');
    s = transferReducer(s, { type: 'tick', ms: t.duration });
    expect(s.items[0]).toMatchObject({ status: 'verifying', elapsed: t.duration });
    s = transferReducer(s, { type: 'verified', id: 1, sha: 'aa' });
    expect(isVerified(s.items[0])).toBe(true);
    const bad = transferReducer(
      transferReducer(transferReducer(transferReducer(initialTransfers, { type: 'start', name: 'x', size: 1, own: false }), { type: 'hashed', id: 1, sha: 'aa' }), {
        type: 'tick',
        ms: 10_000,
      }),
      { type: 'verified', id: 1, sha: 'bb' },
    );
    expect(isVerified(bad.items[0])).toBe(false);
  });
});

describe('transfer interruptions', () => {
  it('marks a transfer cut off by unpairing as aborted, and frees the link', () => {
    let s = transferReducer(initialTransfers, { type: 'start', name: 'x', size: 10, own: false });
    s = transferReducer(s, { type: 'hashed', id: 1, sha: 'aa' });
    s = transferReducer(s, { type: 'failed', id: 1, reason: 'aborted' });
    expect(s.items[0]).toMatchObject({ status: 'failed', reason: 'aborted' });
    expect(busyTransfer(s)).toBeUndefined();
    // a finished transfer stays finished
    const done = transferReducer(transferReducer(transferReducer(s, { type: 'start', name: 'y', size: 1, own: false }), { type: 'hashed', id: 2, sha: 'b' }), {
      type: 'tick',
      ms: 10_000,
    });
    const verified = transferReducer(done, { type: 'verified', id: 2, sha: 'b' });
    expect(transferReducer(verified, { type: 'failed', id: 2, reason: 'aborted' }).items[1].status).toBe('done');
  });
});

describe('text', () => {
  it('has the same keys in both languages', () => {
    const shape = (o: unknown): unknown =>
      typeof o === 'object' && o !== null && !Array.isArray(o)
        ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)]))
        : Array.isArray(o)
          ? o.length
          : typeof o;
    expect(shape(TEXT.en)).toEqual(shape(TEXT.zh));
  });
});
