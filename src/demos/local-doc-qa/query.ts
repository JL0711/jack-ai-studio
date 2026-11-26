// Turning a question into search terms, and measuring how much of the question
// a passage actually covers. Coverage is what lets the demo say "the documents
// don't seem to cover this" instead of quoting the least-bad passage.

import { isCjk, normalizeCjkForms, scanText, stem } from './tokenize';

/** One piece of the question that a passage should contain (a word, a Chinese word or character, a number). */
export interface Unit {
  label: string;
  /** How informative the piece is (inverse document frequency; unseen words count the most). */
  weight: number;
  /** Any of these terms in a passage covers the piece fully. */
  full: string[];
  /** Partial credit: [term, credit 0…1] (a synonym, or a single matching character). */
  part: Array<[string, number]>;
  start: number;
  end: number;
  /** Which part of a two-part question ("年假有几天？没休完怎么办？") the piece belongs to. */
  clause: number;
}

export interface AnalyzedQuery {
  text: string;
  /** BM25 terms and their weights. */
  terms: Map<string, number>;
  units: Unit[];
  /** Terms to highlight (bigrams, words, numbers, synonyms). */
  marks: Set<string>;
  /** Single characters to highlight (only where no longer match exists). */
  uniMarks: Set<string>;
  /** What kind of value the question asks for ("多久" → a duration): sentences with one rank higher. */
  answerType: AnswerType;
  clauses: number;
  /** Answer type of each clause. */
  clauseTypes: AnswerType[];
}

export type AnswerType = 'duration' | 'date' | 'money' | 'frequency' | 'number' | null;

export interface TermStats {
  N: number;
  df: (term: string) => number;
}

export function idf(N: number, df: number): number {
  return Math.log(1 + (N - df + 0.5) / (df + 0.5));
}

// Question words and fillers: they say what kind of answer is wanted, not what it is about.
const ZH_QUESTION_WORDS = [
  '是不是', '有没有', '能不能', '可不可以', '要不要', '需不需要', '会不会', '为什么', '怎么样', '怎么办', '多长时间', '多少钱',
  '什么时候', '什么样', '我想知道', '想知道', '请问', '告诉我', '什么意思', '是什么', '指什么', '代表什么',
  '什么', '怎么', '怎样', '如何', '为何', '多少', '多久', '多长', '多大', '多远', '多高', '多重', '几号', '几点', '几次',
  '哪些', '哪里', '哪儿', '哪个', '哪家', '哪种', '是否', '能否', '可否', '可以', '应该', '一下', '最多', '最少', '最长',
  '最晚', '最早', '意思', '含义', '是指', '规定', '关于', '这部分', '讲了', '说了', '写了', '文件里', '文档里', '资料里', '手册里', '里面',
  '吗', '呢', '吧', '啊', '呀', '嘛', '哪', '谁', '几',
].sort((a, b) => b.length - a.length);

// Common characters that only count when they are part of a longer known word (有 in 有效, 要 in 要求).
const ZH_WEAK = new Set(
  '的了是在有和与及或也都就还又很要会能可该得地着过把被让给对从到向往于之其这那个些一我你他她它们自己每上下里中内外前后时次多少怎什去来说做想请使'.split(''),
);

// English question fillers ("how long", "what does it mean"), stemmed like everything else.
const EN_QUERY_STOP = new Set(
  ['long', 'many', 'much', 'often', 'soon', 'need', 'needs', 'want', 'tell', 'know', 'happen', 'happens', 'mean', 'means', 'say', 'says', 'get', 'gets', 'please', 'thing', 'things', 'kind', 'way', 'like', 'okay', 'ok', 'anything', 'something', 'really', 'exactly', 'actually', 'section'].map(stem),
);

// Synonyms within each language. A question word finds the others at reduced weight.
const ZH_SYNONYMS: string[][] = [
  ['报销', '费用', '发票', '票据'],
  ['出差', '差旅'],
  ['保修', '质保', '保固'],
  ['密码', '口令'],
  ['电脑', '笔记本', '计算机'],
  ['丢失', '遗失', '丢了', '被盗', '丢'],
  ['酒店', '住宿', '宾馆'],
  ['机票', '航班', '飞机'],
  ['年假', '年休假'],
  ['病假', '生病', '看病'],
  ['工资', '薪资', '薪水', '薪酬'],
  ['故障', '报警', '错误'],
  ['机油', '润滑油'],
  ['更换', '换'],
  ['空压机', '压缩机'],
  ['联系', '联络'],
  ['离职', '辞职'],
  ['考勤', '打卡'],
  ['餐补', '伙食补助', '餐费'],
  ['打车', '出租车', '网约车'],
  ['钓鱼', '可疑邮件'],
  ['到岗', '上班'],
  ['在家', '公司以外', '远程'],
];

