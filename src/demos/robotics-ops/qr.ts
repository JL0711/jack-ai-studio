// A small QR Code encoder (ISO/IEC 18004) for the check-in demo.
// Byte mode (UTF-8), error correction level M, versions 1–10. No DOM, no deps.
//
// Pipeline, as in the standard: text → data bits → codewords → Reed–Solomon
// error correction per block → interleave the blocks → place the bits around
// the function patterns → try all 8 masks and keep the lowest penalty → write
// the format (and, from version 7, version) information.
// Checked module by module against two independent encoders in
// src/__tests__/demo-robotics-ops-qr.test.ts.

export interface QrCode {
  version: number;
  /** Modules per side: 17 + 4 × version. */
  size: number;
  mask: number;
  /** size × size, row by row; 1 = dark module. */
  modules: Uint8Array;
}

export class QrTooLongError extends RangeError {
  constructor(bytes: number) {
    super(`QR: ${bytes} bytes do not fit in version 10 at level M (max ${byteCapacity(MAX_VERSION)})`);
    this.name = 'QrTooLongError';
  }
}

export const MIN_VERSION = 1;
export const MAX_VERSION = 10;

// ───────────── GF(256) with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1 ─────────────

const GF_EXP = new Uint8Array(512); // doubled so exp[log a + log b] needs no modulo
const GF_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
}

/** α^n in GF(256) (α = 2). */
export function gfExp(n: number): number {
  return GF_EXP[((n % 255) + 255) % 255];
}

export function gfLog(a: number): number {
  if (a < 1 || a > 255) throw new RangeError('gfLog: argument must be 1…255');
  return GF_LOG[a];
}

export function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

export function gfInv(a: number): number {
  if (a < 1 || a > 255) throw new RangeError('gfInv: argument must be 1…255');
  return GF_EXP[255 - GF_LOG[a]];
}

// ───────────── Reed–Solomon ─────────────

const generators = new Map<number, Uint8Array>();

/** (x − α^0)(x − α^1)…(x − α^(degree−1)), coefficients from the highest power down. */
export function rsGenerator(degree: number): Uint8Array {
  const cached = generators.get(degree);
  if (cached) return cached;
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  generators.set(degree, poly);
  return poly;
}

/** The `degree` error-correction codewords for one block (remainder of data·x^degree ÷ generator). */
export function rsEncode(data: Uint8Array, degree: number): Uint8Array {
  const gen = rsGenerator(degree);
  const rem = new Uint8Array(degree);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.copyWithin(0, 1);
    rem[degree - 1] = 0;
    if (factor !== 0) for (let i = 0; i < degree; i++) rem[i] ^= gfMul(gen[i + 1], factor);
  }
  return rem;
}

// ───────────── versions and blocks (level M only) ─────────────

/** Per version 1–10 at level M: [EC codewords per block, blocks in group 1, data codewords each, blocks in group 2, data codewords each]. */
const M_BLOCKS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [10, 1, 16, 0, 0],
  [16, 1, 28, 0, 0],
  [26, 1, 44, 0, 0],
  [18, 2, 32, 0, 0],
  [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
  [26, 4, 43, 1, 44],
];

function blocksOf(version: number) {
  if (!Number.isInteger(version) || version < MIN_VERSION || version > MAX_VERSION) {
    throw new RangeError(`QR: version must be ${MIN_VERSION}…${MAX_VERSION}`);
  }
  const [ec, n1, d1, n2, d2] = M_BLOCKS[version - 1];
  return { ec, n1, d1, n2, d2 };
}

export function dataCodewords(version: number): number {
  const { n1, d1, n2, d2 } = blocksOf(version);
  return n1 * d1 + n2 * d2;
}

export function totalCodewords(version: number): number {
  const { ec, n1, n2 } = blocksOf(version);
  return dataCodewords(version) + (n1 + n2) * ec;
}

/** Bits in the byte-mode character count: 8 up to version 9, 16 from version 10. */
function countBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

/** How many bytes fit in this version at level M (byte mode). */
export function byteCapacity(version: number): number {
  return Math.floor((dataCodewords(version) * 8 - 4 - countBits(version)) / 8);
}

/** Smallest version that holds `byteLength` bytes. */
export function chooseVersion(byteLength: number, minVersion = MIN_VERSION, maxVersion = MAX_VERSION): number {
  for (let v = Math.max(MIN_VERSION, minVersion); v <= Math.min(MAX_VERSION, maxVersion); v++) {
    if (byteLength <= byteCapacity(v)) return v;
  }
  throw new QrTooLongError(byteLength);
}

