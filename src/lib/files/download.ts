// Saving a file the page made (a .docx, a .zip of certificates, a CSV log…)
// and reading a file the visitor picked. Everything stays in the browser.

/** Starts a download of `data` as `filename`. */
export function downloadBlob(data: Blob, filename: string): void {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari needs the URL to live a little after the click.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function downloadBytes(bytes: Uint8Array, filename: string, mime: string): void {
  downloadBlob(new Blob([bytes as BlobPart], { type: mime }), filename);
}

export function downloadText(text: string, filename: string, mime = 'text/plain;charset=utf-8'): void {
  // A BOM so Excel opens UTF-8 CSV files with Chinese text correctly.
  const bom = mime.startsWith('text/csv') ? '﻿' : '';
  downloadBlob(new Blob([bom + text], { type: mime }), filename);
}

export const MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
  pdf: 'application/pdf',
  png: 'image/png',
  csv: 'text/csv;charset=utf-8',
} as const;

/** A file name safe on Windows, macOS and phones (keeps Chinese characters). */
export function safeFileName(name: string, fallback = 'file'): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 120);
  return cleaned || fallback;
}

export async function readFileBytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/**
 * Decodes text that may be UTF-8 (with or without BOM), UTF-16 (with BOM) or
 * GB18030/GBK — Chinese Windows tools still save .txt and .csv files as GBK.
 */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder('gb18030').decode(bytes);
    } catch {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }
}

export async function readFileText(file: Blob): Promise<string> {
  return decodeText(await readFileBytes(file));
}

/** "1.2 MB", "820 KB" */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
