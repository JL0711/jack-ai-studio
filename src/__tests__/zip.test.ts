import { describe, expect, it } from 'vitest';
import { decodeText, safeFileName } from '../lib/files/download';
import { ZipError, crc32, createZip, listZip, readZip, readZipText } from '../lib/files/zip';

const enc = new TextEncoder();

/** A one-entry ZIP whose entry is DEFLATE-compressed (what Word and Excel write). */
async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function deflatedZip(name: string, text: string): Promise<Uint8Array> {
  const data = enc.encode(text);
  const comp = await deflateRaw(data);
  const nameBytes = enc.encode(name);
  const crc = crc32(data);
  const local = new Uint8Array(30 + nameBytes.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint16(4, 20, true);
  lv.setUint16(6, 0x0800, true);
  lv.setUint16(8, 8, true);
  lv.setUint32(14, crc, true);
  lv.setUint32(18, comp.length, true);
  lv.setUint32(22, data.length, true);
  lv.setUint16(26, nameBytes.length, true);
  local.set(nameBytes, 30);
  const central = new Uint8Array(46 + nameBytes.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint16(8, 0x0800, true);
  cv.setUint16(10, 8, true);
  cv.setUint32(16, crc, true);
  cv.setUint32(20, comp.length, true);
  cv.setUint32(24, data.length, true);
  cv.setUint16(28, nameBytes.length, true);
  cv.setUint32(42, 0, true);
  central.set(nameBytes, 46);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, 1, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, central.length, true);
  ev.setUint32(16, local.length + comp.length, true);
  const out = new Uint8Array(local.length + comp.length + central.length + end.length);
  out.set(local, 0);
  out.set(comp, local.length);
  out.set(central, local.length + comp.length);
  out.set(end, local.length + comp.length + central.length);
  return out;
}

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('round-trips files, including Chinese names', async () => {
    const zip = createZip([
      { name: 'word/document.xml', data: '<w:document/>' },
      { name: '证书/张三.png', data: new Uint8Array([1, 2, 3, 250]) },
    ]);
    const names = listZip(zip).map((e) => e.name);
    expect(names).toEqual(['word/document.xml', '证书/张三.png']);
    const files = await readZip(zip);
    expect(new TextDecoder().decode(files.get('word/document.xml'))).toBe('<w:document/>');
    expect(Array.from(files.get('证书/张三.png') ?? [])).toEqual([1, 2, 3, 250]);
    expect(await readZipText(zip, 'missing.xml')).toBeNull();
  });

  it('inflates DEFLATE entries', async () => {
    const text = '<sheetData>' + '<row><c t="s"><v>1</v></c></row>'.repeat(200) + '</sheetData>';
    const zip = await deflatedZip('xl/worksheets/sheet1.xml', text);
    expect(await readZipText(zip, 'xl/worksheets/sheet1.xml')).toBe(text);
  });

  it('filters which entries are extracted', async () => {
    const zip = createZip([
      { name: 'a.xml', data: 'a' },
      { name: 'media/b.png', data: 'b' },
    ]);
    const files = await readZip(zip, (n) => n.endsWith('.xml'));
    expect([...files.keys()]).toEqual(['a.xml']);
  });

  it('refuses things that are not ZIP archives', () => {
    expect(() => listZip(enc.encode('just some text, not a zip at all'))).toThrow(ZipError);
    expect(() => createZip([{ name: 'a', data: '1' }, { name: 'a', data: '2' }])).toThrow(ZipError);
  });
});

describe('file helpers', () => {
  it('decodes UTF-8, UTF-8 with BOM and GBK text', () => {
    expect(decodeText(enc.encode('姓名,课程'))).toBe('姓名,课程');
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...enc.encode('名单')]))).toBe('名单');
    // "中文" in GBK
    expect(decodeText(new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]))).toBe('中文');
  });

  it('makes safe file names', () => {
    expect(safeFileName('张三/证书:2026?.png')).toBe('张三_证书_2026_.png');
    expect(safeFileName('   ')).toBe('file');
  });
});
