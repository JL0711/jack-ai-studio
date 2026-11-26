// Suggested questions for the visitor's own files. Built from their section
// titles, and kept only when the search really answers them from that file;
// when there are no usable titles the demo suggests nothing rather than
// making up questions that go nowhere.

import type { Engine } from './search';
import { hasCjk } from './tokenize';

const GENERIC =
  /^(?:目\s*录|前\s*言|序言|引言|附\s*录|附件\s*\d*|参考文献|致谢|摘要|总则|附则|说明|备注|contents|table of contents|introduction|preface|foreword|appendix|appendices|references|bibliography|acknowledge?ments?|abstract|summary|index|glossary|notes?|overview)$/i;

/** A section title worth asking about: specific, not a number or a boilerplate title. */
export function usableHeading(h: string): boolean {
  const s = h.trim();
  if (!s || GENERIC.test(s)) return false;
  if (!/\p{L}/u.test(s)) return false;
  if (/\d{4,}/.test(s)) return false; // dates, IDs, phone numbers
  if (/[.…·]{3,}/.test(s)) return false;
  if (hasCjk(s)) return s.length >= 2 && s.length <= 18;
  const words = s.split(/\s+/).length;
  return words >= 1 && words <= 7 && s.length >= 4 && s.length <= 60;
}

export function questionFor(heading: string): string {
  return hasCjk(heading) ? `「${heading}」这部分讲了什么？` : `What does the “${heading}” section say?`;
}

/**
 * Up to `max` questions from the uploaded files' headings, at most two per
 * file, each checked against the index (it must be answered from that file).
 * The engine must already have the uploaded files selected.
 */
export function deriveSuggestions(engine: Engine, files: Array<{ id: string; title: string; headings: string[] }>, max = 3): string[] {
  const perFile = files.map((f) => {
    const title = f.title.replace(/\.[a-z0-9]+$/i, '').trim().toLowerCase();
    const seen = new Set<string>();
    return f.headings
      .map((h) => h.replace(/\s+/g, ' ').trim())
      .filter((h, i) => {
        const key = h.toLowerCase();
        if (seen.has(key) || key === title || !usableHeading(h)) return false;
        seen.add(key);
        // The very first title is usually the document's own name.
        return i > 0 || f.headings.length === 1;
      });
  });

  const out: string[] = [];
  const used = new Map<string, number>();
  // Round-robin over files so several files each get a question.
  for (let round = 0; round < 6 && out.length < max; round++) {
    for (let k = 0; k < files.length && out.length < max; k++) {
      const file = files[k];
      if ((used.get(file.id) ?? 0) >= 2) continue;
      const list = perFile[k];
      // Spread picks through the file rather than taking its first titles.
      const step = Math.max(1, Math.floor(list.length / 3));
      const heading = list[round * step];
      if (!heading) continue;
      const q = questionFor(heading);
      const r = engine.ask(q, 3);
      if (r.answer.status === 'ok' && r.hits[0]?.doc.id === file.id) {
        out.push(q);
        used.set(file.id, (used.get(file.id) ?? 0) + 1);
      }
    }
  }
  return out;
}