const EN_SYNONYMS: string[][] = [
  ['refund', 'reimburse', 'reimbursement', 'repay'],
  ['expense', 'cost', 'spending'],
  ['trip', 'travel', 'journey'],
  ['warranty', 'guarantee'],
  ['password', 'passphrase', 'passcode'],
  ['laptop', 'computer', 'notebook', 'pc'],
  ['lose', 'lost', 'stolen', 'missing', 'theft', 'steal'],
  ['hotel', 'accommodation', 'lodging'],
  ['flight', 'airfare', 'plane', 'fly'],
  ['vacation', 'holiday', 'pto', 'annual'],
  ['sick', 'ill', 'illness', 'medical'],
  ['salary', 'pay', 'payroll', 'wage', 'paycheck', 'payday'],
  ['fault', 'error', 'alarm'],
  ['oil', 'lubricant'],
  ['replace', 'change', 'swap'],
  ['contact', 'call', 'email', 'reach'],
  ['quit', 'resign', 'resignation'],
  ['meal', 'food', 'diem'],
  ['taxi', 'cab', 'rideshare'],
  ['phishing', 'scam', 'suspicious'],
  ['deadline', 'due', 'late'],
  ['limit', 'maximum', 'cap', 'max'],
  ['rule', 'requirement', 'policy'],
  ['home', 'remote', 'away'],
];

const EN_GROUPS = new Map<string, string[]>();
for (const group of EN_SYNONYMS) {
  const stems = group.map(stem);
  for (const s of stems) EN_GROUPS.set(s, [...new Set([...(EN_GROUPS.get(s) ?? []), ...stems.filter((o) => o !== s)])]);
}

// What kind of value a question asks for, and how to spot one in a sentence.
const ASKS: Array<[Exclude<AnswerType, null>, RegExp]> = [
  ['frequency', /多久.{0,3}一次|多长时间.{0,3}一次|隔多久|频率|每隔|\bhow\s+(?:often|frequently)\b/i],
  ['duration', /多久|多长时间|多长|几天|几个月|几年|几小时|几分钟|期限|时限|多少天|多少小时|截止|\bhow\s+(?:long|soon)\b|\bhow\s+many\s+(?:days|hours|weeks|months|years|minutes)\b|\bdeadline\b/i],
  ['date', /几号|哪天|哪一天|什么时候|何时|几点|日期|\bwhen\b|\bwhat\s+(?:day|date|time)\b|\bwhich\s+day\b/i],
  ['money', /多少钱|报多少|多少元|能报|价格|价钱|上限|补助多少|补贴多少|\bhow\s+much\b|\bcost\b|\bprice\b|\bbudget\b|\blimit\b|\ballowance\b|\bfee\b/i],
  ['number', /多少|几|多大|多高|多远|最多|最少|\bhow\s+many\b|\bmaximum\b|\bminimum\b|\bat\s+(?:most|least)\b/i],
];

const IN_TEXT: Record<Exclude<AnswerType, null>, RegExp> = {
  // "30 天", "3 个月", "5 个工作日", "15 日内" — but not dates like "3 月 31 日" or "2026 年".
  duration: /\d[\d,.]*\s*(?:个月|个?工作日|天|日[内以之]|小时|周|分钟|秒)|(?<!\d)\d{1,2}\s*年(?!\d)|\d[\d,.]*[\s-]*(?:minutes?|hours?|days?|weeks?|months?|years?)\b/i,
  money: /\d[\d,.]*\s*(?:元|块)|(?:CNY|RMB|USD|EUR|¥|\$|€)\s?\d|\d[\d,.]*\s*(?:yuan|dollars?|euros?)\b/i,
  frequency: /每\s*\d|每(?:天|日|周|月|年|次)|\bevery\b|\bdaily\b|\bweekly\b|\bmonthly\b|\bannually\b|\bonce\s+a\b/i,
  date: /\d{1,2}\s*(?:日|号)(?![内以之])|\d{1,2}:\d{2}|周[一二三四五六日]|星期[一二三四五六日天]|\b\d{1,2}(?:st|nd|rd|th)\b|\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|june|july|august|september|october|november|december)\b/i,
  number: /\d/,
};

// Words that often sit next to such a value; they nudge the ranking (BM25 only, never coverage).
const TYPE_HINTS: Record<Exclude<AnswerType, null>, string[]> = {
  duration: ['个月', '小时', '天内', '期限', 'period', 'month', 'day', 'hour', 'year', 'week'],
  money: ['标准', '上限', '不超', 'cost', 'limit', 'fee', 'price', 'cny'],
  frequency: ['每天', '每周', '每年', '每月', 'every', 'daily', 'weekly'],
  date: [],
  number: [],
};

