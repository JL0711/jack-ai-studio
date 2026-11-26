// Shapes of the demo's state, and the defaults it starts from.

import type { Lang } from '../../i18n/strings';
import type { Delimiter } from './csv';
import type { CertContent, ThemeKey } from './draw';
import { buildRoster, detectMapping, type CheckedRow, type Mapping, type Roster } from './roster';
import { cellsToRows, sampleList } from './sample';
import { TEXT, formatCertDate } from './text';

export interface Settings {
  title: string;
  org: string;
  signer: string;
  role: string;
  prefix: string;
  /** YYYY-MM-DD */
  issueDate: string;
  theme: ThemeKey;
}

export type Source =
  | { kind: 'sample' }
  | { kind: 'file'; name: string; sheetName?: string; fileKind: 'xlsx' | 'csv'; delimiter?: Delimiter };

export interface ListState {
  source: Source;
  roster: Roster;
  mapping: Mapping;
  /** False once the visitor has changed the guessed columns. */
  mappingGuessed: boolean;
}

/** The browser demo's limit per run (the PNGs and the PDF are held in memory). */
export const MAX_GENERATE = 200;

export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function defaultSettings(lang: Lang, today: Date): Settings {
  const d = TEXT[lang].defaults;
  return { ...d, issueDate: isoDate(today), theme: 'jade' };
}

export function sampleState(lang: Lang, today: Date): ListState {
  const roster = buildRoster(cellsToRows(sampleList(lang, today, TEXT[lang].defaults.prefix).cells));
  return { source: { kind: 'sample' }, roster, mapping: detectMapping(roster.headers), mappingGuessed: true };
}

const CJK = /[\u3400-\u9fff]/;

/** Everything printed on one person's certificate. */
export function certContent(row: CheckedRow, s: Settings, lang: Lang): CertContent {
  const t = TEXT[lang];
  const title = s.title.trim() || t.defaults.title;
  return {
    org: s.org.trim() || t.defaults.org,
    title,
    subtitle: CJK.test(title) ? t.cert.subtitle : '',
    intro: t.cert.intro,
    name: row.name,
    body: t.cert.body(row.course, row.grade),
    numberLine: t.cert.numberLabel + row.number,
    dateLine: t.cert.dateLabel + formatCertDate(row.date, lang),
    signer: s.signer.trim(),
    role: s.role.trim(),
    sampleTag: t.cert.sampleTag,
    sealText: t.cert.seal,
  };
}
