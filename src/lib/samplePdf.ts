import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Generates a realistic 2-page local PDF (Page 1: Studio Invoice with header
 * logo badge, Page 2: One-Page Resume / Brief) using Helvetica, Times, and
 * Courier across multiple font weights & sizes so users can immediately test
 * same-font detection, inline text replacement, logo swapping, and signatures.
 */
export async function createSamplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Northwind Studio Sample Packet');
  doc.setAuthor('localpdf');
  doc.setCreator('localpdf');

  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const times = await doc.embedFont(StandardFonts.TimesRoman);
  const timesBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const timesItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const courier = await doc.embedFont(StandardFonts.Courier);
  const courierBold = await doc.embedFont(StandardFonts.CourierBold);

  // Page 1: Studio Invoice
  const p1 = doc.addPage([612, 792]);

  // Subtle top bar accent
  p1.drawRectangle({
    x: 0,
    y: 784,
    width: 612,
    height: 8,
    color: rgb(0.11, 0.12, 0.14)
  });

  // Vector studio logo mark (easy to replace using "Cover underlying logo")
  p1.drawRectangle({
    x: 48,
    y: 716,
    width: 36,
    height: 36,
    color: rgb(0.11, 0.12, 0.14)
  });
  p1.drawRectangle({
    x: 56,
    y: 724,
    width: 20,
    height: 20,
    borderColor: rgb(1, 1, 1),
    borderWidth: 2
  });
  p1.drawText('NW', {
    x: 58,
    y: 730,
    size: 9,
    font: helvBold,
    color: rgb(1, 1, 1)
  });

  // Company title & contact
  p1.drawText('Northwind Design Co.', {
    x: 96,
    y: 734,
    size: 18,
    font: helvBold,
    color: rgb(0.11, 0.12, 0.14)
  });
  p1.drawText('420 Harbor Ave, Suite 300  |  billing@northwind.example', {
    x: 96,
    y: 718,
    size: 9.5,
    font: helv,
    color: rgb(0.38, 0.4, 0.44)
  });

  // Right-side invoice metadata in Courier
  p1.drawText('INVOICE #2026-0418', {
    x: 424,
    y: 738,
    size: 11,
    font: courierBold,
    color: rgb(0.11, 0.12, 0.14)
  });
  p1.drawText('Issued:  2026-11-18', {
    x: 424,
    y: 722,
    size: 9.5,
    font: courier,
    color: rgb(0.32, 0.34, 0.38)
  });
  p1.drawText('Due:     2026-12-02', {
    x: 424,
    y: 708,
    size: 9.5,
    font: courier,
    color: rgb(0.32, 0.34, 0.38)
  });

  // Divider rule
  p1.drawLine({
    start: { x: 48, y: 690 },
    end: { x: 564, y: 690 },
    thickness: 0.75,
    color: rgb(0.84, 0.85, 0.87)
  });

  // Bill To block
  p1.drawText('BILL TO', {
    x: 48,
    y: 666,
    size: 8.5,
    font: helvBold,
    color: rgb(0.45, 0.47, 0.51)
  });
  p1.drawText('Linden Labs Publishing', {
    x: 48,
    y: 648,
    size: 12,
    font: helvBold,
    color: rgb(0.11, 0.12, 0.14)
  });
  p1.drawText('Attn: Samira Patel, Operations Lead', {
    x: 48,
    y: 632,
    size: 10,
    font: helv,
    color: rgb(0.28, 0.3, 0.34)
  });
  p1.drawText('190 Cedar Street, Portland, OR 97204', {
    x: 48,
    y: 617,
    size: 10,
    font: helv,
    color: rgb(0.28, 0.3, 0.34)
  });

  // Line items table header
  p1.drawRectangle({
    x: 48,
    y: 556,
    width: 516,
    height: 24,
    color: rgb(0.95, 0.96, 0.97)
  });
  p1.drawText('DESCRIPTION', { x: 58, y: 564, size: 8.5, font: helvBold, color: rgb(0.32, 0.34, 0.38) });
  p1.drawText('QTY', { x: 374, y: 564, size: 8.5, font: helvBold, color: rgb(0.32, 0.34, 0.38) });
  p1.drawText('RATE', { x: 430, y: 564, size: 8.5, font: helvBold, color: rgb(0.32, 0.34, 0.38) });
  p1.drawText('AMOUNT', { x: 504, y: 564, size: 8.5, font: helvBold, color: rgb(0.32, 0.34, 0.38) });

  const items = [
    ['Product Design System Audit & Component Spec', '12 hrs', '$140.00', '$1,680.00'],
    ['Marketing Brochure & Typography Refresh', '8 hrs', '$125.00', '$1,000.00'],
    ['Print-Ready Export & Accessibility Check', '4 hrs', '$120.00', '$480.00']
  ];

  let rowY = 532;
  for (const [desc, qty, rate, amt] of items) {
    p1.drawText(desc, { x: 58, y: rowY, size: 10, font: helv, color: rgb(0.14, 0.15, 0.18) });
    p1.drawText(qty, { x: 370, y: rowY, size: 9.5, font: courier, color: rgb(0.28, 0.3, 0.34) });
    p1.drawText(rate, { x: 424, y: rowY, size: 9.5, font: courier, color: rgb(0.28, 0.3, 0.34) });
    p1.drawText(amt, { x: 498, y: rowY, size: 9.5, font: courierBold, color: rgb(0.11, 0.12, 0.14) });
    p1.drawLine({
      start: { x: 48, y: rowY - 12 },
      end: { x: 564, y: rowY - 12 },
      thickness: 0.5,
      color: rgb(0.89, 0.9, 0.92)
    });
    rowY -= 36;
  }

  // Totals
  p1.drawText('Subtotal', { x: 410, y: 396, size: 10, font: helv, color: rgb(0.35, 0.37, 0.41) });
  p1.drawText('$3,160.00', { x: 498, y: 396, size: 10, font: courier, color: rgb(0.14, 0.15, 0.18) });
  p1.drawText('Total Due', { x: 410, y: 372, size: 11.5, font: helvBold, color: rgb(0.11, 0.12, 0.14) });
  p1.drawText('$3,160.00', { x: 492, y: 372, size: 11.5, font: courierBold, color: rgb(0.11, 0.12, 0.14) });

  // Terms note in Times Roman
  p1.drawText('Notes & Payment Terms', {
    x: 48,
    y: 282,
    size: 11,
    font: timesBold,
    color: rgb(0.14, 0.15, 0.18)
  });
  p1.drawText(
    'Please remit payment within 14 calendar days via ACH or wire transfer referencing',
    { x: 48, y: 262, size: 10.5, font: times, color: rgb(0.28, 0.3, 0.34) }
  );
  p1.drawText(
    'Invoice #2026-0418. Click any line on this page to edit with automatic font matching.',
    { x: 48, y: 246, size: 10.5, font: times, color: rgb(0.28, 0.3, 0.34) }
  );

  // Signature area
  p1.drawLine({
    start: { x: 48, y: 120 },
    end: { x: 240, y: 120 },
    thickness: 0.75,
    color: rgb(0.65, 0.67, 0.71)
  });
  p1.drawText('Authorized Signature', {
    x: 48,
    y: 106,
    size: 8.5,
    font: helv,
    color: rgb(0.45, 0.47, 0.51)
  });

  // Page 2: Resume / Brief Template
  const p2 = doc.addPage([612, 792]);
  p2.drawText('Jordan Ellis', {
    x: 54,
    y: 728,
    size: 22,
    font: timesBold,
    color: rgb(0.1, 0.1, 0.12)
  });
  p2.drawText('Senior Product Designer  |  jordan.ellis@example.com  |  Seattle, WA', {
    x: 54,
    y: 706,
    size: 10,
    font: helv,
    color: rgb(0.36, 0.38, 0.42)
  });
  p2.drawLine({
    start: { x: 54, y: 692 },
    end: { x: 558, y: 692 },
    thickness: 0.75,
    color: rgb(0.82, 0.84, 0.86)
  });

  p2.drawText('EXPERIENCE', {
    x: 54,
    y: 666,
    size: 10,
    font: helvBold,
    color: rgb(0.11, 0.12, 0.14)
  });
  p2.drawText('Lead Designer, Northwind Design Co.', {
    x: 54,
    y: 644,
    size: 11.5,
    font: timesBold,
    color: rgb(0.11, 0.12, 0.14)
  });
  p2.drawText('2023 - Present', {
    x: 482,
    y: 644,
    size: 10,
    font: timesItalic,
    color: rgb(0.38, 0.4, 0.44)
  });
  p2.drawText(
    'Led modular web workflows, document publishing systems, and local-first tools for small teams.',
    { x: 54, y: 624, size: 10.5, font: times, color: rgb(0.24, 0.25, 0.28) }
  );

  p2.drawText('TOOLS & STACK', {
    x: 54,
    y: 578,
    size: 10,
    font: helvBold,
    color: rgb(0.11, 0.12, 0.14)
  });
  p2.drawText('TypeScript, React, Figma, CSS Architecture, PDF.js, Accessibility Audits', {
    x: 54,
    y: 558,
    size: 9.5,
    font: courier,
    color: rgb(0.24, 0.26, 0.3)
  });

  return doc.save();
}

