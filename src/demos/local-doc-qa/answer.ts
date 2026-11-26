// The answer is extractive: it quotes the one to three sentences that best
// cover the question, each with a citation to its file and page. Nothing is
// written or paraphrased, so the answer can't say anything the documents
// don't. (The real product has a local model write the answer from the same
// passages, and also declines when nothing relevant is found.)

import { splitSentences, type Sentence, type Span } from './chunk';
import { coverage, hasAnswerType, type AnalyzedQuery, type AnswerType, type Unit } from './query';
import { hasCjk, scanText } from './tokenize';
import type { Answer, AnswerStatus, Citation, Hit, Quote, SourceDoc } from './types';

const sentenceCache = new WeakMap<SourceDoc, Sentence[][]>();

/** Sentences of one page, with "…; …" kept together (cached per document). */
export function pageSentences(doc: SourceDoc, page: number): Sentence[] {
  let perDoc = sentenceCache.get(doc);
  if (!perDoc) {
    perDoc = [];
    sentenceCache.set(doc, perDoc);
  }
  let list = perDoc[page];
  if (!list) {
    list = splitSentences(doc.pages[page] ?? '', false);
    perDoc[page] = list;
  }
  return list;
}

export function termSet(text: string): Set<string> {
  const set = new Set<string>();
  scanText(text, (term) => set.add(term));
  return set;
}

/** Credit for a term in a sentence: in the sentence itself, or only in its section title. */
type Credit = (term: string) => number;
const HEADING_CREDIT = 0.8;

function creditFor(terms: Set<string>, heading: Set<string>): Credit {
  return (t) => (terms.has(t) ? 1 : heading.has(t) ? HEADING_CREDIT : 0);
}

// A sentence starting like this usually finishes the thought of the one before it.
const CONTINUATION =
  /^(?:但|但是|不过|如果|若|超过|超出|否则|另外|此外|其中|例外|注意|同时|并且|且|即|当天|未经|逾期)|^(?:However|But|If|Unless|Except|Otherwise|Note|Anything|Claims|Beyond|Above|After|Same-day|Where)\b/i;

const LIST_MARKER = /^\s*(?:\(?[0-9a-zA-Z]{1,2}[.)、．]\s*|[一二三四五六七八九十]+[、.．]\s*|[-•·*]\s+)/;

// A sentence opening like this leans on the one before it.
const ANAPHORA = /^(?:It|Its|This|That|These|Those|They|Then|Once|Otherwise|Such)\b|^(?:该|此|这|其|否则|然后|同时|并|但)/;

/** Numbers of two or more digits in a sentence (list numbering ignored). */
function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  scanText(text.replace(LIST_MARKER, ''), (term, kind) => {
    if (kind === 'num' && term.replace('.', '').length >= 2) out.add(term);
  });
  return out;
}

function sameParagraph(pageText: string, a: Span, b: Span): boolean {
  return !pageText.slice(a.end, b.start).includes('\n');
}

interface Candidate {
  hit: Hit;
  s: Sentence;
  text: string;
  credit: Credit;
  score: number;
}

/** Bonus for a sentence that holds the kind of value asked for ("30 天", "CNY 600"). */
function typeBonus(type: AnswerType, text: string): number {
  if (!type) return 0;
  if (hasAnswerType(text, type)) return 0.15;
  return /\d/.test(text) ? 0.05 : 0;
}

/** Scores one sentence for the question (shared by the answer and the results list). */
function scoreSentence(q: AnalyzedQuery, text: string, credit: Credit, s: Sentence, position: number): number {
  let score = coverage(q.units, credit).ratio;
  score += typeBonus(q.answerType, text);
  if (/[：:]$/.test(text)) score += 0.04; // a lead-in to the list that answers
  if (s.heading) score -= 0.6;
  if (text.length < 6) score -= 0.3;
  return score - position * 0.005;
}

const headingCache = new Map<string, Set<string>>();
function headingTerms(heading: string): Set<string> {
  let set = headingCache.get(heading);
  if (!set) {
    set = termSet(heading);
    if (headingCache.size > 500) headingCache.clear();
    headingCache.set(heading, set);
  }
  return set;
}

function sentencesOf(hit: Pick<Hit, 'doc' | 'page' | 'passage' | 'heading'>, q: AnalyzedQuery): Array<{ s: Sentence; text: string; credit: Credit; score: number }> {
  const pageText = hit.doc.pages[hit.page];
  const heading = headingTerms(hit.heading);
  const out: Array<{ s: Sentence; text: string; credit: Credit; score: number }> = [];
  let position = 0;
  for (const s of pageSentences(hit.doc, hit.page)) {
    if (s.end <= hit.passage.start || s.start >= hit.passage.end) continue;
    const text = pageText.slice(s.start, s.end);
    const credit = creditFor(termSet(text), heading);
    out.push({ s, text, credit, score: scoreSentence(q, text, credit, s, position++) });
  }
  return out;
}

