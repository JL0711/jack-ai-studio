// What the Export button hands out: one .docx, or one .docx per article plus
// a ZIP of them all. The build time shown to the visitor is measured here.

import { safeFileName } from '../../lib/files/download';
import { createZip } from '../../lib/files/zip';
import { buildDocx, type FontKey, type HighlightKey } from './docx';
import type { ParsedDoc } from './parse';

export interface ExportOptions {
  keepBrackets: boolean;
  highlight: HighlightKey;
  font: FontKey;
  split: boolean;
}

export interface ExportNames {
  combined: string;
  zip: (n: number) => string;
  /** Title for text that comes before the first heading. */
  untitled: string;
  /** Document title when there is no heading at all. */
  docTitle: string;
}

export interface BuiltFile {
  name: string;
  title: string;
  bytes: Uint8Array;
}

export interface BuiltExport {
  files: BuiltFile[];
  /** The ZIP of all files (split mode only). */
  bundle: { name: string; bytes: Uint8Array } | null;
  /** Bytes the visitor downloads with the main button. */
  size: number;
  /** Milliseconds it took to build everything, measured. */
  ms: number;
}

/** "01 Spring Book Club - Call for Members.docx", unique within the set. */
export function articleFileName(index: number, title: string, taken: Set<string>): string {
  // Title punctuation that file systems refuse, turned into something that reads well.
  const readable = title
    .replace(/\s*:\s*/g, ' - ')
    .replace(/[/\\|]+/g, '-')
    .replace(/["*?<>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const base = safeFileName(`${String(index + 1).padStart(2, '0')} ${readable}`.slice(0, 80), String(index + 1));
  let name = `${base}.docx`;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} (${n}).docx`;
  taken.add(name.toLowerCase());
  return name;
}

export function buildExport(
  doc: ParsedDoc,
  o: ExportOptions,
  names: ExportNames,
  now: Date = new Date(),
  clock: () => number = () => performance.now(),
): BuiltExport {
  const started = clock();
  const docOptions = { keepBrackets: o.keepBrackets, highlight: o.highlight, font: o.font };
  let files: BuiltFile[];
  let bundle: BuiltExport['bundle'] = null;
  if (o.split && doc.articles.length > 1) {
    const taken = new Set<string>();
    files = doc.articles.map((a, i) => {
      const title = a.title ?? names.untitled;
      return {
        name: articleFileName(i, title, taken),
        title,
        bytes: buildDocx(a.paras, { ...docOptions, title }, now),
      };
    });
    bundle = {
      name: names.zip(files.length),
      bytes: createZip(
        files.map((f) => ({ name: f.name, data: f.bytes })),
        now,
      ),
    };
  } else {
    const title = doc.articles.find((a) => a.title)?.title ?? names.docTitle;
    files = [{ name: names.combined, title, bytes: buildDocx(doc.paras, { ...docOptions, title }, now) }];
  }
  return { files, bundle, size: bundle ? bundle.bytes.length : files[0].bytes.length, ms: clock() - started };
}
