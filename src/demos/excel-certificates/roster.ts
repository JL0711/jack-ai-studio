// From rows of cell text to a checked list of certificates: find the header
// row, guess which column is which, check every row, number the certificates.
// No React and no DOM here, so all of it is unit tested.

import { ListError, MAX_ROWS } from './errors';
import { serialToIso, type SheetRow } from './xlsx';

export type FieldKey = 'name' | 'course' | 'grade' | 'date' | 'number';
export const FIELDS: FieldKey[] = ['name', 'course', 'grade', 'date', 'number'];
export const REQUIRED_FIELDS: FieldKey[] = ['name', 'course'];

/** Column index for each field, -1 when the list has no such column. */
export type Mapping = Record<FieldKey, number>;
export const EMPTY_MAPPING: Mapping = { name: -1, course: -1, grade: -1, date: -1, number: -1 };

export interface Roster {
  /** Excel row number of the header row. */
  headerRow: number;
  headers: string[];
  /** Every row below the header down to the last filled one; gaps become blank rows. */
  rows: SheetRow[];
  /** How many columns the widest row has. */
  width: number;
}

// ---------- header detection and column mapping ----------

/** "Certificate No." → "certificateno", "证书 编号：" → "证书编号". */
export function normalizeHeader(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s.:：/\\_\-()（）[\]【】#*'"“”‘’]+/g, '');
}

// [synonym, weight]: an exact match counts double, containing the word counts once.
const SYNONYMS: Record<FieldKey, [string, number][]> = {
  name: [
    ['姓名', 3],
    ['名字', 3],
    ['学员姓名', 3],
    ['学生姓名', 3],
    ['学员', 2],
    ['学生', 2],
    ['参训人', 2],
    ['获奖人', 2],
    ['持证人', 2],
    ['name', 3],
    ['fullname', 3],
    ['studentname', 3],
    ['participant', 2],
    ['student', 2],
    ['attendee', 2],
    ['recipient', 2],
    ['learner', 2],
    ['trainee', 2],
  ],
  course: [
    ['课程', 3],
    ['课程名称', 3],
    ['课程名', 3],
    ['项目名称', 3],
    ['培训项目', 3],
    ['培训课程', 3],
    ['项目', 2],
    ['班级', 1],
    ['专业', 1],
    ['course', 3],
    ['coursename', 3],
    ['program', 3],
    ['programme', 3],
    ['training', 2],
    ['workshop', 2],
    ['class', 1],
    ['subject', 1],
  ],
  grade: [
    ['考核等级', 3],
    ['考核结果', 3],
    ['等级', 2],
    ['成绩', 2],
    ['评级', 2],
    ['考核', 1],
    ['grade', 3],
    ['result', 2],
    ['level', 1],
    ['score', 1],
    ['rating', 1],
  ],
  date: [
    ['日期', 3],
    ['结业日期', 3],
    ['完成日期', 3],
    ['毕业日期', 3],
    ['颁发日期', 3],
    ['发证日期', 3],
    ['结课日期', 3],
    ['时间', 1],
    ['date', 3],
    ['completiondate', 3],
    ['completed', 2],
    ['enddate', 2],
    ['issuedate', 2],
    ['finishdate', 2],
  ],
  number: [
    ['证书编号', 3],
    ['证书号', 3],
    ['证书号码', 3],
    ['证号', 2],
    ['编号', 1],
    ['certificateno', 3],
    ['certificatenumber', 3],
    ['certno', 3],
    ['certificateid', 3],
    ['certificate', 2],
    ['cert', 2],
    ['number', 1],
  ],
};

// Columns that look like a match but are something else: a row index, a student ID, contact details.
const NEVER = new Set([
  '序号',
  '学号',
  '工号',
  '学员编号',
  '学生编号',
  '员工编号',
  'no',
  'nr',
  'id',
  'studentid',
  'studentno',
  'employeeid',
  '电话',
  '手机',
  '手机号',
  '邮箱',
  'phone',
  'email',
  'mobile',
]);

export function headerScore(header: string, field: FieldKey): number {
  const h = normalizeHeader(header);
  if (!h || NEVER.has(h)) return 0;
  let best = 0;
  for (const [syn, weight] of SYNONYMS[field]) {
    if (h === syn) best = Math.max(best, weight * 2);
    else if (h.includes(syn) && syn.length >= 2) best = Math.max(best, weight);
  }
  return best;
}

/** Best column for each field; a column is used for one field at most. */
export function detectMapping(headers: string[]): Mapping {
  const pairs: { field: FieldKey; col: number; score: number }[] = [];
  headers.forEach((h, col) => {
    for (const field of FIELDS) {
      const score = headerScore(h, field);
      if (score > 0) pairs.push({ field, col, score });
    }
  });
  pairs.sort((a, b) => b.score - a.score || a.col - b.col || FIELDS.indexOf(a.field) - FIELDS.indexOf(b.field));
  const mapping: Mapping = { ...EMPTY_MAPPING };
  const used = new Set<number>();
  for (const p of pairs) {
    if (mapping[p.field] >= 0 || used.has(p.col)) continue;
    mapping[p.field] = p.col;
    used.add(p.col);
  }
  return mapping;
}

