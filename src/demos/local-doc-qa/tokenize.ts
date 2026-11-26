// Tokenizer for the browser demo. No dictionary and no model:
//  - English: lowercase words, light stemming, stopwords dropped. "not cover"
//    also yields a "not:cover" token, so "what isn't covered" finds the
//    exclusions page rather than every page that says "covered".
//  - Chinese (and other CJK scripts): overlapping character bigrams plus single
//    characters, so 年假 matches without knowing where words start and end.
//  - Numbers stay tokens ("2,000" → "2000", "45.00" → "45"), so amounts,
//    fault codes and phone extensions match exactly.

export type TermKind = 'bi' | 'uni' | 'word' | 'num' | 'neg';
export type Emit = (term: string, kind: TermKind, start: number, end: number) => void;

/** Full-width ASCII (Ａ, ６, ＃) and the ideographic space count as plain ASCII. */
export function foldCode(c: number): number {
  if (c >= 0xff01 && c <= 0xff5e) return c - 0xfee0;
  if (c === 0x3000) return 0x20;
  return c;
}

/** Han characters, kana and hangul: scripts written without spaces between words. */
export function isCjk(c: number): boolean {
  return (
    (c >= 0x4e00 && c <= 0x9fff) ||
    (c >= 0x3400 && c <= 0x4dbf) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0x3040 && c <= 0x30ff) ||
    (c >= 0xac00 && c <= 0xd7af)
  );
}

function isDigit(c: number): boolean {
  return c >= 48 && c <= 57;
}

function isLetter(c: number): boolean {
  return (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 0xc0 && c <= 0x24f && c !== 0xd7 && c !== 0xf7);
}

// Some PDF fonts map characters to look-alike radicals: "⼀" (Kangxi radical one) for 一,
// "⻔" (simplified radical gate) for 门. They look right but match nothing, so they are
// mapped back. Kangxi radicals have a Unicode compatibility mapping; the simplified
// radical forms that are also whole characters don't, hence this short table.
const RADICAL_CHARS = new Map<string, string>(
  (
    [
      [0x2ea0, '民'], [0x2ec5, '见'], [0x2ec6, '角'], [0x2ec9, '贝'], [0x2ecb, '车'], [0x2ed3, '长'], [0x2ed4, '门'],
      [0x2ed9, '韦'], [0x2eda, '页'], [0x2edb, '风'], [0x2edc, '飞'], [0x2ee2, '马'], [0x2ee5, '鱼'], [0x2ee6, '鸟'],
      [0x2ee7, '卤'], [0x2ee8, '麦'], [0x2ee9, '黄'], [0x2eea, '黾'], [0x2eec, '齐'], [0x2eee, '齿'], [0x2ef0, '龙'],
    ] as Array<[number, string]>
  ).map(([cp, ch]) => [String.fromCharCode(cp), ch]),
);

/** Replaces radical look-alikes and compatibility ideographs with the normal characters. */
export function normalizeCjkForms(text: string): string {
  let out = '';
  let changed = false;
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    let next = ch;
    if ((c >= 0x2f00 && c <= 0x2fdf) || (c >= 0xf900 && c <= 0xfaff)) next = ch.normalize('NFKC');
    else if (c >= 0x2e80 && c <= 0x2eff) next = RADICAL_CHARS.get(ch) ?? ch.normalize('NFKC');
    if (next !== ch) changed = true;
    out += next;
  }
  return changed ? out : text;
}

export function hasCjk(text: string): boolean {
  for (let i = 0; i < text.length; i++) if (isCjk(text.charCodeAt(i))) return true;
  return false;
}

// Words that carry no meaning for search, on both sides (documents and questions).
export const STOPWORDS = new Set(
  (
    'a about above after again against all also am an and any are aren as at be because been before being below between both but by ' +
    'can cannot could couldn did didn do does doesn doing don down during each either etc few for from further had hadn has hasn have ' +
    'haven having he her here hers herself him himself his how i if in into is isn it its itself just let ll me more most must mustn my ' +
    'myself no nor not now of off on once only or other ought our ours ourselves out over own per re same shall shan she should ' +
    'shouldn so some such than that the their theirs them themselves then there these they this those through thus to too under ' +
    'until up upon us ve very via was wasn we were weren what when where whether which while who whom whose why will with within ' +
    'without won would wouldn yes yet you your yours yourself yourselves s t d m'
  ).split(' '),
);

