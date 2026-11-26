// File names for the certificates and the log spreadsheet (as CSV).

import { safeFileName } from '../../lib/files/download';
import { guardFormula, toCsv } from './csv';
import type { CheckedRow } from './roster';
import { describeIssue, type DemoText } from './text';

/** "NCA-2026-0001 Emma Carter.png", safe on Windows, macOS and phones. */
export function pngFileName(number: string, name: string): string {
  return `${safeFileName(`${number} ${name}`, number || 'certificate')}.png`;
}

/** Makes names unique inside a ZIP ("a.png", "a (2).png"), ignoring case as Windows does. */
export function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.map((name) => {
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let candidate = name;
    for (let i = 2; seen.has(candidate.toLowerCase()); i++) candidate = `${stem} (${i})${ext}`;
    seen.add(candidate.toLowerCase());
    return candidate;
  });
}

/** One line per row of the list: what happened and why. `files` maps Excel row → PNG name. */
export function buildLogCsv(rows: CheckedRow[], files: Map<number, string>, t: DemoText): string {
  const lines = rows.map((r) => {
    const status = r.status === 'ok' ? t.log.ok : r.status === 'skip' ? t.log.skip : t.log.stop;
    const reason = r.issues.map((i) => describeIssue(t, i)).join(t.reasonJoin);
    return [String(r.r), r.name, r.course, status, reason, r.number, files.get(r.r) ?? ''].map(guardFormula);
  });
  return toCsv([t.log.head, ...lines]);
}