export function answerTypeOf(text: string): AnswerType {
  for (const [type, re] of ASKS) if (re.test(text)) return type;
  return null;
}

/** True when `text` contains the kind of value the question asks for. */
export function hasAnswerType(text: string, type: AnswerType): boolean {
  return type ? IN_TEXT[type].test(text) : false;
}

// Where a question splits into separately answerable parts.
const CLAUSE_BREAK =
  /[？?！!；;。\n，]|,\s*(?=(?:and\s+|but\s+)?(?:what|how|when|where|who|which|why|can|could|do|does|is|are|should)\b)|\s+(?:and|but)\s+(?=(?:what|how|when|where|who|which|why)\b)/gi;

/** Fault codes, model numbers, extensions and acronyms are what a question is really about. */
const IDENTIFIER_BOOST = 1.5;

function cjkPieces(word: string): string[] {
  if (word.length === 1) return [word];
  const out: string[] = [];
  for (let i = 0; i + 1 < word.length; i++) out.push(word.slice(i, i + 2));
  return out;
}

/**
 * Splits the question into BM25 terms and coverage units. `stats` gives the
 * document frequency of a term in the current library. Chinese is cut into
 * words by which two-character pairs the library actually contains, so
 * "出差住酒店" becomes 出差 · 住 · 酒店 without a dictionary, and characters
 * that pair with nothing known ("天气" in a library about travel rules) stay
 * together as an unknown word, which counts heavily against coverage.
 */
