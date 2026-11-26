// The search engine: passages are tokenized once into a compact index
// (term ids + frequencies in typed arrays, so a few hundred pages stay light on
// a phone), then each question is scored with BM25 and re-ranked by how much of
// the question a passage covers.

import { bestSentence, buildAnswer, termSet } from './answer';
import { chunkPage } from './chunk';
import { analyzeQuery, coverage, hasAnswerType, idf, unitCredit, type AnalyzedQuery } from './query';
import { isCjk, mostlyCjk, scanText, textUnits } from './tokenize';
import type { AnswerStatus, Hit, QaResult, SourceDoc } from './types';

const K1 = 1.2;
const B = 0.75;
/** Weight of a term that only appears in the passage's section title or the document title. */
const CONTEXT_TF = 0.4;
/** Below this share of the question covered, the demo says the documents don't answer it. */
export const MIN_COVERAGE = 0.5;
/** A passage whose section title matches the question is likely the section that answers it. */
const HEADING_BOOST = 0.3;

interface Rec {
  doc: SourceDoc;
  page: number;
  start: number;
  end: number;
  heading: string;
  len: number;
  cjk: boolean;
  ids: Uint32Array;
  tfs: Float32Array;
}

interface Corpus {
  recs: Rec[];
  df: Uint32Array;
  /** Postings in CSR layout: entries of term t are at [offsets[t], offsets[t + 1]). */
  offsets: Uint32Array;
  postRec: Uint32Array;
  postTf: Float32Array;
  avgCjk: number;
  avgLatin: number;
  nCjk: number;
  nLatin: number;
}

export interface LibraryStats {
  docs: number;
  /** Pages of documents with real pages. */
  pages: number;
  /** Parts of documents the demo had to cut up itself (no page information). */
  parts: number;
  passages: number;
  chars: number;
}