/** Mode + count + bytes, terminator, zero bits to a byte boundary, then 0xEC 0x11 padding. */
export function encodeDataCodewords(bytes: Uint8Array, version: number): Uint8Array {
  const capacity = dataCodewords(version);
  const capBits = capacity * 8;
  if (4 + countBits(version) + bytes.length * 8 > capBits) throw new QrTooLongError(bytes.length);
  const out = new Uint8Array(capacity);
  let bit = 0;
  const put = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) {
      if ((value >>> i) & 1) out[bit >>> 3] |= 0x80 >>> (bit & 7);
      bit++;
    }
  };
  put(0b0100, 4);
  put(bytes.length, countBits(version));
  for (const b of bytes) put(b, 8);
  bit += Math.min(4, capBits - bit); // terminator: up to four 0 bits (already zero)
  let i = Math.ceil(bit / 8);
  for (let pad = 0xec; i < capacity; i++, pad ^= 0xec ^ 0x11) out[i] = pad;
  return out;
}

/** Splits the data into blocks, adds each block's EC codewords and interleaves them. */
export function interleaveWithEc(data: Uint8Array, version: number): Uint8Array {
  const { ec, n1, d1, n2, d2 } = blocksOf(version);
  if (data.length !== n1 * d1 + n2 * d2) throw new RangeError('QR: wrong number of data codewords');
  const blocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  for (let b = 0, k = 0; b < n1 + n2; b++) {
    const length = b < n1 ? d1 : d2;
    const block = data.subarray(k, k + length);
    k += length;
    blocks.push(block);
    ecBlocks.push(rsEncode(block, ec));
  }
  const out = new Uint8Array(totalCodewords(version));
  let i = 0;
  for (let j = 0; j < Math.max(d1, d2); j++) for (const block of blocks) if (j < block.length) out[i++] = block[j];
  for (let j = 0; j < ec; j++) for (const block of ecBlocks) out[i++] = block[j];
  return out;
}

// ───────────── format and version information ─────────────

/** 15 format bits for level M (indicator 00) and `mask`: BCH(15,5), then XOR 101010000010010. */
export function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** 18 version bits (versions 7+): BCH(18,6) with generator 0x1F25. */
export function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

/** Centre rows/columns of the alignment patterns. */
export function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const size = 17 + 4 * version;
  const count = Math.floor(version / 7) + 2;
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

// ───────────── the matrix ─────────────

type Grid = { size: number; modules: Uint8Array; reserved: Uint8Array };

function setFunction(g: Grid, x: number, y: number, dark: boolean) {
  g.modules[y * g.size + x] = dark ? 1 : 0;
  g.reserved[y * g.size + x] = 1;
}

function drawFormat(g: Grid, mask: number) {
  const bits = formatBits(mask);
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  const n = g.size;
  // Copy 1, around the top-left finder.
  for (let i = 0; i <= 5; i++) setFunction(g, 8, i, bit(i));
  setFunction(g, 8, 7, bit(6));
  setFunction(g, 8, 8, bit(7));
  setFunction(g, 7, 8, bit(8));
  for (let i = 9; i < 15; i++) setFunction(g, 14 - i, 8, bit(i));
  // Copy 2, split between the top-right and bottom-left finders.
  for (let i = 0; i < 8; i++) setFunction(g, n - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) setFunction(g, 8, n - 15 + i, bit(i));
  setFunction(g, 8, n - 8, true); // the "dark module"
}

function drawFunctionPatterns(g: Grid, version: number) {
  const n = g.size;
  for (let i = 0; i < n; i++) {
    setFunction(g, 6, i, i % 2 === 0);
    setFunction(g, i, 6, i % 2 === 0);
  }
  // Finder patterns with their light separators.
  for (const [cx, cy] of [
    [3, 3],
    [n - 4, 3],
    [3, n - 4],
  ]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        setFunction(g, x, y, ring !== 2 && ring !== 4);
      }
    }
  }
  const align = alignmentPositions(version);
  const last = align.length - 1;
  for (let i = 0; i <= last; i++) {
    for (let j = 0; j <= last; j++) {
      // The three corners overlap the finder patterns.
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFunction(g, align[j] + dx, align[i] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }
  drawFormat(g, 0); // reserves the area; the real bits are written once the mask is chosen
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = n - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(g, a, b, dark);
      setFunction(g, b, a, dark);
    }
  }
}

