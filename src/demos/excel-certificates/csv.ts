// CSV reading (RFC 4180 quoting; comma, semicolon or tab, guessed from the
// file) and writing. Decoding the bytes (UTF-8, UTF-16, GBK) happens before,
// in decodeText.

export type Delimiter = ',' | ';' | '\t';

const CANDIDATES: Delimiter[] = [',', ';', '\t'];

/** Counts each candidate per line (outside quotes) over the first lines and picks the steadiest. */
export function detectDelimiter(text: string): Delimiter {
  const counts: Record<Delimiter, number[]> = { ',': [], ';': [], '\t': [] };
  let line: Record<Delimiter, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  let lines = 0;
  let lineHasText = false;
  for (let i = 0; i < text.length && lines < 20; i++) {
    const c = text[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (c === '\n' || c === '\r')) {
      if (lineHasText) {
        for (const d of CANDIDATES) counts[d].push(line[d]);
        lines++;
      }
      line = { ',': 0, ';': 0, '\t': 0 };
      lineHasText = false;
    } else if (!inQuotes && (c === ',' || c === ';' || c === '\t')) {
      line[c]++;
      lineHasText = true;
    } else if (c.trim()) lineHasText = true;
  }
  if (lineHasText) for (const d of CANDIDATES) counts[d].push(line[d]);

  let best: Delimiter = ',';
  let bestScore = 0;
  for (const d of CANDIDATES) {
    const list = counts[d];
    if (!list.length) continue;
    const min = Math.min(...list);
    const avg = list.reduce((a, b) => a + b, 0) / list.length;
    // A delimiter that appears the same number of times on every line wins clearly.
    const score = min > 0 ? 1000 + min * 10 + (list.every((n) => n === list[0]) ? 500 : 0) : avg;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Splits CSV text into records. Quoted fields may contain the delimiter,
 * doubled quotes and line breaks. A blank line becomes an empty record, so a
 * blank row in the list stays visible; the final line break adds nothing.
 */
export function parseCsv(input: string, delimiter?: Delimiter): string[][] {
  return readCsv(input, delimiter).rows;
}

/** parseCsv plus the delimiter it used. */
export function readCsv(input: string, delimiter?: Delimiter): { rows: string[][]; delimiter: Delimiter } {
  let text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  // Excel's "sep=;" hint on the first line.
  const hint = /^sep=(.)\r?\n/i.exec(text);
  let delim: Delimiter = delimiter ?? ',';
  if (hint && (CANDIDATES as string[]).includes(hint[1])) {
    delim = hint[1] as Delimiter;
    text = text.slice(hint[0].length);
  } else if (!delimiter) delim = detectDelimiter(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let quoted = false; // the current field started with a quote
  let i = 0;
  const n = text.length;
  const endField = () => {
    row.push(field);
    field = '';
    quoted = false;
  };
  const endRow = () => {
    endField();
    rows.push(row.length === 1 && row[0] === '' ? [] : row);
    row = [];
  };
  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
      } else field += c;
      i++;
      continue;
    }
    if (c === '"' && field === '' && !quoted) {
      inQuotes = true;
      quoted = true;
    } else if (c === delim) endField();
    else if (c === '\r' || c === '\n') {
      endRow();
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else field += c;
    i++;
  }
  // Last record (unless the text ended with a line break). An unclosed quote keeps what it has.
  if (field !== '' || row.length > 0 || quoted) endRow();
  return { rows, delimiter: delim };
}

/** A CSV field, quoted when it has to be. */
export function csvField(value: string, delimiter: Delimiter = ','): string {
  if (value === '') return '';
  if (value.includes('"') || value.includes(delimiter) || /[\r\n]/.test(value) || /^\s|\s$/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Rows → CSV text with CRLF line ends (what Excel writes). */
export function toCsv(rows: string[][], delimiter: Delimiter = ','): string {
  return rows.map((r) => r.map((v) => csvField(v, delimiter)).join(delimiter)).join('\r\n') + '\r\n';
}

/**
 * Text a spreadsheet would run as a formula (=, +, -, @ at the start) gets a
 * leading apostrophe, so a name in a visitor's list can never become one.
 */
export function guardFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) && !/^[+-]?\d+(\.\d+)?$/.test(value) ? `'${value}` : value;
}