/** Words that turn the next content word around: "not covered", "isn't reimbursed". */
const NEGATORS = new Set(['not', 'no', 'never', 'without', 'cannot', 'nor']);

// Forms the light stemmer can't reach (British doubling, a few irregular verbs):
// mapped to the base word, which is then stemmed like any other.
const BASE_FORMS: Record<string, string> = {
  travelled: 'travel',
  travelling: 'travel',
  traveller: 'travel',
  cancelled: 'cancel',
  cancelling: 'cancel',
  labelled: 'label',
  used: 'use',
  uses: 'use',
  using: 'use',
  paid: 'pay',
  made: 'make',
  sent: 'send',
  given: 'give',
};

function hasVowel(s: string): boolean {
  return /[aeiouy]/.test(s);
}

/** Drops one letter of a final double consonant ("submitt" → "submit"), except ll/ss/zz. */
function undouble(w: string): string {
  const n = w.length;
  if (n >= 3 && w[n - 1] === w[n - 2] && !'aeioulsz'.includes(w[n - 1])) return w.slice(0, -1);
  return w;
}

/**
 * A light English stemmer: enough to make "reimbursed", "reimbursement" and
 * "reimbursable" meet at "reimburs", or "policies" and "policy" at "policy".
 * Both the documents and the question go through it, so the stems only have
 * to agree with each other, not be real words.
 */