function fieldsMatched(cells: string[]): number {
  return FIELDS.filter((f) => cells.some((c) => headerScore(c, f) > 0)).length;
}

const isBlank = (cells: string[]) => cells.every((c) => c.trim() === '');

/**
 * Finds the header row (a title row above it is fine), then takes every row
 * below it down to the last non-empty one. Rows missing from the file become
 * blank rows, as Excel shows them.
 */
export function buildRoster(rows: SheetRow[], maxRows = MAX_ROWS): Roster {
  const filled = rows.filter((r) => !isBlank(r.cells)).sort((a, b) => a.r - b.r);
  if (!filled.length) throw new ListError('empty');
  // The header is the early row that names the most fields we know. If none does
  // (headers in another language), it is the first row as wide as the widest early
  // row, which steps over a one-cell title row above the table.
  const early = filled.slice(0, 10);
  const filledCells = (r: SheetRow) => r.cells.filter((c) => c.trim() !== '').length;
  let header = early[0];
  let bestScore = 0;
  for (const row of early) {
    const score = fieldsMatched(row.cells);
    if (score > bestScore) {
      header = row;
      bestScore = score;
    }
  }
  if (!bestScore) {
    const widest = Math.max(...early.map(filledCells));
    header = early.find((r) => filledCells(r) === widest) ?? early[0];
  }
  const below = filled.filter((r) => r.r > header.r);
  const last = below.length ? below[below.length - 1].r : header.r;
  const count = last - header.r;
  if (count > maxRows) throw new ListError('too_many_rows', count);
  const byNumber = new Map(below.map((r) => [r.r, r.cells]));
  const out: SheetRow[] = [];
  let width = header.cells.length;
  for (let r = header.r + 1; r <= last; r++) {
    const cells = byNumber.get(r) ?? [];
    width = Math.max(width, cells.length);
    out.push({ r, cells });
  }
  return { headerRow: header.r, headers: header.cells.map((c) => c.trim()), rows: out, width };
}

// ---------- dates ----------

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/** "Nov", "nov.", "November", "Sept" → 11 / 9; a misspelt word → null. */
function monthOf(word: string): number | null {
  const w = word.replace(/\.$/, '');
  const i = MONTHS.findIndex(
    (full) => full === w || (w.length === 3 && full.startsWith(w)) || (w === 'sept' && full === 'september'),
  );
  return i < 0 ? null : i + 1;
}

function iso(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null; // 30 February and friends
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

/**
 * Reads the date formats people actually type: 2026-11-08, 2026/11/8,
 * 2026.11.08, 2026年11月8日, 20261108, 11/8/2026 (month first, unless the
 * first number is over 12), 8.11.2026 (day first), Nov 8, 2026, 8 November
 * 2026, an Excel serial number. A time after the date is ignored.
 * Returns YYYY-MM-DD, or null when the text is not a date.
 */
export function parseDate(raw: string): string | null {
  const s = raw
    .normalize('NFKC')
    .trim()
    .replace(/\s*(?:[T\s]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:\s*[ap]\.?m\.?)?(?:Z|[+-]\d{2}:?\d{2})?)$/i, '');
  if (!s) return null;
  let m: RegExpExecArray | null;
  const cjk = s.replace(/\s+/g, '');
  if ((m = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/.exec(cjk))) return iso(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) return iso(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})([-/.])(\d{1,2})\2(\d{4}|\d{2})$/.exec(s))) {
    const a = +m[1];
    const b = +m[3];
    const y = fullYear(m[4]);
    if (a > 12) return iso(y, b, a);
    if (b > 12) return iso(y, a, b);
    // Both could be the month: slashes read month first (as Excel in the US), dots day first.
    return m[2] === '.' ? iso(y, b, a) : iso(y, a, b);
  }
  const words = s.toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ');
  if ((m = /^([a-z]{3,9}\.?) (\d{1,2})(?:st|nd|rd|th)? (\d{4})$/.exec(words))) {
    const month = monthOf(m[1]);
    return month ? iso(+m[3], month, +m[2]) : null;
  }
  if ((m = /^(\d{1,2})(?:st|nd|rd|th)?[ -]([a-z]{3,9}\.?)[ -](\d{4})$/.exec(words))) {
    const month = monthOf(m[2]);
    return month ? iso(+m[3], month, +m[1]) : null;
  }
  // A date that lost its format on the way to CSV: Excel's serial number (1955–2119).
  if ((m = /^(\d{5})(\.\d+)?$/.exec(s))) {
    const n = Number(s);
    if (n >= 20000 && n <= 80000) return serialToIso(n);
  }
  return null;
}

// ---------- checking ----------

export type Issue =
  | { code: 'blank' }
  | { code: 'missing_name' }
  | { code: 'missing_course' }
  | { code: 'bad_date'; value: string }
  | { code: 'duplicate'; of: number }
  | { code: 'dup_number'; of: number; value: string };

export type RowStatus = 'ok' | 'skip' | 'stop';

