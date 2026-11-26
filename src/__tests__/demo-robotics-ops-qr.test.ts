import { describe, expect, it } from 'vitest';
import {
  QrTooLongError,
  alignmentPositions,
  byteCapacity,
  chooseVersion,
  encodeDataCodewords,
  encodeQr,
  formatBits,
  gfExp,
  gfInv,
  gfLog,
  gfMul,
  interleaveWithEc,
  penaltyScore,
  qrSvgPath,
  rsEncode,
  rsGenerator,
  totalCodewords,
  versionBits,
} from '../demos/robotics-ops/qr';

/** Carry-less multiply with reduction by 0x11D, written independently of the log/exp tables. */
function slowMul(a: number, b: number): number {
  let r = 0;
  for (let i = 7; i >= 0; i--) {
    r <<= 1;
    if (r & 0x100) r ^= 0x11d;
    if ((b >>> i) & 1) r ^= a;
  }
  return r;
}

describe('GF(256)', () => {
  it('matches a bitwise multiply for every pair', () => {
    for (let a = 0; a < 256; a++) for (let b = 0; b < 256; b++) expect(gfMul(a, b)).toBe(slowMul(a, b));
  });

  it('has the standard exp/log tables (α = 2, x^8 = x^4 + x^3 + x^2 + 1)', () => {
    expect([0, 1, 7, 8, 9, 12, 25, 255].map(gfExp)).toEqual([1, 2, 128, 29, 58, 205, 3, 1]);
    for (let a = 1; a < 256; a++) expect(gfExp(gfLog(a))).toBe(a);
    for (let a = 1; a < 256; a++) expect(gfMul(a, gfInv(a))).toBe(1);
    expect(() => gfLog(0)).toThrow(RangeError);
    expect(() => gfInv(0)).toThrow(RangeError);
  });
});