/** Zigzag placement: two columns at a time from the bottom right, skipping the timing column. */
function placeCodewords(g: Grid, codewords: Uint8Array) {
  const n = g.size;
  const totalBits = codewords.length * 8;
  let i = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < n; vert++) {
      const y = upward ? n - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const k = y * n + x;
        if (g.reserved[k]) continue;
        // Remainder bits (versions 2–6) stay light.
        if (i < totalBits) g.modules[k] = (codewords[i >>> 3] >>> (7 - (i & 7))) & 1;
        i++;
      }
    }
  }
}

/** Whether `mask` flips the module at column x, row y. */
export function maskHit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      throw new RangeError('QR: mask must be 0…7');
  }
}

function applyMask(g: Grid, mask: number) {
  const n = g.size;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const k = y * n + x;
      if (!g.reserved[k] && maskHit(mask, x, y)) g.modules[k] ^= 1;
    }
  }
}

// Penalty weights N1–N4 from the standard.
const N1 = 3;
const N2 = 3;
const N3 = 40;
const N4 = 10;

/**
 * Penalty score of a finished symbol (rules 1–4). Rule 3 counts 1:1:3:1:1 finder-like
 * runs with four light modules on one side, treating the area outside the symbol as light.
 */
export function penaltyScore(modules: Uint8Array, size: number): number {
  let result = 0;
  const at = (x: number, y: number) => modules[y * size + x];

  const addHistory = (run: number, history: number[]) => {
    if (history[0] === 0) run += size; // the light border before the first run
    history.pop();
    history.unshift(run);
  };
  const countPatterns = (h: number[]) => {
    const n = h[1];
    const core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
    return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
  };
  const terminate = (color: number, run: number, history: number[]) => {
    if (color) {
      addHistory(run, history);
      run = 0;
    }
    addHistory(run + size, history); // the light border after the last run
    return countPatterns(history);
  };

  for (let pass = 0; pass < 2; pass++) {
    const get = pass === 0 ? (a: number, b: number) => at(b, a) : at; // rows, then columns
    for (let a = 0; a < size; a++) {
      let color = 0;
      let run = 0;
      const history = [0, 0, 0, 0, 0, 0, 0];
      for (let b = 0; b < size; b++) {
        if (get(a, b) === color) {
          run++;
          if (run === 5) result += N1;
          else if (run > 5) result++;
        } else {
          addHistory(run, history);
          if (!color) result += countPatterns(history) * N3;
          color = get(a, b);
          run = 1;
        }
      }
      result += terminate(color, run, history) * N3;
    }
  }

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = at(x, y);
      if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) result += N2;
    }
  }

  let dark = 0;
  for (const m of modules) dark += m;
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += k * N4;
  return result;
}

export interface EncodeOptions {
  /** 0–7 to force a mask; by default the one with the lowest penalty wins. */
  mask?: number;
  minVersion?: number;
  maxVersion?: number;
}

/** Encodes text (as UTF-8 bytes) into a QR symbol at error correction level M. */
export function encodeQr(text: string, options: EncodeOptions = {}): QrCode {
  return encodeQrBytes(new TextEncoder().encode(text), options);
}

export function encodeQrBytes(bytes: Uint8Array, options: EncodeOptions = {}): QrCode {
  const version = chooseVersion(bytes.length, options.minVersion, options.maxVersion);
  const codewords = interleaveWithEc(encodeDataCodewords(bytes, version), version);
  const size = 17 + 4 * version;
  const g: Grid = { size, modules: new Uint8Array(size * size), reserved: new Uint8Array(size * size) };
  drawFunctionPatterns(g, version);
  placeCodewords(g, codewords);

  let mask = options.mask ?? -1;
  if (mask !== -1 && !(Number.isInteger(mask) && mask >= 0 && mask <= 7)) throw new RangeError('QR: mask must be 0…7');
  if (mask === -1) {
    let best = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(g, m);
      drawFormat(g, m);
      const score = penaltyScore(g.modules, size);
      if (score < best) {
        best = score;
        mask = m;
      }
      applyMask(g, m); // XOR again to undo
    }
  }
  applyMask(g, mask);
  drawFormat(g, mask);
  return { version, size, mask, modules: g.modules };
}

/** One SVG path for all dark modules (runs merged per row), offset by a quiet zone of `margin` modules. */
export function qrSvgPath(qr: QrCode, margin = 4): string {
  const { size, modules } = qr;
  let d = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; ) {
      if (!modules[y * size + x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < size && modules[y * size + x]) x++;
      d += `M${start + margin} ${y + margin}h${x - start}v1h-${x - start}z`;
    }
  }
  return d;
}
