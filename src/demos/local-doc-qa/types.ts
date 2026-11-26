import type { Span } from './chunk';
import type { AnalyzedQuery } from './query';

export type DocLang = 'zh' | 'en';

/** "page" when the file really has pages (PDF, Word page breaks); "part" when the demo cut it up itself. */
export type PageLabel = 'page' | 'part';

export type DocKind = 'sample' | 'pdf' | 'docx' | 'txt' | 'md';

export interface SourceDoc {
  id: string;
  /** Shown in citations: the sample's title, or the uploaded file's name. */
  title: string;
  origin: 'sample' | 'upload';
  kind: DocKind;
  lang?: DocLang;
  pageLabel: PageLabel;
  /** Word pages counted from page breaks in the file, so only approximately right. */
  approxPages?: boolean;
  pages: string[];
}

export interface Hit {
  doc: SourceDoc;
  /** 0-based page index. */
  page: number;
  /** The passage, as offsets into the page text. */
  passage: Span;
  /** Title of the section the passage is in ('' if none). */
  heading: string;
  bm25: number;
  coverage: number;
  /** Final score (BM25 adjusted by coverage). */
  score: number;
  /** score / best score, 0…1. */
  rel: number;
  /** The passage's best-matching sentence (for the results list). */
  best: Span;
}

export interface Quote {
  doc: SourceDoc;
  page: number;
  span: Span;
  /** 1-based citation number. */
  cite: number;
}

export interface Citation {
  n: number;
  doc: SourceDoc;
  page: number;
  passage: Span;
  /** What was quoted from this page (highlighted in the viewer). */
  quoted: Span[];
}

export type AnswerStatus = 'ok' | 'none' | 'vague' | 'empty';

export interface Answer {
  status: AnswerStatus;
  quotes: Quote[];
  citations: Citation[];
}

export interface Timings {
  search: number;
  rank: number;
  cite: number;
}

export interface QaResult {
  question: string;
  query: AnalyzedQuery;
  hits: Hit[];
  answer: Answer;
  timings: Timings;
  /** Passages searched. */
  passages: number;
  /** Coverage of the best passage (0…1). */
  coverage: number;
}
