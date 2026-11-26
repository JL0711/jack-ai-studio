// File sending for the bridge simulation. The transfer itself is simulated,
// but the parts that can be real are: the file is split into chunks, the
// "received" copy is put back together from those chunks, and both sides
// compute SHA-256 with the browser's crypto API. Nothing leaves the page.

export const CHUNK_SIZE = 256 * 1024;
/** The demo reads at most this much of a visitor's own file. */
export const MAX_FILE = 50 * 1024 * 1024;

export interface Chunk {
  index: number;
  offset: number;
  length: number;
}

/** Fixed-size chunks; an empty file still sends one empty chunk (so the PC creates the file). */
export function planChunks(size: number, chunkSize = CHUNK_SIZE): Chunk[] {
  if (!Number.isFinite(size) || size < 0 || chunkSize <= 0) throw new RangeError('planChunks: bad size');
  if (size === 0) return [{ index: 0, offset: 0, length: 0 }];
  const n = Math.ceil(size / chunkSize);
  return Array.from({ length: n }, (_, i) => ({ index: i, offset: i * chunkSize, length: Math.min(chunkSize, size - i * chunkSize) }));
}

/** On-screen duration of a simulated transfer: longer for bigger files, but never tedious. */
export function transferMs(size: number): number {
  return Math.round(Math.min(3600, 700 + Math.sqrt(size) * 0.9));
}

/** Chunks finished `elapsed` ms into a transfer of `duration` ms (they finish evenly). */
export function chunksDone(total: number, elapsed: number, duration: number): number {
  if (elapsed <= 0) return 0;
  if (elapsed >= duration) return total;
  return Math.min(total, Math.floor((elapsed / duration) * total));
}

export function bytesDone(plan: Chunk[], done: number): number {
  let n = 0;
  for (let i = 0; i < Math.min(done, plan.length); i++) n += plan[i].length;
  return n;
}

/** The receiving side: writes each chunk at its offset into a new buffer. */
export function reassemble(chunks: { offset: number; bytes: Uint8Array }[], size: number): Uint8Array {
  const out = new Uint8Array(size);
  for (const c of chunks) out.set(c.bytes, c.offset);
  return out;
}

export function sliceChunks(data: Uint8Array, plan: Chunk[]): { offset: number; bytes: Uint8Array }[] {
  return plan.map((c) => ({ offset: c.offset, bytes: data.slice(c.offset, c.offset + c.length) }));
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function canHash(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

// ───────────── transfers (Mac → PC) ─────────────

export type TransferStatus = 'hashing' | 'sending' | 'verifying' | 'done' | 'failed';

export interface Transfer {
  id: number;
  name: string;
  size: number;
  own: boolean;
  status: TransferStatus;
  chunks: number;
  elapsed: number;
  duration: number;
  macSha?: string;
  pcSha?: string;
  /** Why it failed: the file couldn't be read, or the link went down mid-transfer. */
  reason?: 'read' | 'aborted';
}

export interface TransferState {
  items: Transfer[];
  nextId: number;
}

export type TransferAction =
  | { type: 'start'; name: string; size: number; own: boolean }
  | { type: 'hashed'; id: number; sha: string }
  | { type: 'tick'; ms: number }
  | { type: 'verified'; id: number; sha: string }
  | { type: 'failed'; id: number; reason: 'read' | 'aborted' }
  | { type: 'reset' };

export const initialTransfers: TransferState = { items: [], nextId: 1 };

export function busyTransfer(state: TransferState): Transfer | undefined {
  return state.items.find((t) => t.status === 'hashing' || t.status === 'sending' || t.status === 'verifying');
}

export function transferReducer(state: TransferState, action: TransferAction): TransferState {
  const update = (id: number, fn: (t: Transfer) => Transfer): TransferState => ({
    ...state,
    items: state.items.map((t) => (t.id === id ? fn(t) : t)),
  });
  switch (action.type) {
    case 'start': {
      if (busyTransfer(state)) return state;
      const t: Transfer = {
        id: state.nextId,
        name: action.name,
        size: action.size,
        own: action.own,
        status: 'hashing',
        chunks: planChunks(action.size).length,
        elapsed: 0,
        duration: transferMs(action.size),
      };
      return { items: [...state.items, t].slice(-12), nextId: state.nextId + 1 };
    }
    case 'hashed':
      return update(action.id, (t) => (t.status === 'hashing' ? { ...t, status: 'sending', macSha: action.sha } : t));
    case 'tick': {
      const t = state.items.find((x) => x.status === 'sending');
      if (!t || action.ms <= 0) return state;
      return update(t.id, (x) => {
        const elapsed = Math.min(x.duration, x.elapsed + action.ms);
        return { ...x, elapsed, status: elapsed >= x.duration ? 'verifying' : 'sending' };
      });
    }
    case 'verified':
      return update(action.id, (t) => (t.status === 'verifying' ? { ...t, status: 'done', pcSha: action.sha } : t));
    case 'failed':
      return update(action.id, (t) => (t.status === 'done' ? t : { ...t, status: 'failed', reason: action.reason }));
    case 'reset':
      return initialTransfers;
  }
}

export function isVerified(t: Transfer): boolean {
  return t.status === 'done' && !!t.macSha && t.macSha === t.pcSha;
}

// ───────────── sample files (made on the fly, so their checksums are real) ─────────────

export type SampleId = 'config' | 'notes' | 'weights';

/** Deterministic pseudo-random bytes (xorshift32), so the sample's SHA-256 is the same every time. */
export function pseudoRandomBytes(length: number, seed = 0x5eed1234): Uint8Array {
  const out = new Uint8Array(length);
  const words = new Uint32Array(out.buffer, 0, Math.floor(length / 4));
  let x = seed >>> 0 || 1;
  for (let i = 0; i < words.length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    words[i] = x >>> 0;
  }
  for (let i = words.length * 4; i < length; i++) out[i] = (x >>> ((i % 4) * 8)) & 0xff;
  return out;
}

export const SAMPLE_WEIGHTS_SIZE = 8 * 1024 * 1024;