export function stem(word: string): string {
  let w = BASE_FORMS[word] ?? word;
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith('sses')) w = w.slice(0, -2);
  else if (/(?:x|ch|sh|z)es$/.test(w)) w = w.slice(0, -2);
  else if (w.endsWith('s') && !/(?:ss|us|is)$/.test(w)) w = w.slice(0, -1);

  // After "-ed"/"-ing" the final "e" is already gone ("agreed" → "agre", like "agree").
  let inflected = false;
  if (w.endsWith('ied') && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith('ed') && w.length > 4 && hasVowel(w.slice(0, -2))) {
    w = undouble(w.slice(0, -2));
    // "exceeded" → "exceed" → "exce", like "exceed" itself
    if (w.endsWith('eed')) w = w.slice(0, -2);
    inflected = true;
  } else if (w.endsWith('ing') && w.length > 5 && hasVowel(w.slice(0, -3))) {
    w = undouble(w.slice(0, -3));
    inflected = true;
  }

  if (w.endsWith('ization') && w.length > 10) w = `${w.slice(0, -7)}iz`;
  else if (w.endsWith('ational') && w.length > 10) w = `${w.slice(0, -7)}ate`;
  else if (w.endsWith('ation') && w.length > 8) w = `${w.slice(0, -5)}ate`;
  else {
    for (const suffix of ['ement', 'ment', 'ness', 'able', 'ible', 'ful', 'al', 'ly']) {
      if (w.endsWith(suffix) && w.length - suffix.length >= 4) {
        w = w.slice(0, -suffix.length);
        if (suffix === 'ement') w += 'e';
        break;
      }
    }
  }
  if (!inflected && w.length >= 4 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

function deaccent(s: string): string {
  return /[^\x00-\x7f]/.test(s) ? s.normalize('NFD').replace(/\p{M}/gu, '') : s;
}

/** "2,000" → ["2000"], "12.50" → ["12.5"], "1,2" → ["1", "2"]. */
export function normalizeNumber(raw: string): string[] {
  let s = raw;
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (s.includes(',')) return s.split(',').filter(Boolean).flatMap(normalizeNumber);
  if (/^\d+\.\d+$/.test(s)) s = s.replace(/\.?0+$/, '');
  return s ? [s] : [];
}

// Single characters too common to be worth indexing on their own (bigrams keep them).
const SKIP_UNIGRAM = new Set(['的', '了', '和', '是', '在']);

/**
 * Walks `text` once and reports every token with its position, so matches can
 * be highlighted in the original text later. `kinds` limits what is reported.
 */
export function scanText(text: string, emit: Emit): void {
  const n = text.length;
  let i = 0;
  let negWindow = 0; // content words left that a preceding "not" applies to
  let prevAlnum: { raw: string; start: number; end: number; letters: boolean } | null = null;

  while (i < n) {
    const c = foldCode(text.charCodeAt(i));

    if (isCjk(c)) {
      let j = i + 1;
      while (j < n && isCjk(text.charCodeAt(j))) j++;
      for (let k = i; k < j; k++) {
        const ch = text[k];
        if (!SKIP_UNIGRAM.has(ch)) emit(ch, 'uni', k, k + 1);
        if (k + 1 < j) emit(text.slice(k, k + 2), 'bi', k, k + 2);
      }
      negWindow = 0;
      prevAlnum = null;
      i = j;
      continue;
    }

    if (isLetter(c) || isDigit(c)) {
      let j = i;
      let raw = '';
      let letters = false;
      let digits = false;
      while (j < n) {
        const d = foldCode(text.charCodeAt(j));
        if (isLetter(d)) {
          raw += String.fromCharCode(d);
          letters = true;
          j++;
        } else if (isDigit(d)) {
          raw += String.fromCharCode(d);
          digits = true;
          j++;
        } else if (
          (d === 0x2e || d === 0x2c) &&
          digits &&
          isDigit(raw.charCodeAt(raw.length - 1)) &&
          j + 1 < n &&
          isDigit(foldCode(text.charCodeAt(j + 1)))
        ) {
          raw += String.fromCharCode(d);
          j++;
        } else break;
      }
      const start = i;
      const end = j;
      // Contractions: "isn't" negates; "'s", "'re", "'ll" are dropped.
      let negatedByContraction = false;
      const ap = j < n ? text.charCodeAt(j) : 0;
      if ((ap === 0x27 || ap === 0x2019) && letters && !digits) {
        const tail = /^[a-z]+/i.exec(text.slice(j + 1, j + 4))?.[0].toLowerCase() ?? '';
        if (tail === 't') negatedByContraction = true;
        if (['t', 's', 're', 'll', 've', 'd', 'm'].includes(tail)) j += 1 + tail.length;
      }

      if (letters && !digits) {
        const lower = deaccent(raw.toLowerCase());
        if (negatedByContraction || NEGATORS.has(lower)) {
          negWindow = 3;
        } else if (STOPWORDS.has(lower) && raw !== 'IT') {
          if (negWindow > 0) negWindow--;
        } else {
          const s = stem(lower);
          emit(s, 'word', start, end);
          if (negWindow > 0) {
            emit(`not:${s}`, 'neg', start, end);
            negWindow = 0;
          }
        }
      } else if (digits && !letters) {
        for (const num of normalizeNumber(raw)) emit(num, 'num', start, end);
        // "SC-22" also matches a question that writes "SC22".
        if (prevAlnum?.letters && prevAlnum.end + 1 === start && text[prevAlnum.end] === '-') {
          emit(`${prevAlnum.raw.toLowerCase()}${raw}`, 'word', prevAlnum.start, end);
        }
      } else {
        const lower = raw.toLowerCase();
        emit(lower, 'word', start, end);
        // "380V" is also "380"; "E03" stays one token.
        const lead = /^\d+(?:\.\d+)?/.exec(lower)?.[0];
        if (lead) for (const num of normalizeNumber(lead)) emit(num, 'num', start, start + lead.length);
      }
      prevAlnum = { raw, start, end, letters: letters && !digits };
      i = j;
      continue;
    }

    // Spaces and hyphens keep a pending "not"; other punctuation ends it.
    if (c !== 0x20 && c !== 0x2d && c !== 0x09) negWindow = 0;
    if (c !== 0x2d) prevAlnum = null;
    i++;
  }
}

/** Tokens of `text` as a list (tests and small strings). */
export function tokenize(text: string): Array<{ term: string; kind: TermKind; start: number; end: number }> {
  const out: Array<{ term: string; kind: TermKind; start: number; end: number }> = [];
  scanText(text, (term, kind, start, end) => out.push({ term, kind, start, end }));
  return out;
}

/** Number of "units" for BM25 length: one per CJK character, one per word or number. */
export function textUnits(text: string): number {
  let units = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const c = foldCode(text.charCodeAt(i));
    if (isCjk(c)) {
      units++;
      inWord = false;
    } else if (isLetter(c) || isDigit(c)) {
      if (!inWord) units++;
      inWord = true;
    } else inWord = false;
  }
  return units;
}

/** True when most letters are CJK (decides which average length BM25 compares against). */
export function mostlyCjk(text: string): boolean {
  let cjk = 0;
  let latin = 0;
  for (let i = 0; i < text.length; i++) {
    const c = foldCode(text.charCodeAt(i));
    if (isCjk(c)) cjk++;
    else if (isLetter(c)) latin++;
  }
  return cjk * 3 >= latin;
}
