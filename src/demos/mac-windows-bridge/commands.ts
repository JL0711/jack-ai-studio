// Prepared "remote commands" for the bridge simulation and the terminal that
// plays them back. Nothing here runs anything: each command is a script of
// output lines with timestamps, an exit code, and what it prints on Ctrl+C.
// All output is sample text (no real measurements).

export type Lang = 'zh' | 'en';
export type Stream = 'out' | 'err';

export interface Step {
  /** ms after the command started */
  at: number;
  text: string;
  stream?: Stream;
  /** 'append' continues the last line (streamed tokens), 'replace' rewrites it (a progress bar). */
  mode?: 'line' | 'append' | 'replace';
}

export interface Script {
  steps: Step[];
  /** ms after the start when the process exits */
  end: number;
  exitCode: number;
  /** Lines printed when interrupted after `elapsed` ms. */
  interrupt: (elapsed: number) => Omit<Step, 'at'>[];
}

export type CommandId = 'nvidia-smi' | 'ollama-list' | 'ollama-zh' | 'ollama-en' | 'train' | 'dir' | 'ping' | 'train-oom';

/** STATUS_CONTROL_C_EXIT: what Windows reports for a console program stopped with Ctrl+C. */
export const CTRL_C_EXIT = 0xc000013a;

export const MAC_IP = '192.168.1.20';
export const PC_IP = '192.168.1.23';
export const PC_HOST = 'DESKTOP-SAMPLE';

export const COMMANDS: Record<CommandId, string> = {
  'nvidia-smi': 'nvidia-smi',
  'ollama-list': 'ollama list',
  'ollama-zh': 'ollama run qwen3:14b "你好"',
  'ollama-en': 'ollama run qwen3:14b "Hi"',
  train: 'python train.py --epochs 1',
  dir: 'dir C:\\models',
  ping: `ping -n 6 ${MAC_IP}`,
  'train-oom': 'python train.py --batch-size 512',
};

/** The palette, in order; the ollama prompt follows the page language. */
export function palette(lang: Lang): CommandId[] {
  return ['nvidia-smi', 'ollama-list', lang === 'zh' ? 'ollama-zh' : 'ollama-en', 'train', 'dir', 'ping', 'train-oom'];
}