/** Waits for the browser to paint and handle input before continuing a long job. */
export function yieldToMain(): Promise<void> {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (s?.yield) return s.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const headingSets = new Map<string, Set<string>>();
function headingSet(heading: string): Set<string> {
  let set = headingSets.get(heading);
  if (!set) {
    set = termSet(heading);
    if (headingSets.size > 2000) headingSets.clear();
    headingSets.set(heading, set);
  }
  return set;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export class Engine {
  private vocab = new Map<string, number>();
  private entries = new Map<string, Rec[]>();
  private docsById = new Map<string, SourceDoc>();
  private active: string[] = [];
  private corpus: Corpus | null = null;

  private termId(term: string): number {
    let id = this.vocab.get(term);
    if (id === undefined) {
      id = this.vocab.size;
      this.vocab.set(term, id);
    }
    return id;
  }

  private record(doc: SourceDoc, page: number, start: number, end: number, heading: string): Rec {
    const text = doc.pages[page].slice(start, end);
    const tf = new Map<number, number>();
    scanText(text, (term) => {
      const id = this.termId(term);
      tf.set(id, (tf.get(id) ?? 0) + 1);
    });
    const context = (s: string) =>
      scanText(s, (term) => {
        const id = this.termId(term);
        if (!tf.has(id)) tf.set(id, CONTEXT_TF);
      });
    if (heading) context(heading);
    context(doc.title.replace(/\.(?:pdf|docx|txt|md|markdown)$/i, ''));
    const ids = Uint32Array.from(tf.keys()).sort();
    const tfs = new Float32Array(ids.length);
    for (let k = 0; k < ids.length; k++) tfs[k] = tf.get(ids[k]) ?? 0;
    return { doc, page, start, end, heading, len: Math.max(1, textUnits(text)), cjk: mostlyCjk(text), ids, tfs };
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  /** Passages a document was cut into. */
  passageCount(id: string): number {
    return this.entries.get(id)?.length ?? 0;
  }

  doc(id: string): SourceDoc | undefined {
    return this.docsById.get(id);
  }

  /** Indexes a document at once (the small sample library). */
  addDoc(doc: SourceDoc): void {
    const recs: Rec[] = [];
    doc.pages.forEach((text, page) => {
      for (const p of chunkPage(text)) recs.push(this.record(doc, page, p.start, p.end, p.heading));
    });
    this.entries.set(doc.id, recs);
    this.docsById.set(doc.id, doc);
    this.corpus = null;
  }

  /** Indexes a big document in slices, giving the page a chance to repaint in between. */
  async addDocAsync(doc: SourceDoc, opts: { cancelled?: () => boolean; onProgress?: (done: number, total: number) => void } = {}): Promise<boolean> {
    const recs: Rec[] = [];
    let last = now();
    for (let page = 0; page < doc.pages.length; page++) {
      for (const p of chunkPage(doc.pages[page])) recs.push(this.record(doc, page, p.start, p.end, p.heading));
      if (now() - last > 12) {
        opts.onProgress?.(page + 1, doc.pages.length);
        await yieldToMain();
        last = now();
        if (opts.cancelled?.()) return false;
      }
    }
    this.entries.set(doc.id, recs);
    this.docsById.set(doc.id, doc);
    this.corpus = null;
    return true;
  }

  removeDoc(id: string): void {
    this.entries.delete(id);
    this.docsById.delete(id);
    this.corpus = null;
  }

  /** Which documents questions are answered from. */
  setActive(ids: string[]): void {
    const next = ids.filter((id) => this.entries.has(id));
    if (next.join('\n') === this.active.join('\n')) return;
    this.active = next;
    this.corpus = null;
  }

  stats(ids: string[] = this.active): LibraryStats {
    let pages = 0;
    let parts = 0;
    let passages = 0;
    let chars = 0;
    let docs = 0;
    for (const id of ids) {
      const doc = this.docsById.get(id);
      const recs = this.entries.get(id);
      if (!doc || !recs) continue;
      docs++;
      if (doc.pageLabel === 'page') pages += doc.pages.length;
      else parts += doc.pages.length;
      passages += recs.length;
      for (const p of doc.pages) chars += p.length;
    }
    return { docs, pages, parts, passages, chars };
  }

  private build(): Corpus {
    const recs = this.active.flatMap((id) => this.entries.get(id) ?? []);
    const V = this.vocab.size;
    const df = new Uint32Array(V);
    let total = 0;
    let sumCjk = 0;
    let nCjk = 0;
    let sumLatin = 0;
    let nLatin = 0;
    for (const r of recs) {
      for (let k = 0; k < r.ids.length; k++) df[r.ids[k]]++;
      total += r.ids.length;
      if (r.cjk) {
        sumCjk += r.len;
        nCjk++;
      } else {
        sumLatin += r.len;
        nLatin++;
      }
    }
    const offsets = new Uint32Array(V + 1);
    for (let t = 0; t < V; t++) offsets[t + 1] = offsets[t] + df[t];
    const cursor = offsets.slice(0, V);
    const postRec = new Uint32Array(total);
    const postTf = new Float32Array(total);
    recs.forEach((r, ri) => {
      for (let k = 0; k < r.ids.length; k++) {
        const at = cursor[r.ids[k]]++;
        postRec[at] = ri;
        postTf[at] = r.tfs[k];
      }
    });
    return { recs, df, offsets, postRec, postTf, avgCjk: nCjk ? sumCjk / nCjk : 1, avgLatin: nLatin ? sumLatin / nLatin : 1, nCjk, nLatin };
  }

  private ensureCorpus(): Corpus {
    if (!this.corpus) this.corpus = this.build();
    return this.corpus;
  }

  /** Builds the index for the current selection now (so the first question is instant). */
  warm(): void {
    this.ensureCorpus();
  }

  /** Frequency of a term in one passage: 1+ in its text, CONTEXT_TF in its titles, 0 if absent. */
  private tfIn(r: Rec, term: string): number {
    const id = this.vocab.get(term);
    if (id === undefined) return 0;
    let lo = 0;
    let hi = r.ids.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = r.ids[mid];
      if (v === id) return r.tfs[mid];
      if (v < id) lo = mid + 1;
      else hi = mid - 1;
    }
    return 0;
  }

  analyze(question: string): AnalyzedQuery {
    const c = this.ensureCorpus();
    return analyzeQuery(question, {
      N: c.recs.length,
      df: (t) => {
        const id = this.vocab.get(t);
        return id === undefined || id >= c.df.length ? 0 : c.df[id];
      },
    });
  }

  ask(question: string, k = 5): QaResult {
    const t0 = now();
    const c = this.ensureCorpus();
    const N = c.recs.length;
    const q = this.analyze(question);

    // ---- search: BM25 over the postings of the question's terms ----
    const scores = new Float64Array(N);
    for (const [term, wq] of q.terms) {
      const id = this.vocab.get(term);
      if (id === undefined || id >= c.df.length || !c.df[id]) continue;
      const w = wq * idf(N, c.df[id]);
      for (let p = c.offsets[id]; p < c.offsets[id + 1]; p++) {
        const ri = c.postRec[p];
        const r = c.recs[ri];
        const tf = c.postTf[p];
        const avg = r.cjk ? c.avgCjk : c.avgLatin;
        scores[ri] += (w * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * r.len) / avg));
      }
    }
    const t1 = now();

    // ---- rank: best BM25 candidates, re-ranked by coverage of the question ----
    const pool: number[] = [];
    for (let ri = 0; ri < N; ri++) if (scores[ri] > 0) pool.push(ri);
    pool.sort((a, b) => scores[b] - scores[a]);
    const credit = (r: Rec) => (term: string) => {
      const tf = this.tfIn(r, term);
      return tf >= 1 ? 1 : tf > 0 ? 0.8 : 0;
    };
    const ranked = pool.slice(0, 40).map((ri) => {
      const r = c.recs[ri];
      const cov = coverage(q.units, credit(r)).ratio;
      const head = r.heading ? headingSet(r.heading) : null;
      const headCov = head ? coverage(q.units, (t) => (head.has(t) ? 1 : 0)).ratio : 0;
      const typed = q.answerType && hasAnswerType(r.doc.pages[r.page].slice(r.start, r.end), q.answerType) ? 1.1 : 1;
      return { r, bm25: scores[ri], cov, score: scores[ri] * (0.55 + 0.45 * cov) * (1 + HEADING_BOOST * headCov) * typed };
    });
    ranked.sort((a, b) => b.score - a.score);
    // Neighbouring passages overlap by a sentence: keep only the better of two overlapping ones.
    const kept: typeof ranked = [];
    for (const x of ranked) {
      if (kept.some((y) => y.r.doc === x.r.doc && y.r.page === x.r.page && y.r.start < x.r.end && x.r.start < y.r.end)) continue;
      kept.push(x);
      if (kept.length >= k) break;
    }
    const topScore = kept[0]?.score ?? 1;
    const hits: Hit[] = kept.map((x) => {
      const base = { doc: x.r.doc, page: x.r.page, passage: { start: x.r.start, end: x.r.end }, heading: x.r.heading };
      return { ...base, bm25: x.bm25, coverage: x.cov, score: x.score, rel: x.score / topScore, best: bestSentence(base, q) };
    });
    const t2 = now();

    // ---- cite: quote the best sentences, or say honestly that nothing fits ----
    const status = this.decide(q, hits, c);
    const answer = buildAnswer(hits, q, status);
    const t3 = now();

    return {
      question,
      query: q,
      hits,
      answer,
      timings: { search: t1 - t0, rank: t2 - t1, cite: t3 - t2 },
      passages: N,
      coverage: hits[0]?.coverage ?? 0,
    };
  }

  private decide(q: AnalyzedQuery, hits: Hit[], c: Corpus): AnswerStatus {
    if (!q.units.length) return 'empty';
    if (!hits.length || hits[0].coverage < MIN_COVERAGE) return 'none';
    // Only words found all over the library matched ("公司", "company"): too vague to answer.
    // "All over" is judged among passages in the word's own script, so loading the other
    // language's documents doesn't make 公司 look rare.
    if (c.recs.length >= 8) {
      const top = c.recs.find((r) => r.doc === hits[0].doc && r.page === hits[0].page && r.start === hits[0].passage.start);
      if (top) {
        const has = (term: string) => {
          const tf = this.tfIn(top, term);
          return tf >= 1 ? 1 : tf > 0 ? 0.8 : 0;
        };
        const share = (term: string) => {
          const id = this.vocab.get(term);
          const df = id === undefined || id >= c.df.length ? 0 : c.df[id];
          const n = isCjk(term.charCodeAt(0)) ? c.nCjk : c.nLatin;
          return n ? df / n : 1;
        };
        // A piece of the question matched (by itself or by a synonym) through a term that is not everywhere.
        const specific = q.units.some((u) => {
          if (unitCredit(u, has) < 0.6) return false;
          const matched: Array<[string, number]> = [...u.full.map((t): [string, number] => [t, 1]), ...u.part];
          return matched.some(([t, credit]) => has(t) * credit >= 0.6 && share(t) <= 0.3);
        });
        if (!specific) return 'vague';
      }
    }
    return 'ok';
  }
}