// Pure TypeScript CRC-32 + Adler-32 + valid uncompressed PNG encoder
// (works identically in Browser and Node/Vitest without native canvas bindings).
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function makePngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) {
    chunk[4 + i] = type.charCodeAt(i);
  }
  chunk.set(data, 8);
  const crcInput = chunk.subarray(4, 8 + data.length);
  view.setUint32(8 + data.length, crc32(crcInput), false);
  return chunk;
}

/**
 * Encodes an RGBA pixel buffer into a spec-compliant PNG Uint8Array.
 */
export function encodeRgbaToPng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // deflate
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // non-interlaced
  const ihdr = makePngChunk('IHDR', ihdrData);

  // Raw scanlines with filter byte 0 per row
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowOut = y * (stride + 1);
    raw[rowOut] = 0;
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), rowOut + 1);
  }

  // Zlib stream using uncompressed stored deflate blocks (max 65535 bytes/block)
  const blocks: Uint8Array[] = [];
  blocks.push(new Uint8Array([0x78, 0x01])); // zlib header (no compression)

  const maxBlock = 65535;
  let offset = 0;
  while (offset < raw.length) {
    const len = Math.min(maxBlock, raw.length - offset);
    const isFinal = offset + len >= raw.length ? 1 : 0;
    const header = new Uint8Array(5);
    header[0] = isFinal;
    header[1] = len & 0xff;
    header[2] = (len >>> 8) & 0xff;
    const nlen = ~len & 0xffff;
    header[3] = nlen & 0xff;
    header[4] = (nlen >>> 8) & 0xff;
    blocks.push(header);
    blocks.push(raw.subarray(offset, offset + len));
    offset += len;
  }

  const adlerBuf = new Uint8Array(4);
  new DataView(adlerBuf.buffer).setUint32(0, adler32(raw), false);
  blocks.push(adlerBuf);

  const zlibLen = blocks.reduce((sum, b) => sum + b.length, 0);
  const zlibBytes = new Uint8Array(zlibLen);
  let pos = 0;
  for (const b of blocks) {
    zlibBytes.set(b, pos);
    pos += b.length;
  }

  const idat = makePngChunk('IDAT', zlibBytes);
  const iend = makePngChunk('IEND', new Uint8Array(0));

  const png = new Uint8Array(signature.length + ihdr.length + idat.length + iend.length);
  let cursor = 0;
  png.set(signature, cursor);
  cursor += signature.length;
  png.set(ihdr, cursor);
  cursor += ihdr.length;
  png.set(idat, cursor);
  cursor += idat.length;
  png.set(iend, cursor);

  return png;
}