/** Case, extra spaces and curly quotes don't matter. */
export function normalizeCommand(input: string): string {
  return input
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function findCommand(input: string): CommandId | null {
  const n = normalizeCommand(input);
  for (const id of Object.keys(COMMANDS) as CommandId[]) if (normalizeCommand(COMMANDS[id]) === n) return id;
  return null;
}

/** Turns [delay, text, options] triples into steps with absolute times. */
function timeline(items: [number, string, Partial<Omit<Step, 'at' | 'text'>>?][]): Step[] {
  let at = 0;
  return items.map(([delay, text, extra]) => {
    at += delay;
    return { at, text, ...extra };
  });
}

/** Splits text into small pieces, like tokens arriving from a model. */
function tokens(text: string, every: number, first = every): [number, string, Partial<Step>][] {
  const pieces = text.match(/[\u3400-\u9fff\uff00-\uffef。，！？、]{1,2}|\s*[^\s\u3400-\u9fff]+|\s+/g) ?? [text];
  return pieces.map((p, i) => [i === 0 ? first : every, p, { mode: 'append' as const }]);
}

const pad = (n: number, w: number) => String(n).padStart(w, ' ');

function smiClock(startedAt: number): string {
  const d = new Date(startedAt);
  const day = d.toLocaleDateString('en-US', { weekday: 'short' });
  const mon = d.toLocaleDateString('en-US', { month: 'short' });
  const t = [d.getHours(), d.getMinutes(), d.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':');
  return `${day} ${mon} ${pad(d.getDate(), 2)} ${t} ${d.getFullYear()}`;
}

const TRAIN_HEAD: [number, string][] = [
  [420, 'device: cuda (NVIDIA GeForce RTX 5070 Ti)'],
  [380, 'dataset: data/sample-images (1,200 files, sample)'],
  [520, 'epoch 1/1'],
];

function bar(step: number, total: number): string {
  const filled = Math.round((step / total) * 20);
  return `  [${'#'.repeat(filled)}${'.'.repeat(20 - filled)}] ${pad(step, 3)}/${total}`;
}

const LOSSES = [2.31, 1.87, 1.52, 1.29, 1.11, 0.98, 0.88, 0.81, 0.75, 0.71, 0.67, 0.64];

const KEYBOARD_INTERRUPT = (line: number, code: string) => [
  { text: '^C' },
  { text: 'Traceback (most recent call last):', stream: 'err' as const },
  { text: `  File "C:\\work\\train.py", line ${line}, in <module>`, stream: 'err' as const },
  { text: `    ${code}`, stream: 'err' as const },
  { text: 'KeyboardInterrupt', stream: 'err' as const },
];

const PING_TIMES = [3, 2, 2, 4, 2, 5];

function pingStats(received: number): Omit<Step, 'at'>[] {
  const times = PING_TIMES.slice(0, received);
  const stats: Omit<Step, 'at'>[] = [
    { text: '' },
    { text: `Ping statistics for ${MAC_IP}:` },
    { text: `    Packets: Sent = ${received}, Received = ${received}, Lost = 0 (0% loss),` },
  ];
  if (received > 0) {
    stats.push(
      { text: 'Approximate round trip times in milli-seconds:' },
      {
        text: `    Minimum = ${Math.min(...times)}ms, Maximum = ${Math.max(...times)}ms, Average = ${Math.round(
          times.reduce((a, b) => a + b, 0) / received,
        )}ms`,
      },
    );
  }
  return stats;
}

function noInterrupt(): Omit<Step, 'at'>[] {
  return [{ text: '^C' }];
}

/** The script for a command. `startedAt` (epoch ms) only feeds nvidia-smi's clock line. */
export function buildScript(id: CommandId, startedAt = 0): Script {
  switch (id) {
    case 'nvidia-smi': {
      const rule = '+-----------------------------------------+------------------------+----------------------+';
      const wide = '+-----------------------------------------------------------------------------------------+';
      const lines = [
        smiClock(startedAt),
        wide,
        '| NVIDIA-SMI 581.57                 Driver Version: 581.57         CUDA Version: 13.0     |',
        rule,
        '| GPU  Name                  Driver-Model | Bus-Id          Disp.A | Volatile Uncorr. ECC |',
        '| Fan  Temp   Perf          Pwr:Usage/Cap |           Memory-Usage | GPU-Util  Compute M. |',
        '|                                         |                        |               MIG M. |',
        '|=========================================+========================+======================|',
        '|   0  NVIDIA GeForce RTX 5070 Ti   WDDM  |   00000000:01:00.0  On |                  N/A |',
        '|  0%   41C    P8             21W /  300W |    1318MiB /  16303MiB |      4%      Default |',
        '|                                         |                        |                  N/A |',
        rule,
        '',
        wide,
        '| Processes:                                                                              |',
        '|  GPU   GI   CI              PID   Type   Process name                        GPU Memory |',
        '|        ID   ID                                                               Usage      |',
        '|=========================================================================================|',
        '|    0   N/A  N/A            7316    C+G   C:\\Windows\\explorer.exe              N/A      |',
        wide,
      ];
      const steps = lines.map((text, i) => ({ at: 380 + i * 12, text }));
      return { steps, end: 380 + lines.length * 12 + 60, exitCode: 0, interrupt: noInterrupt };
    }

    case 'ollama-list': {
      const steps = timeline([
        [260, 'NAME                   ID              SIZE      MODIFIED'],
        [30, 'qwen3:14b              7c1e2a9d04b3    9.3 GB    3 weeks ago'],
        [20, 'bge-m3:latest          a52f0e18c6d7    1.2 GB    5 weeks ago'],
        [20, 'llama3.2-vision:11b    e4b8113f9a20    7.8 GB    2 months ago'],
      ]);
      return { steps, end: steps[steps.length - 1].at + 40, exitCode: 0, interrupt: noInterrupt };
    }

    case 'ollama-zh':
    case 'ollama-en': {
      const zh = id === 'ollama-zh';
      const think = zh ? '用户用中文打了个招呼，简单友好地回一句就好。' : 'The user said hi. A short, friendly reply is enough.';
      const answer = zh ? '你好！有什么我可以帮你的吗？' : 'Hi! How can I help you today?';
      const steps = timeline([
        [900, 'Thinking...'],
        [400, ''],
        ...tokens(think, 70, 0),
        [500, '...done thinking.'],
        [250, ''],
        [350, ''],
        ...tokens(answer, 85, 0),
      ]);
      const end = steps[steps.length - 1].at + 300;
      return {
        steps,
        end,
        exitCode: 0,
        interrupt: () => [{ text: '' }, { text: '^C' }],
      };
    }

    case 'train':
    case 'train-oom': {
      const head = timeline(TRAIN_HEAD.map(([d, t]) => [d, t]));
      if (id === 'train-oom') {
        const t0 = head[head.length - 1].at;
        const err = [
          'Traceback (most recent call last):',
          '  File "C:\\work\\train.py", line 52, in <module>',
          '    out = model(batch)',
          '  File "C:\\work\\.venv\\Lib\\site-packages\\torch\\nn\\modules\\module.py", line 1775, in _wrapped_call_impl',
          '    return self._call_impl(*args, **kwargs)',
          'torch.OutOfMemoryError: CUDA out of memory. Tried to allocate 3.06 GiB. GPU 0 has a total capacity of',
          '15.92 GiB of which 1.41 GiB is free.',
        ];
        const steps = [...head, ...err.map((text, i) => ({ at: t0 + 1500 + i * 20, text, stream: 'err' as const }))];
        return {
          steps,
          end: steps[steps.length - 1].at + 120,
          exitCode: 1,
          interrupt: () => KEYBOARD_INTERRUPT(52, 'out = model(batch)'),
        };
      }
      // One progress line that is rewritten in place, like a terminal progress bar.
      const total = 150;
      const progress: [number, string, Partial<Step>][] = LOSSES.map((loss, k) => [
        560,
        `${bar(Math.round(((k + 1) / LOSSES.length) * total), total)}  loss ${loss.toFixed(2)}`,
        { mode: 'replace' },
      ]);
      const steps = [
        ...head,
        ...timeline([
          [head[head.length - 1].at + 200, `${bar(0, total)}  loss  -`],
          ...progress,
          [450, 'saved: runs/sample/epoch1.pt'],
          [120, 'done'],
        ]),
      ];
      return {
        steps,
        end: steps[steps.length - 1].at + 200,
        exitCode: 0,
        interrupt: () => KEYBOARD_INTERRUPT(48, 'loss.backward()'),
      };
    }

    case 'dir': {
      const lines = [
        ' Volume in drive C has no label.',
        ' Volume Serial Number is 5A1C-9F3E',
        '',
        ' Directory of C:\\models',
        '',
        '2026/11/20  21:14    <DIR>          .',
        '2026/11/20  21:14    <DIR>          ..',
        '2026/11/18  09:02    <DIR>          checkpoints',
        '2026/11/19  22:47     1,288,490,188 sample-lora.safetensors',
        '2026/11/12  16:30            48,213 tokenizer.json',
        '               2 File(s)  1,288,538,401 bytes',
        '               3 Dir(s)  712,384,962,560 bytes free',
      ];
      const steps = lines.map((text, i) => ({ at: 120 + i * 10, text }));
      return { steps, end: 120 + lines.length * 10 + 40, exitCode: 0, interrupt: noInterrupt };
    }

    case 'ping': {
      const steps: Step[] = [{ at: 150, text: `Pinging ${MAC_IP} with 32 bytes of data:` }];
      PING_TIMES.forEach((ms, i) => steps.push({ at: 200 + i * 1000, text: `Reply from ${MAC_IP}: bytes=32 time=${ms}ms TTL=64` }));
      const last = steps[steps.length - 1].at;
      pingStats(PING_TIMES.length).forEach((s, i) => steps.push({ at: last + 40 + i * 10, ...s }));
      return {
        steps,
        end: steps[steps.length - 1].at + 40,
        exitCode: 0,
        interrupt: (elapsed) => {
          const received = PING_TIMES.filter((_, i) => 200 + i * 1000 <= elapsed).length;
          return [...pingStats(received), { text: 'Control-C' }, { text: '^C' }];
        },
      };
    }
  }
}

export interface OutLine {
  text: string;
  stream: Stream;
}

/** The output visible `elapsed` ms after the start. */
export function linesAt(steps: Step[], elapsed: number): OutLine[] {
  const out: OutLine[] = [];
  for (const s of steps) {
    if (s.at > elapsed) break;
    const last = out[out.length - 1];
    if (s.mode === 'append' && last) out[out.length - 1] = { ...last, text: last.text + s.text };
    else if (s.mode === 'replace' && last) out[out.length - 1] = { text: s.text, stream: s.stream ?? 'out' };
    else out.push({ text: s.text, stream: s.stream ?? 'out' });
  }
  return out;
}

// ───────────── the terminal ─────────────

export type RunStatus = 'running' | 'done' | 'stopped' | 'unknown' | 'help';

export interface Run {
  n: number;
  input: string;
  id: CommandId | null;
  status: RunStatus;
  /** Active (on-screen) milliseconds since the start; the measured duration once finished. */
  elapsed: number;
  startedAt: number;
}

export interface TermState {
  runs: Run[];
  history: string[];
  nextN: number;
}

export type TermAction =
  | { type: 'run'; input: string; now: number }
  | { type: 'tick'; ms: number }
  | { type: 'stop' }
  | { type: 'reset' };

export const MAX_RUNS = 30;
export const MAX_HISTORY = 50;

export const initialTerm: TermState = { runs: [], history: [], nextN: 1 };

const scriptCache = new Map<string, Script>();
/** Scripts are pure functions of (id, start time), so one per run is cached. */
export function scriptOf(run: Run): Script | null {
  if (!run.id) return null;
  const key = `${run.id}@${run.startedAt}`;
  let s = scriptCache.get(key);
  if (!s) {
    s = buildScript(run.id, run.startedAt);
    if (scriptCache.size > 60) scriptCache.clear();
    scriptCache.set(key, s);
  }
  return s;
}

export function activeRun(state: TermState): Run | undefined {
  const last = state.runs[state.runs.length - 1];
  return last?.status === 'running' ? last : undefined;
}

export function termReducer(state: TermState, action: TermAction): TermState {
  switch (action.type) {
    case 'run': {
      const input = action.input.trim();
      if (!input || activeRun(state)) return state;
      const history = state.history[state.history.length - 1] === input ? state.history : [...state.history, input].slice(-MAX_HISTORY);
      const word = normalizeCommand(input);
      if (word === 'cls' || word === 'clear') return { ...state, runs: [], history };
      const id = findCommand(input);
      const status: RunStatus = id ? 'running' : word === 'help' ? 'help' : 'unknown';
      const run: Run = { n: state.nextN, input, id, status, elapsed: 0, startedAt: action.now };
      return { runs: [...state.runs, run].slice(-MAX_RUNS), history, nextN: state.nextN + 1 };
    }
    case 'tick': {
      const run = activeRun(state);
      if (!run || action.ms <= 0) return state;
      const script = scriptOf(run);
      const elapsed = run.elapsed + action.ms;
      const done = !script || elapsed >= script.end;
      const next: Run = { ...run, elapsed, status: done ? 'done' : 'running' };
      return { ...state, runs: [...state.runs.slice(0, -1), next] };
    }
    case 'stop': {
      const run = activeRun(state);
      if (!run) return state;
      return { ...state, runs: [...state.runs.slice(0, -1), { ...run, status: 'stopped' }] };
    }
    case 'reset':
      return initialTerm;
  }
}

export interface RunView {
  lines: OutLine[];
  /** null while running (or for local messages) */
  exitCode: number | null;
  interrupted: boolean;
  durationMs: number;
}

export function viewRun(run: Run): RunView {
  const script = scriptOf(run);
  if (!script) return { lines: [], exitCode: null, interrupted: false, durationMs: 0 };
  const lines = linesAt(script.steps, run.elapsed);
  if (run.status === 'stopped') {
    const extra = script.interrupt(run.elapsed).map((s) => ({ text: s.text, stream: s.stream ?? 'out' }));
    return { lines: [...lines, ...extra], exitCode: CTRL_C_EXIT, interrupted: true, durationMs: run.elapsed };
  }
  if (run.status === 'done') return { lines, exitCode: script.exitCode, interrupted: false, durationMs: run.elapsed };
  return { lines, exitCode: null, interrupted: false, durationMs: run.elapsed };
}

/** "0xC000013A" for Windows status codes, plain decimal otherwise. */
export function formatExit(code: number): string {
  return code > 0xffff ? `0x${code.toString(16).toUpperCase()}` : String(code);
}

/** Moves through the command history like a shell: ↑ older, ↓ newer, past the newest back to the draft. */
export function historyStep(history: string[], index: number | null, dir: 'up' | 'down'): number | null {
  if (history.length === 0) return null;
  if (dir === 'up') return index === null ? history.length - 1 : Math.max(0, index - 1);
  if (index === null) return null;
  return index + 1 >= history.length ? null : index + 1;
}