export function analyzeQuery(question: string, stats: TermStats): AnalyzedQuery {
  const text = normalizeCjkForms(question.trim());
  const terms = new Map<string, number>();
  const units: Unit[] = [];
  const marks = new Set<string>();
  const uniMarks = new Set<string>();
  const maxIdf = idf(stats.N, 0);
  const weightOf = (term: string) => {
    const d = stats.df(term);
    return d > 0 ? idf(stats.N, d) : maxIdf;
  };
  const known = (term: string) => stats.df(term) > 0;
  const addTerm = (term: string, weight: number) => {
    if ((terms.get(term) ?? 0) < weight) terms.set(term, weight);
  };

  const breaks: number[] = [];
  for (const m of text.matchAll(CLAUSE_BREAK)) if (m.index !== undefined) breaks.push(m.index);
  const clauseOf = (pos: number) => breaks.filter((b) => b < pos).length;
  const pushUnit = (u: Omit<Unit, 'clause'>) => {
    if (units.some((x) => x.label === u.label)) return;
    units.push({ ...u, clause: clauseOf(u.start) });
  };

  // ----- Chinese: drop question words, then cut what's left into known pairs -----
  const removed = new Uint8Array(text.length);
  for (const word of ZH_QUESTION_WORDS) {
    for (let k = text.indexOf(word); k >= 0; k = text.indexOf(word, k + 1)) removed.fill(1, k, k + word.length);
  }
  let i = 0;
  while (i < text.length) {
    if (!isCjk(text.charCodeAt(i)) || removed[i]) {
      i++;
      continue;
    }
    let e = i;
    while (e < text.length && isCjk(text.charCodeAt(e)) && !removed[e]) e++;
    // A pair of two filler characters ("一次", "这个") is never what a question is about.
    const pairKnown = (k: number) => k >= i && k + 1 < e && !(ZH_WEAK.has(text[k]) && ZH_WEAK.has(text[k + 1])) && known(text.slice(k, k + 2));
    for (let k = i; k + 1 < e; k++) {
      if (pairKnown(k)) {
        addTerm(text.slice(k, k + 2), 1);
        marks.add(text.slice(k, k + 2));
      }
    }
    // Characters next to no known pair: grouped two by two as unknown words.
    let free: number[] = [];
    const flushFree = () => {
      for (let f = 0; f < free.length; f += 2) {
        const a = free[f];
        const b = free[f + 1];
        if (b === a + 1) {
          const word = text.slice(a, b + 1);
          pushUnit({ label: word, weight: maxIdf, full: [], part: [[text[a], 0.15], [text[b], 0.15]], start: a, end: b + 1 });
          for (const ch of word) addTerm(ch, 0.2);
        } else {
          const ch = text[a];
          pushUnit({ label: ch, weight: weightOf(ch), full: [], part: [[ch, 0.3]], start: a, end: a + 1 });
          addTerm(ch, 0.3);
          uniMarks.add(ch);
          if (b !== undefined) f--; // b starts the next group
        }
      }
      free = [];
    };
    let k = i;
    while (k < e) {
      if (pairKnown(k)) {
        flushFree();
        const bi = text.slice(k, k + 2);
        pushUnit({ label: bi, weight: weightOf(bi), full: [bi], part: [[text[k], 0.15], [text[k + 1], 0.15]], start: k, end: k + 2 });
        k += 2;
        continue;
      }
      const ch = text[k];
      if (ZH_WEAK.has(ch)) {
        flushFree();
      } else {
        const around = [pairKnown(k - 1) ? text.slice(k - 1, k + 1) : '', pairKnown(k) ? text.slice(k, k + 2) : ''].filter(Boolean);
        if (around.length) {
          flushFree();
          pushUnit({ label: ch, weight: weightOf(ch), full: around, part: [[ch, 0.3]], start: k, end: k + 1 });
          addTerm(ch, 0.3);
        } else free.push(k);
      }
      k++;
    }
    flushFree();
    i = e;
  }

  // ----- English words, numbers, codes -----
  scanText(text, (term, kind, start, end) => {
    if (kind === 'uni' || kind === 'bi') return;
    if (kind === 'word' && EN_QUERY_STOP.has(term)) return;
    if (kind === 'neg') {
      addTerm(term, 0.7);
      marks.add(term);
      pushUnit({ label: term, weight: 0.5 * weightOf(term), full: [term], part: [], start, end });
      return;
    }
    addTerm(term, 1);
    marks.add(term);
    const part: Array<[string, number]> = [];
    if (kind === 'word') {
      for (const other of EN_GROUPS.get(term) ?? []) {
        part.push([other, 0.6]);
        if (known(other)) {
          addTerm(other, 0.5);
          marks.add(other);
        }
      }
    }
    const raw = text.slice(start, end);
    const identifier = /\d/.test(term) || /^[A-Z]{2,6}$/.test(raw);
    pushUnit({ label: term, weight: weightOf(term) * (identifier ? IDENTIFIER_BOOST : 1), full: [term], part, start, end });
  });

  // ----- Chinese synonyms -----
  for (const group of ZH_SYNONYMS) {
    for (const word of group) {
      for (let k = text.indexOf(word); k >= 0; k = text.indexOf(word, k + 1)) {
        const end = k + word.length;
        const touched = units.filter((u) => u.start < end && u.end > k && isCjk(u.label.charCodeAt(0)));
        if (!touched.length) continue;
        for (const other of group) {
          // "换" may find "更换"; "丢了" doesn't need "丢" (already a single-character match).
          if (other === word || word.includes(other)) continue;
          for (const piece of cjkPieces(other)) {
            if (!known(piece)) continue;
            addTerm(piece, 0.5);
            if (piece.length === 1) uniMarks.add(piece);
            else marks.add(piece);
            for (const u of touched) u.part.push([piece, 0.6]);
          }
        }
      }
    }
  }

  const answerType = answerTypeOf(text);
  if (answerType) {
    for (const hint of TYPE_HINTS[answerType]) {
      const term = isCjk(hint.charCodeAt(0)) ? hint : stem(hint);
      if (known(term)) addTerm(term, 0.35);
    }
  }
  const clauses = units.reduce((n, u) => Math.max(n, u.clause + 1), 0);
  const bounds = [0, ...breaks, text.length];
  const clauseTypes: AnswerType[] = [];
  for (let c = 0; c < clauses; c++) {
    // Clause c is the text between the c-th and (c+1)-th break.
    clauseTypes.push(answerTypeOf(text.slice(bounds[c], bounds[c + 1] ?? text.length)));
  }
  return { text, terms, units, marks, uniMarks, answerType, clauses, clauseTypes };
}

export interface Coverage {
  matched: number;
  total: number;
  ratio: number;
}

/**
 * How much of the question's weight a passage covers. `has(term)` is 1 when
 * the passage contains the term, a fraction when it only appears in the
 * passage's context (its section title), 0 otherwise.
 */
export function coverage(units: Unit[], has: (term: string) => number): Coverage {
  let matched = 0;
  let total = 0;
  for (const u of units) {
    total += u.weight;
    matched += u.weight * unitCredit(u, has);
  }
  return { matched, total, ratio: total > 0 ? matched / total : 0 };
}

export function unitCredit(u: Unit, has: (term: string) => number): number {
  let c = 0;
  for (const t of u.full) {
    c = Math.max(c, has(t));
    if (c >= 1) return 1;
  }
  for (const [t, credit] of u.part) c = Math.max(c, has(t) * credit);
  return c;
}