/** The sentence of a passage that best matches the question (for the results list snippet). */
export function bestSentence(hit: Pick<Hit, 'doc' | 'page' | 'passage' | 'heading'>, q: AnalyzedQuery): Span {
  let best: Span = hit.passage;
  let bestScore = -Infinity;
  for (const c of sentencesOf(hit, q)) {
    if (c.score > bestScore) {
      bestScore = c.score;
      best = { start: c.s.start, end: c.s.end };
    }
  }
  return best;
}

/** Builds the quoted answer from the ranked passages. */
export function buildAnswer(hits: Hit[], q: AnalyzedQuery, status: AnswerStatus): Answer {
  if (status !== 'ok' || !hits.length) return { status: status === 'ok' ? 'none' : status, quotes: [], citations: [] };
  const top = hits[0];
  const pool = hits.slice(0, 3).filter((h, i) => i === 0 || h.score >= top.score * 0.5);

  const seen = new Set<string>();
  const cands: Candidate[] = [];
  for (const hit of pool) {
    for (const c of sentencesOf(hit, q)) {
      const key = `${hit.doc.id}:${hit.page}:${c.s.start}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cands.push({ hit, ...c, score: c.score + 0.25 * (hit.score / top.score) });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  let best = cands.find((c) => !c.s.heading);
  if (!best) return { status: 'none', quotes: [], citations: [] };
  // The question names a section ("What does the Shift swaps section say?", "保修期多长"):
  // quote the section from its first sentence rather than a line from its middle.
  const head = headingTerms(top.heading);
  if (top.heading && coverage(q.units, (t) => (head.has(t) ? 1 : 0)).ratio >= 0.9) {
    const opening = cands.filter((c) => c.hit === top && !c.s.heading).sort((a, b) => a.s.start - b.s.start)[0];
    if (opening) best = opening;
  }

  interface Pick {
    hit: Hit;
    s: Sentence;
    credit: Credit;
  }
  const chosen: Pick[] = [{ hit: best.hit, s: best.s, credit: best.credit }];
  // Up to three sentences; a lead-in ending in a colon may bring its list lines with it.
  const introducesList = /[：:]$/.test(best.text);
  const maxPicks = introducesList ? 7 : 3;
  const limit = (hasCjk(best.text) ? 220 : 520) * (introducesList ? 1.25 : 1);
  let total = best.text.length;
  const isChosen = (hit: Hit, s: Sentence) => chosen.some((c) => c.hit.doc === hit.doc && c.hit.page === hit.page && c.s.start === s.start);
  const tryAdd = (hit: Hit, s: Sentence): boolean => {
    if (chosen.length >= maxPicks || isChosen(hit, s)) return false;
    const text = hit.doc.pages[hit.page].slice(s.start, s.end);
    if (total + text.length > limit) return false;
    chosen.push({ hit, s, credit: creditFor(termSet(text), headingTerms(hit.heading)) });
    total += text.length;
    return true;
  };

  const pageText = best.hit.doc.pages[best.hit.page];
  const pageS = pageSentences(best.hit.doc, best.hit.page);
  const idx = pageS.findIndex((x) => x.start === best.s.start);
  const textOf = (s: Sentence) => pageText.slice(s.start, s.end);
  const next = pageS[idx + 1];
  const nextInParagraph = next && !next.heading && sameParagraph(pageText, best.s, next) ? next : undefined;
  const prev = pageS[idx - 1];
  const prevInParagraph = prev && !prev.heading && sameParagraph(pageText, prev, best.s) ? prev : undefined;

  // "Report it with the button…" needs the sentence before it ("If an email looks suspicious…"):
  // add it when the quote leans on it, or when it covers a part of the question the quote misses.
  if (!introducesList && prevInParagraph) {
    const prevTerms = termSet(textOf(prevInParagraph));
    const own = termSet(best.text);
    const alone = coverage(q.units, (t) => (own.has(t) ? 1 : 0)).ratio;
    const together = coverage(q.units, (t) => (own.has(t) || prevTerms.has(t) ? 1 : 0)).ratio;
    if (ANAPHORA.test(best.text) || together - alone >= 0.15) tryAdd(best.hit, prevInParagraph);
  }

  if (introducesList) {
    // "The limits are as follows:" — the list after it is the answer (and a closing "anything above…").
    for (let k = idx + 1; k < pageS.length && k <= idx + 7; k++) {
      const s = pageS[k];
      if (s.heading) break;
      const isItem = LIST_MARKER.test(textOf(s));
      if (!isItem && !CONTINUATION.test(textOf(s))) break;
      if (!tryAdd(best.hit, s) || !isItem) break;
    }
  } else {
    if (nextInParagraph && CONTINUATION.test(textOf(nextInParagraph))) tryAdd(best.hit, nextInParagraph);
    // A later sentence repeating the same number ("within 30 days" → "after 30 days…") brings the exception.
    const nums = numbersIn(best.text);
    if (nums.size) {
      for (let k = idx + 1; k < pageS.length && k <= idx + 4; k++) {
        const s = pageS[k];
        if (s.heading) break;
        if (isChosen(best.hit, s) || ![...numbersIn(textOf(s))].some((n) => nums.has(n))) continue;
        if (tryAdd(best.hit, s)) {
          const after = pageS[k + 1];
          if (after && !after.heading && sameParagraph(pageText, s, after) && CONTINUATION.test(textOf(after))) tryAdd(best.hit, after);
        }
        break;
      }
    }
    // Nothing else to add: the rest of the paragraph usually completes a short rule.
    if (chosen.length === 1 && nextInParagraph && best.text.length < limit * 0.55) tryAdd(best.hit, nextInParagraph);
  }

  // A two-part question ("年假有几天？没休完怎么办？"): make sure each part has its best sentence.
  if (q.clauses > 1) {
    for (let clause = 0; clause < q.clauses; clause++) {
      const units: Unit[] = q.units.filter((u) => u.clause === clause);
      if (!units.length) continue;
      const type = q.clauseTypes[clause] ?? null;
      const clauseScore = (credit: Credit, text: string) => coverage(units, credit).ratio + typeBonus(type, text);
      const have = Math.max(...chosen.map((c) => clauseScore(c.credit, c.hit.doc.pages[c.hit.page].slice(c.s.start, c.s.end))));
      let pick: Candidate | null = null;
      let pickScore = have + 0.1;
      for (const c of cands) {
        if (c.s.heading || isChosen(c.hit, c.s) || coverage(units, c.credit).ratio < 0.5) continue;
        const sc = clauseScore(c.credit, c.text);
        // On a tie, the earlier sentence: rules come first, details and exceptions after.
        const earlier = pick !== null && c.hit.doc === pick.hit.doc && c.hit.page === pick.hit.page && c.s.start < pick.s.start;
        if (sc > pickScore + 1e-9 || (pick && Math.abs(sc - pickScore) <= 1e-9 && earlier)) {
          pickScore = sc;
          pick = c;
        }
      }
      if (pick) tryAdd(pick.hit, pick.s);
    }
  }

  // Group by page (best page first), keep reading order, merge neighbouring sentences.
  const groups = new Map<string, Pick[]>();
  for (const c of chosen) {
    const key = `${c.hit.doc.id}#${c.hit.page}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const quotes: Quote[] = [];
  const citations: Citation[] = [];
  for (const picks of groups.values()) {
    picks.sort((a, b) => a.s.start - b.s.start);
    const { doc, page } = picks[0].hit;
    const text = doc.pages[page];
    const n = citations.length + 1;
    const spans: Span[] = [];
    for (const p of picks) {
      const last = spans[spans.length - 1];
      if (last && text.slice(last.end, p.s.start).trim() === '') last.end = p.s.end;
      else spans.push({ start: p.s.start, end: p.s.end });
    }
    const home =
      hits.find((h) => h.doc === doc && h.page === page && h.passage.start <= spans[0].start && h.passage.end >= spans[0].start) ??
      picks[0].hit;
    citations.push({ n, doc, page, passage: home.passage, quoted: spans });
    for (const span of spans) quotes.push({ doc, page, span, cite: n });
  }
  return { status: 'ok', quotes, citations };
}

// ---------- highlighting ----------

/** Spans of `text` (offset by `offset`) that match the question, merged where they touch. */
export function markSpans(text: string, offset: number, q: AnalyzedQuery): Span[] {
  const raw: Span[] = [];
  scanText(text, (term, kind, start, end) => {
    if (kind === 'uni' ? q.uniMarks.has(term) : q.marks.has(term)) raw.push({ start: offset + start, end: offset + end });
  });
  raw.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Span[] = [];
  for (const s of raw) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}

export interface Segment {
  text: string;
  start: number;
  mark: boolean;
  quote: boolean;
}

/**
 * Cuts `text` (which starts at `offset` in the page) into pieces that are
 * plain, matched (marks) and/or quoted, for rendering highlights.
 */
export function segments(text: string, offset: number, marks: Span[], quotes: Span[] = []): Segment[] {
  const end = offset + text.length;
  const cuts = new Set<number>([offset, end]);
  for (const s of [...marks, ...quotes]) {
    if (s.end <= offset || s.start >= end) continue;
    cuts.add(Math.max(offset, s.start));
    cuts.add(Math.min(end, s.end));
  }
  const points = [...cuts].sort((a, b) => a - b);
  const inside = (list: Span[], a: number, b: number) => list.some((s) => s.start <= a && s.end >= b);
  const out: Segment[] = [];
  for (let k = 0; k + 1 < points.length; k++) {
    const a = points[k];
    const b = points[k + 1];
    if (b <= a) continue;
    out.push({ text: text.slice(a - offset, b - offset), start: a, mark: inside(marks, a, b), quote: inside(quotes, a, b) });
  }
  return out;
}
