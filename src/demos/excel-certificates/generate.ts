// Makes every certificate: draws it on a canvas, encodes a PNG (for the ZIP)
// and a JPEG (for the PDF), then packs the ZIP, the PDF and the log. The
// time shown to the visitor is measured here with performance.now().

import type { Lang } from '../../i18n/strings';
import { createZip, type ZipInput } from '../../lib/files/zip';
import { CERT_W, OUTPUT_H, OUTPUT_W, drawCertificate } from './draw';
import { buildLogCsv, pngFileName, uniqueNames } from './log';
import { buildPdf, type PdfImagePage } from './pdf';
import type { CheckedRow } from './roster';
import { certContent, type Settings } from './state';
import { TEXT } from './text';

export interface Thumb {
  url: string;
  label: string;
}

export interface GenResult {
  zip: Uint8Array;
  pdf: Uint8Array;
  log: string;
  count: number;
  logRows: number;
  ms: number;
  thumbs: Thumb[];
}

export interface GenProgress {
  done: number;
  total: number;
  current: string;
}

const MAX_THUMBS = 12;
const THUMB_W = 360;

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), type, quality);
  });
}

async function canvasBytes(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Uint8Array> {
  return new Uint8Array(await (await canvasBlob(canvas, type, quality)).arrayBuffer());
}

/** Returns null when cancelled. Thumbnail URLs in the result must be revoked by the caller. */
export async function generateCertificates(
  rows: CheckedRow[],
  allRows: CheckedRow[],
  settings: Settings,
  lang: Lang,
  onProgress: (p: GenProgress) => void,
  isCancelled: () => boolean,
): Promise<GenResult | null> {
  const t = TEXT[lang];
  const started = performance.now();
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_W;
  canvas.height = OUTPUT_H;
  const ctx = canvas.getContext('2d', { alpha: false });
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = THUMB_W;
  thumbCanvas.height = Math.round((THUMB_W * OUTPUT_H) / OUTPUT_W);
  const thumbCtx = thumbCanvas.getContext('2d', { alpha: false });
  if (!ctx || !thumbCtx) throw new Error('2D canvas is not available');
  thumbCtx.imageSmoothingQuality = 'high';

  const names = uniqueNames(rows.map((r) => pngFileName(r.number, r.name)));
  const pngs: ZipInput[] = [];
  const pages: PdfImagePage[] = [];
  const thumbs: Thumb[] = [];
  const now = new Date();
  try {
    for (let i = 0; i < rows.length; i++) {
      if (isCancelled()) {
        thumbs.forEach((th) => URL.revokeObjectURL(th.url));
        return null;
      }
      const row = rows[i];
      onProgress({ done: i, total: rows.length, current: row.name });
      drawCertificate(ctx, OUTPUT_W / CERT_W, certContent(row, settings, lang), settings.theme);
      // toBlob encodes off the main thread in most browsers, so the progress bar keeps moving.
      pngs.push({ name: names[i], data: await canvasBytes(canvas, 'image/png'), date: now });
      pages.push({ jpeg: await canvasBytes(canvas, 'image/jpeg', 0.92), width: OUTPUT_W, height: OUTPUT_H });
      if (thumbs.length < MAX_THUMBS) {
        thumbCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
        const blob = await canvasBlob(thumbCanvas, 'image/jpeg', 0.85);
        thumbs.push({ url: URL.createObjectURL(blob), label: `${row.number} · ${row.name}` });
      }
    }
    onProgress({ done: rows.length, total: rows.length, current: '' });
    const org = settings.org.trim() || t.defaults.org;
    const zip = createZip(pngs, now);
    const pdf = buildPdf(pages, {
      title: t.pdfTitle(org),
      author: org,
      producer: 'Jack AI Studio browser demo',
      date: now,
    });
    const log = buildLogCsv(allRows, new Map(rows.map((r, i) => [r.r, names[i]])), t);
    return { zip, pdf, log, count: rows.length, logRows: allRows.length, ms: performance.now() - started, thumbs };
  } catch (e) {
    thumbs.forEach((th) => URL.revokeObjectURL(th.url));
    throw e;
  }
}