describe('Reed–Solomon', () => {
  it('builds the degree-10 generator (α^0, α^251, α^67, α^46, …)', () => {
    const gen = rsGenerator(10);
    expect(Array.from(gen)).toEqual([1, 216, 194, 159, 111, 199, 94, 95, 113, 157, 193]);
    expect(Array.from(gen, (c) => gfLog(c))).toEqual([0, 251, 67, 46, 61, 118, 70, 64, 94, 32, 45]);
  });

  it('gives the known EC codewords for "HELLO WORLD" 1-M (alphanumeric data codewords)', () => {
    const data = new Uint8Array([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]);
    expect(Array.from(rsEncode(data, 10))).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('gives the ISO/IEC 18004 Annex I EC codewords for "01234567" 1-M', () => {
    const data = new Uint8Array([0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11]);
    expect(Array.from(rsEncode(data, 10))).toEqual([0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55]);
  });

  it('produces codewords whose syndromes are all zero', () => {
    const data = new TextEncoder().encode('Ironbark Robotics · 0000 · sample block of data!!');
    for (const degree of [16, 18, 22, 26]) {
      const word = [...data, ...rsEncode(data, degree)];
      for (let i = 0; i < degree; i++) {
        // Horner's rule: evaluate the codeword polynomial at α^i.
        const s = word.reduce((acc, c) => gfMul(acc, gfExp(i)) ^ c, 0);
        expect(s).toBe(0);
      }
    }
  });
});

describe('data codewords', () => {
  it('knows the byte capacity of versions 1–10 at level M', () => {
    expect(Array.from({ length: 10 }, (_, i) => byteCapacity(i + 1))).toEqual([14, 26, 42, 62, 84, 106, 122, 152, 180, 213]);
    expect(Array.from({ length: 10 }, (_, i) => totalCodewords(i + 1))).toEqual([26, 44, 70, 100, 134, 172, 196, 242, 292, 346]);
  });

  it('picks the smallest version that fits, and refuses more than version 10 holds', () => {
    expect(chooseVersion(14)).toBe(1);
    expect(chooseVersion(15)).toBe(2);
    expect(chooseVersion(84)).toBe(5);
    expect(chooseVersion(85)).toBe(6);
    expect(chooseVersion(213)).toBe(10);
    expect(() => chooseVersion(214)).toThrow(QrTooLongError);
    expect(() => encodeQr('x'.repeat(214))).toThrow(QrTooLongError);
  });

  it('writes mode, count, bytes, terminator and 0xEC/0x11 padding', () => {
    const cw = encodeDataCodewords(new TextEncoder().encode('Hi'), 1);
    // 0100 | 00000010 | 01001000 | 01101001 | 0000 → 0x40 0x24 0x86 0x90, then padding
    expect(Array.from(cw.subarray(0, 4))).toEqual([0x40, 0x24, 0x86, 0x90]);
    expect(Array.from(cw.subarray(4, 8))).toEqual([0xec, 0x11, 0xec, 0x11]);
    expect(cw.length).toBe(16);
  });

  it('uses a 16-bit count from version 10', () => {
    const cw = encodeDataCodewords(new Uint8Array(200).fill(0x41), 10);
    expect(cw[0] >>> 4).toBe(0b0100);
    expect(((cw[0] & 0x0f) << 12) | (cw[1] << 4) | (cw[2] >>> 4)).toBe(200);
  });

  it('interleaves blocks of unequal length (version 8: 2×38 + 2×39)', () => {
    const data = Uint8Array.from({ length: 154 }, (_, i) => i);
    const out = interleaveWithEc(data, 8);
    expect(out.length).toBe(242);
    // first column: the first byte of each block
    expect(Array.from(out.subarray(0, 4))).toEqual([0, 38, 76, 115]);
    // after 38 columns only the two longer blocks still have a byte
    expect(Array.from(out.subarray(152, 154))).toEqual([114, 153]);
    expect(Array.from(out.subarray(154, 158))).toEqual([
      rsEncode(data.subarray(0, 38), 22)[0],
      rsEncode(data.subarray(38, 76), 22)[0],
      rsEncode(data.subarray(76, 115), 22)[0],
      rsEncode(data.subarray(115, 154), 22)[0],
    ]);
  });
});

describe('format and version information', () => {
  it('matches the standard table for level M, masks 0–7', () => {
    expect(Array.from({ length: 8 }, (_, m) => formatBits(m).toString(2).padStart(15, '0'))).toEqual([
      '101010000010010',
      '101000100100101',
      '101111001111100',
      '101101101001011',
      '100010111111001',
      '100000011001110',
      '100111110010111',
      '100101010100000',
    ]);
  });

  it('matches the standard version information for versions 7–10', () => {
    expect([7, 8, 9, 10].map(versionBits)).toEqual([0x07c94, 0x085bc, 0x09a99, 0x0a4d3]);
  });

  it('places alignment patterns where the standard says', () => {
    expect(alignmentPositions(1)).toEqual([]);
    expect(alignmentPositions(2)).toEqual([6, 18]);
    expect(alignmentPositions(6)).toEqual([6, 34]);
    expect(alignmentPositions(7)).toEqual([6, 22, 38]);
    expect(alignmentPositions(8)).toEqual([6, 24, 42]);
    expect(alignmentPositions(9)).toEqual([6, 26, 46]);
    expect(alignmentPositions(10)).toEqual([6, 28, 50]);
  });
});

// ───────────── whole symbols against independent encoders ─────────────
// Fixtures made in a throwaway Python venv:
//  - FIXED: python-qrcode 8.2, QRCode(error_correction=M, border=0, mask_pattern=mask),
//    data added as QRData(bytes, MODE_8BIT_BYTE), make(fit=True)
//  - AUTO: Nayuki qrcodegen 1.8.0, encode_segments([make_bytes(...)], MEDIUM, 1, 10, -1, False)
// Each is the module matrix, row by row, packed MSB first, base64.

const BASE = 'https://jl0711.github.io/jack-ai-studio/#/showcase/robotics-ops?checkin=';
const fill = (n: number) => Array.from({ length: n }, (_, i) => 'abcdefghijklmnopqrstuvwxyz0123456789-_'[(i * 7 + 3) % 38]).join('');
const CASES = [
  'HELLO WORLD',
  'Ironbark 0000',
  'https://example.com/a/' + fill(4),
  '签到成功：林小舟 18:27',
  'https://example.org/' + fill(30),
  BASE + 'K7Q2M9XD',
  BASE + fill(20),
  BASE + fill(40),
  BASE + fill(70),
  BASE + fill(100),
  BASE + fill(135),
  '训练签到 · Team 0000 · ' + fill(150),
  fill(213),
];

interface Fixture {
  case: number;
  mask: number;
  version: number;
  bits: string;
}

const FIXED: Fixture[] = [
  { case: 0, mask: 2, version: 1, bits: '/gv8EpBuurt1VduqrsFpB/qv4BQAvjPjC/ssw5zp+ci2woB0I/lI0FyvupEt1H4uskkEWc/riwA=' },
  { case: 1, mask: 5, version: 1, bits: '/jv8FVBurLt1xduirsEJB/qv4BgAgpZwZkG764WCEey93QBI4/ghUE1/um8d0YYun7cEUc/q8QA=' },
  { case: 2, mask: 1, version: 2, bits: '/oo/wTdQbq8rt0LF26Oi7BaRB/qq/gD3AKMCkoS2uueyU7SyUoChmwojDY8/35pwhbjfAvkAbkR/riowSnEboR+V0cJa61d3BOPw/oikgA==' },
  { case: 3, mask: 6, version: 3, bits: '/pG7/BZFUG66fLt0QXXbqDkuwTzNB/qqr+AGsACf3GS542VLBJ1+mkIpyE77W04Gj0cs7XKhRbsgQ/bir8whdPg8zlk9w8RHPGt//oBFLHP6SKowWW0Uuv6v5dagsq6YW1cEkn0f7tp+AA==' },
  { case: 4, mask: 3, version: 4, bits: '/u59P8FaFZBukFaLt1hxBdunIOrsEwLFB/qqqv4BFNMAt0B1pYQlTpvH5LBvb4DlWq2uAxzd6KcWqf8fAPix7X78f0U9agJPsfb+61KWxhMCaTHz00RkpNsLBPxjH766xWUTmvdj/ABU+MY/swXqEFai8eunZH+l1SFwpupoCcEEk/dx/tfsKgA=' },
  { case: 5, mask: 4, version: 5, bits: '/sw1W/wQ4/BQboLdart1HFL126i0H67BR4oRB/qqqq/gG12UAIu357fPTZBp56+O2sXh2c+Of27+hfl34JOmiGGrBS7XmhUcp/bSWAeHZST0i86dpbvuwJHY+CpjsbXosny/sprAvzU9z56NSJd1TpWXj20isUjEDbBa5WBS36kIbaVk+fqATZLsS/olpCoQSYnDHbrzLA/10De+2O6aMuqJBPTYaW/ttMkXgA==' },
  { case: 6, mask: 0, version: 6, bits: '/gM3MT/BQm3skG6cwYCrt0P62nXbqLXx8uwQwe7JB/qqqqr+AFz52wCqCe30iQBxx2JTQvVxOBS/q47+2jq89cbeW69r6uUtyFbh+verc9rdY/thVF4w/sXCBVHHrvCyg2COctLSBTH5udJJj1h0Fy9O7QMA5gEHzphKzmBNVqU82uZDMFnkO5AO/olp7ZcdaaVc1lNoWI2BPtjun5J2+amt3NmGPMXN+QBJJWbE/4NLCOrwStwskTus6hrPhdH1Z3Jy6iKZDH8EzyjpYv6nTtf5gA==' },
  { case: 7, mask: 7, version: 7, bits: '/jUMI8v8E7/LcpBuggmIJLt0kjVkNdukRP9nrsF7PHNBB/qqqqqv4A+vGPsAlrif2xUA7AqgrCd09YOzbhs6V/I+VTCjo82caCKHcGw65N9YI+IOCS5gaVU5813xUaNcxRXXZpsurS10NB5q5afh0Ab60/uX/CRglFRETGq864HqsRoLH4UZv8ovn7/MY6TozwVwprPPNiwDdiizlCblM91uXdwYi1gqM7474hJrOi+nljFzSsEzWHVUSGlUhKBC1t4SLsLzwgLR6Ymiwv/a+QB5dEQ0R/nPazUr0FxJFbkQul5f1p/F1JtpLnwulwngd3cEqNvLGA/sWw60qQA=' },
  { case: 8, mask: 2, version: 8, bits: '/l3FklC/wRnnAh3QbqaT42Rrt1bCHgcl26hyf2DC7BZDkctxB/qqqqqq/gGVhHmBAL4bf+Z8vii3KOfKFBX+uiwdsCa1nKdQIyV6IDgj6HFoydIWIWsf1zzQ3EcqRbSfpREfvP2UO7YkNjmrJDwho74WW6F6go0NPic3f/W6cZg7BqufOMHbf01vxp/r0Sjce0EbOtNupT+uBEnrF8JGC/fM+wq+f7eK09hYNPbhSlKx5GD4O/rPMjxhQGW5txidzldpIMIO7EUb30L5q+OO6JvWMVR4zyeFpvWQkz4lzoZV/aADVr/UBqkbTY1lve7gWGVVKbjiP1vzXf6AYHsXiEc/joCtPKtwXHrHdpEbqrg+UK/91NTwcOzW6pK/I6nJBKI7EQDB/ovpQXoDgA==' },
  { case: 9, mask: 5, version: 9, bits: '/nQmAr9j/BT48Q8zkG67Ll0sZLt1HE5dn9XboOg/+AYuwSuJRvFRB/qqqqqqr+ARPfGwsgCCwUD+XA5yij6EOxfbkpGy+E6koPKGTzUhgI0rRj2ciA0E02HF7vhuun4ZgZ1+BKi1fozu7O4cLS19CahIqjV2Kaj+7i3TN2dO6j8JuYcSLGff30HS7kwWZze3P/BZWJfR6GkcpjPa2vdCD6tC/u2vhEY2tFqnxmaju6s6wqBRTO0e6JH0/NsfkuP+Zjw5nwKTVK1Wz5ZCKKG4R/i0f+ir5ckWGk8oZ7qP+x8MC6UWPkvBOWhRIaEPdb0paqpM/ZC2OY6bqtPc2wgIp9lCCi2SBWbqjCadEst8TCuM6Ak876z3iwxcdQbuwCQNpWsnETESj7Hy/oBgwEU3PHv4CtK3yGoQQcyxshcYumzO+ozvjdIEYrip226Ke1069H8EYYhOTERf7I/eFaQqAA==' },
  { case: 10, mask: 1, version: 10, bits: '/teEqrqvP8E0SFEZlJBupCQxXN3Lt0RHGuqspdul50/yOtLsFJX7GRUxB/qqqqqqqv4ArWXFUfYAo15JfqidEpQI6CKs6qRRjTeSUBcSMgduu1e2I7J89m3tjtCZxlQg6mIqhe+hOjd3M1rIVXg5W9sbLi4ceo7MCECE0iYqLo9t2ISNM1MGuKyM6xUxM5X2AKXIuJKKrBtRaioqHYsarfBUMHuLu4mXU38aup46S+3YaRBBTihoqi3T/b7f02d/oR9eDHnr0YKqbfa7ifrGxqjDFuKMXD+DoP8TI/Oxxf8lP77jTqWbprz5kHSDssmm4ioNgW7AshVqFpNauNdb7wn5r6ALibUcQuG6uqIppF5UH2lDZts6oEANNzbCU8J+Qd6NUDT67ojqTlpkrMmAx3B5ua0LCP3zpp0pOgBI25YbbBhBLirvtpxvNE5SMOPzr17v0/NqAwmtP+nP+IBkDZFqJMZ/swe6pUBrcEstVHOXEbugfcv4qN/d0Phz+squwur+U20AdmcEbcyr83gA/sIyMcy+nIA=' },
  { case: 11, mask: 6, version: 9, bits: '/qKs568j/BfkGSlFkG69EuY9RLt0wDaBU1XbqUivrBouwRDAxCfRB/qqqqqqr+AO99HM+wCf78v9Kpy5ql2pN57KCMfbiW53VuofF6+iXp16hyx6/CkuO/Vd4fb9yDYINWpSIauE9EZWTook1c+4lp9iAaY95R2e1sIHc2RLqYXXfMfu3CJ/JqPui5TI+nvfsxINFWSLpWoAIt7Y/Ksr/836+4mvi0Ul3H53RHqlE+tTxroRgyMW6NEb+U2fneL5mMK6IZItYn67TRA3yxAgRi7IdU92SUJNWpc4g8LOd9fgNLUFWXlSiPjtvj2EsZ4uV3vqvRSmzluqLRjfuMcrSU9uPBtY36RqvrsxDCnIZxxNI5PV5bW3wNNBQwauwPgzkC/V4SWxP7HO+wBlZMV/vGP6Pc6j3WuQUrkRlIsfusuZ/Oz/3dQhxXhUK+6Kpu8DsX0EzaSGhiZf73ssGcMkAA==' },
  { case: 12, mask: 3, version: 10, bits: '/rifygVjP8FlFCU0lpBuj3JdZhrLt1ZaAOfOJdumvaP8OVLsEtChEh+RB/qqqqqqqv4BD8vEX8oAtzpX/iWgpaj7P+0E/ulYl0U+iS3x4RntEBWrZgrv5cIVxTRUAWzJSDij8b8BV/8M1KgAIrG7zRiWcoVjk4F4446ekI7QT4Jg8GQXb9SpWZRnhWsS151lAGuHPn7ypRg8OqmMP22XKAuSmzfKqPULeJPJ92AgY342IG4O3yDt5haz8TPP89t/SxNMXFY2sdSvz7q+Mar8xSmJE6qUVf9R+/jdS/labgygsUWj10uT4FWgk6iyxkMM/jOyxJQ3aU+Nxqppp/0r9KmmtdCVwSyCLfM4CpjBqp2lgoGosTji8YR7gVLWQptiucA5vi5KXzXczU14oIqWrcCzVBWwaGeoEx/8LgwXGGdvh8yNJqmGDp0gScPE+7fx0wr/0FLZAr4mf34g+YBoRTHP5sS/rWealf4rEFBrxFq/EdulP2v/ML/t1S75O4y0CutJahOTGoEE58KA1YHh/tc5gkG0cgA=' },
];

const AUTO: Fixture[] = [
  { case: 0, mask: 4, version: 1, bits: '/sv8EJBulLt1JduursFJB/qv4BMAi/fIhcPPzaXxiA+qswBXr/urUEuzutY10kbunHEEKA/v+oA=' },
  { case: 3, mask: 4, version: 3, bits: '/uB7/BJFUG6dYLt196XbrWwuwWehB/qqr+AZTwCLv+/LqkHZbrfUMWK7gW88Rz+Gj0cv+QNmUyBN9aO3+p9MwiNErdcEODu4z+VH/QBXZFf64iqQQEkWuo9v/dKgsq6fRycEJKZ/648rAA==' },
  { case: 5, mask: 2, version: 5, bits: '/gspK/wS2xPQbqzliLt1bZXl26zF2K7BZAQpB/qqqq/gHEHlAL5w+8Pkw6iKaYyA4iZuwb5JYxni9D5r2HAosIOb5qDva5IA1jGjnxv2pqrMaEC+q4MNT4mpPzYUrcQvrkRcPKIij9az928KVOayP1KL/q6siatKLr5iBu9Krm4UGrkVPv6AbhzUa/jGKirwXpWzGrq0MH+11g9dVu60CgkHBIUfdR/pxQ4LgA==' },
  { case: 7, mask: 2, version: 7, bits: '/laCGwv8EnjXApBuvnhPNLt1qtbqNduoNfh7rsF8JEKBB/qqqqqv4BizGTwAvklfx2PmxOkulMTohESvH9z5S4P5SUMtmy4SUOSbAasmlK6fP5PJEY3uUba3gprtIGRDyWQQeurglc76DP1ylGD9ocf9z/pQ+ERurHfMdaugqkbqzRvNE/Uej6mvp1/AAmP0vsJ3usIIKl2JTss9rMH5QhpyLCzflyntL1212vHlC6i75/ZvVrD0RASSYIravEPCpxkOXwTw3nMW9fms+vxU+YBlBEMsd/gIa0Tq0F/HHVseuplPp1/d1OquMg3ur+puT5UE2RzXac/rR39ztQA=' },
];

function unpack(b64: string, size: number): Uint8Array {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return Uint8Array.from({ length: size * size }, (_, i) => (bytes[i >>> 3] >>> (7 - (i & 7))) & 1);
}

function differing(a: Uint8Array, b: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}

describe('whole symbols', () => {
  it('cover versions 1–10 and all eight masks', () => {
    expect(new Set(FIXED.map((f) => f.version)).size).toBe(10);
    expect(new Set(FIXED.map((f) => f.mask)).size).toBe(8);
  });

  it.each(FIXED)('case $case (version $version, mask $mask) matches python-qrcode module for module', (f) => {
    const qr = encodeQr(CASES[f.case], { mask: f.mask });
    expect(qr.version).toBe(f.version);
    expect(qr.size).toBe(17 + 4 * f.version);
    expect(differing(qr.modules, unpack(f.bits, qr.size))).toBe(0);
  });

  it.each(AUTO)('case $case picks the same mask ($mask) and matrix as qrcodegen', (f) => {
    const qr = encodeQr(CASES[f.case]);
    expect(qr.mask).toBe(f.mask);
    expect(differing(qr.modules, unpack(f.bits, qr.size))).toBe(0);
  });

  it('chooses the mask with the lowest penalty', () => {
    const text = CASES[5];
    const scores = Array.from({ length: 8 }, (_, m) => {
      const qr = encodeQr(text, { mask: m });
      return penaltyScore(qr.modules, qr.size);
    });
    expect(encodeQr(text).mask).toBe(scores.indexOf(Math.min(...scores)));
  });

  it('fits the check-in link (8-character token) in version 5', () => {
    const qr = encodeQr(BASE + 'K7Q2M9XD');
    expect(qr.version).toBe(5);
    expect(qr.size).toBe(37);
  });

  it('draws every dark module once in the SVG path, inside a 4-module quiet zone', () => {
    const qr = encodeQr('HELLO WORLD', { mask: 2 });
    const path = qrSvgPath(qr);
    let covered = 0;
    let minX = Infinity;
    for (const m of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)) {
      covered += Number(m[3]);
      minX = Math.min(minX, Number(m[1]));
      expect(m[3]).toBe(m[4]);
    }
    expect(covered).toBe(qr.modules.reduce((a, b) => a + b, 0));
    expect(minX).toBe(4); // the top-left finder starts at column 0 + margin
    expect(path.startsWith('M4 4h7v1h-7z')).toBe(true);
  });
});