/**
 * Generates a crisp 64x64 minimalist studio emblem PNG (real valid PNG bytes)
 * for quick logo-replacement testing and Vitest verification.
 */
export function createMinimalSampleLogoPng(): Uint8Array {
  const width = 64;
  const height = 64;
  const rgba = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const inOuterBorder = x < 4 || x >= width - 4 || y < 4 || y >= height - 4;
      const inInnerMark =
        (x >= 16 && x <= 23 && y >= 16 && y <= 47) ||
        (y >= 40 && y <= 47 && x >= 16 && x <= 46) ||
        (x >= 32 && x <= 46 && y >= 16 && y <= 23);

      if (inOuterBorder) {
        rgba[idx] = 24;
        rgba[idx + 1] = 24;
        rgba[idx + 2] = 27;
        rgba[idx + 3] = 255;
      } else if (inInnerMark) {
        rgba[idx] = 255;
        rgba[idx + 1] = 255;
        rgba[idx + 2] = 255;
        rgba[idx + 3] = 255;
      } else {
        rgba[idx] = 30;
        rgba[idx + 1] = 64;
        rgba[idx + 2] = 128;
        rgba[idx + 3] = 255;
      }
    }
  }

  return encodeRgbaToPng(width, height, rgba);
}

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += BASE64_ALPHABET[(triple >>> 18) & 0x3f];
    out += BASE64_ALPHABET[(triple >>> 12) & 0x3f];
    out += i + 1 < bytes.length ? BASE64_ALPHABET[(triple >>> 6) & 0x3f] : '=';
    out += i + 2 < bytes.length ? BASE64_ALPHABET[triple & 0x3f] : '=';
  }
  return out;
}

export function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${encodeBase64(bytes)}`;
}