export interface CheckedRow {
  /** Excel row number. */
  r: number;
  name: string;
  course: string;
  grade: string;
  /** The date as written in the list. */
  dateRaw: string;
  /** YYYY-MM-DD: the row's own date, or the issue date when the row has none. */
  date: string;
  /** True when the row had no date and the issue date is used. */
  dateFromIssue: boolean;
  /** Certificate number: the one in the list, or a new one. Empty unless status is ok. */
  number: string;
  numberIsNew: boolean;
  status: RowStatus;
  issues: Issue[];
}

export interface CheckStats {
  rows: number;
  ok: number;
  stopped: number;
  skipped: number;
}

export interface CheckOptions {
  prefix: string;
  /** YYYY-MM-DD; its year goes into new certificate numbers. */
  issueDate: string;
}

/** "NCA-2026-0007". An empty prefix gives "2026-0007". */
export function formatCertNumber(prefix: string, year: number, seq: number): string {
  const tail = `${year}-${String(seq).padStart(4, '0')}`;
  return prefix ? `${prefix}-${tail}` : tail;
}

/** Letters, digits and dashes only, upper case, at most 12 characters. */
export function cleanPrefix(p: string): string {
  return p
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 12);
}

const keyOf = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const cellOf = (cells: string[], col: number) => (col >= 0 ? (cells[col] ?? '').trim() : '');

/**
 * Gives every certificate-to-be a number. Numbers already in the list are
 * kept; new ones count up from 0001 and step over any number already taken.
 */
export function assignNumbers(given: (string | null)[], prefix: string, year: number): string[] {
  const taken = new Set(given.filter((g): g is string => !!g).map((g) => keyOf(g)));
  let seq = 1;
  return given.map((g) => {
    if (g) return g;
    let candidate = formatCertNumber(prefix, year, seq);
    while (taken.has(keyOf(candidate))) candidate = formatCertNumber(prefix, year, ++seq);
    taken.add(keyOf(candidate));
    seq++;
    return candidate;
  });
}

/**
 * Checks every row: blank rows are skipped; rows without a name or course,
 * with a date that cannot be read, repeating an earlier name + course, or
 * repeating an earlier certificate number are stopped, each with the reason.
 */
export function checkRoster(
  roster: Roster,
  mapping: Mapping,
  opts: CheckOptions,
): { rows: CheckedRow[]; stats: CheckStats } {
  const prefix = cleanPrefix(opts.prefix);
  const year = Number(opts.issueDate.slice(0, 4)) || new Date().getFullYear();
  const usedCols = FIELDS.map((f) => mapping[f]).filter((c) => c >= 0);
  const firstOk = new Map<string, number>();
  const numberOwner = new Map<string, number>();

  const rows: CheckedRow[] = roster.rows.map((row) => {
    const cells = row.cells;
    const name = cellOf(cells, mapping.name);
    const course = cellOf(cells, mapping.course);
    const grade = cellOf(cells, mapping.grade);
    const dateRaw = cellOf(cells, mapping.date);
    const givenNumber = cellOf(cells, mapping.number);
    const parsed = dateRaw ? parseDate(dateRaw) : null;
    const base: CheckedRow = {
      r: row.r,
      name,
      course,
      grade,
      dateRaw,
      date: parsed ?? opts.issueDate,
      dateFromIssue: !dateRaw,
      number: givenNumber,
      numberIsNew: false,
      status: 'ok',
      issues: [],
    };
    // Blank as far as a certificate goes: none of the used columns has anything.
    if (usedCols.every((c) => cellOf(cells, c) === '')) return { ...base, status: 'skip', issues: [{ code: 'blank' }] };
    const issues: Issue[] = [];
    if (!name) issues.push({ code: 'missing_name' });
    if (!course) issues.push({ code: 'missing_course' });
    if (dateRaw && !parsed) issues.push({ code: 'bad_date', value: dateRaw });
    if (!issues.length) {
      const key = `${keyOf(name)}\u0000${keyOf(course)}`;
      const earlier = firstOk.get(key);
      if (earlier !== undefined) issues.push({ code: 'duplicate', of: earlier });
      else if (givenNumber && numberOwner.has(keyOf(givenNumber))) {
        issues.push({ code: 'dup_number', of: numberOwner.get(keyOf(givenNumber)) ?? 0, value: givenNumber });
      } else {
        firstOk.set(key, row.r);
        if (givenNumber) numberOwner.set(keyOf(givenNumber), row.r);
      }
    }
    return issues.length ? { ...base, status: 'stop', issues } : base;
  });

  const okRows = rows.filter((r) => r.status === 'ok');
  const numbers = assignNumbers(
    okRows.map((r) => r.number || null),
    prefix,
    year,
  );
  okRows.forEach((r, i) => {
    r.numberIsNew = !r.number;
    r.number = numbers[i];
  });
  for (const r of rows) if (r.status !== 'ok') r.number = '';

  const stats: CheckStats = {
    rows: rows.length,
    ok: okRows.length,
    stopped: rows.filter((r) => r.status === 'stop').length,
    skipped: rows.filter((r) => r.status === 'skip').length,
  };
  return { rows, stats };
}
