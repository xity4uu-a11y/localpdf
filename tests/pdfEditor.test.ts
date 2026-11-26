import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  detectFontMatch,
  estimateInkAndBackgroundFromPixels,
  getCssFontStyle,
  getStandardFontKey,
  hexToRgb01,
  normalizeHexColor,
  rgb01ToHex,
  stripSubsetPrefix
} from '../src/lib/fontMatcher';
import {
  applyEditsAndExport,
  computeReplacePatchRect,
  detectImageFormat,
  pdfRectToViewportRect,
  sanitizeForWinAnsi,
  viewportPointToPdfPoint,
  viewportRectToPdfRect
} from '../src/lib/pdfEditor';
import {
  bytesToDataUrl,
  createMinimalSampleLogoPng,
  createSamplePdf
} from '../src/lib/samplePdf';
import { BUNDLED_PLUGINS, collectPluginFontAliases } from '../src/lib/presets';
import { validateAllPlugins } from '../scripts/validate-plugins.mjs';
import type { DocumentEdit, PagePlanItem, SourceDocument } from '../src/lib/types';

function startsWithPdfHeader(bytes: Uint8Array): boolean {
  const header = String.fromCharCode(...bytes.subarray(0, 5));
  return header === '%PDF-';
}

describe('fontMatcher — PDF font detection & typography mapping', () => {
  it('strips 6-letter PDF subset prefixes cleanly', () => {
    expect(stripSubsetPrefix('ABCDEF+Arial-BoldMT')).toBe('Arial-BoldMT');
    expect(stripSubsetPrefix('XYZQWE+TimesNewRomanPS-ItalicMT')).toBe('TimesNewRomanPS-ItalicMT');
    expect(stripSubsetPrefix('Helvetica-Bold')).toBe('Helvetica-Bold');
  });

  it('classifies subset Arial Bold as Helvetica Bold', () => {
    const match = detectFontMatch('ABCDEF+Arial-BoldMT');
    expect(match.family).toBe('helvetica');
    expect(match.bold).toBe(true);
    expect(match.italic).toBe(false);
    expect(match.fontKey).toBe('HelveticaBold');
    expect(match.displayLabel).toBe('Helvetica Bold');
  });

  it('classifies Times New Roman Italic and Georgia Bold as Times family', () => {
    const timesItalic = detectFontMatch('TimesNewRomanPS-ItalicMT');
    expect(timesItalic.family).toBe('times');
    expect(timesItalic.bold).toBe(false);
    expect(timesItalic.italic).toBe(true);
    expect(timesItalic.fontKey).toBe('TimesRomanItalic');

    const georgiaBold = detectFontMatch('KLMNOP+Georgia-BoldItalic');
    expect(georgiaBold.family).toBe('times');
    expect(georgiaBold.bold).toBe(true);
    expect(georgiaBold.italic).toBe(true);
    expect(georgiaBold.fontKey).toBe('TimesRomanBoldItalic');
  });

  it('classifies Courier, Consolas, and JetBrainsMono as Courier family', () => {
    const courier = detectFontMatch('CourierNewPS-BoldMT');
    expect(courier.family).toBe('courier');
    expect(courier.bold).toBe(true);
    expect(courier.fontKey).toBe('CourierBold');

    const jb = detectFontMatch('QWERAS+JetBrainsMono-Regular');
    expect(jb.family).toBe('courier');
    expect(jb.bold).toBe(false);
    expect(jb.fontKey).toBe('Courier');
  });

  it('respects custom plugin font aliases and CSS style mapping', () => {
    const aliases = collectPluginFontAliases();
    const charter = detectFontMatch('UVWXYZ+Charter-Bold', undefined, aliases);
    expect(charter.family).toBe('times');
    expect(charter.bold).toBe(true);

    const css = getCssFontStyle('times', true, true);
    expect(css.fontWeight).toBe(700);
    expect(css.fontStyle).toBe('italic');
    expect(css.fontFamily).toContain('serif');
    expect(getStandardFontKey('helvetica', false, true)).toBe('HelveticaOblique');
  });

  it('normalizes hex colors and converts RGB 0..1 cleanly', () => {
    expect(normalizeHexColor('#ABC')).toBe('#aabbcc');
    expect(normalizeHexColor('1D1D1F')).toBe('#1d1d1f');
    const rgb01 = hexToRgb01('#336699');
    expect(rgb01.r).toBeCloseTo(0.2, 2);
    expect(rgb01.g).toBeCloseTo(0.4, 2);
    expect(rgb01.b).toBeCloseTo(0.6, 2);
    expect(rgb01ToHex(rgb01)).toBe('#336699');
  });
});

describe('coordinate transforms & WinAnsi sanitization', () => {
  it('round-trips PDF rects and viewport rects with sub-pixel accuracy', () => {
    const pageH = 792;
    const scale = 1.5;
    const original = { x: 48, y: 640, width: 180, height: 32 };
    const vp = pdfRectToViewportRect(original, pageH, scale);
    const back = viewportRectToPdfRect(vp, pageH, scale);

    expect(back.x).toBeCloseTo(original.x, 5);
    expect(back.y).toBeCloseTo(original.y, 5);
    expect(back.width).toBeCloseTo(original.width, 5);
    expect(back.height).toBeCloseTo(original.height, 5);

    const pt = viewportPointToPdfPoint(90, 150, pageH, scale);
    expect(pt.pdfX).toBeCloseTo(60, 5);
    expect(pt.pdfY).toBeCloseTo(692, 5);
  });

  it('sanitizes unsupported Unicode codepoints while preserving WinAnsi punctuation', () => {
    const text = 'Invoice — Total: €1,250.00 → Paid';
    const sanitized = sanitizeForWinAnsi(text);
    expect(sanitized).toBe('Invoice — Total: €1,250.00 -> Paid');
  });
});

describe('samplePdf & real PNG generator', () => {
  it('generates a valid 2-page sample PDF loadable by pdf-lib', async () => {
    const bytes = await createSamplePdf();
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(startsWithPdfHeader(bytes)).toBe(true);

    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(2);
    const { width, height } = loaded.getPage(0).getSize();
    expect(width).toBe(612);
    expect(height).toBe(792);
  });

  it('generates a real spec-compliant PNG buffer embeddable in pdf-lib', async () => {
    const pngBytes = createMinimalSampleLogoPng();
    expect(detectImageFormat(pngBytes, 'image/jpeg')).toBe('png');
    expect(Array.from(pngBytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

    const doc = await PDFDocument.create();
    const embedded = await doc.embedPng(pngBytes);
    expect(embedded.width).toBe(64);
    expect(embedded.height).toBe(64);
    expect(bytesToDataUrl(pngBytes, 'image/png')).toMatch(/^data:image\/png;base64,/);
  });
});

describe('pdfEditor — end-to-end non-destructive edit, page ops & merge pipeline', () => {
  it('applies text replacement, new text, logo cover+embed, whiteout, shapes, signatures, page reorder, rotation, blank page, deletion, and PDF merge', async () => {
    // 1. Generate primary 2-page sample PDF
    const primaryBytes = await createSamplePdf();

    // 2. Generate secondary 1-page PDF to merge
    const secondaryDoc = await PDFDocument.create();
    const helv = await secondaryDoc.embedFont(StandardFonts.Helvetica);
    const secPage = secondaryDoc.addPage([612, 792]);
    secPage.drawText('Appendix A — Merged Locally', { x: 54, y: 720, size: 14, font: helv });
    const secondaryBytes = await secondaryDoc.save();

    const sources: SourceDocument[] = [
      { id: 'src-1', name: 'sample.pdf', bytes: primaryBytes, pageCount: 2 },
      { id: 'src-2', name: 'appendix.pdf', bytes: secondaryBytes, pageCount: 1 }
    ];

    // Reorder: start with Page 2 (rotated 90°), then Page 1, then a Blank Page, then Merged Appendix
    // (and simulate deleting an intermediate page by leaving only these 4)
    const pagePlan: PagePlanItem[] = [
      { id: 'p-reordered-2', sourceDocId: 'src-1', sourcePageIndex: 1, rotationDelta: 90 },
      { id: 'p-reordered-1', sourceDocId: 'src-1', sourcePageIndex: 0, rotationDelta: 0 },
      {
        id: 'p-blank',
        sourceDocId: 'blank',
        sourcePageIndex: 0,
        rotationDelta: 0,
        isBlank: true,
        blankWidthPt: 595,
        blankHeightPt: 842
      },
      { id: 'p-merged-appendix', sourceDocId: 'src-2', sourcePageIndex: 0, rotationDelta: 180 }
    ];

    const logoPng = createMinimalSampleLogoPng();
    const logoDataUrl = bytesToDataUrl(logoPng, 'image/png');

    const edits: DocumentEdit[] = [
      // Same-font text replacement on Invoice page
      {
        id: 'e-replace',
        kind: 'replace-text',
        pagePlanId: 'p-reordered-1',
        originalText: 'Northwind Design Co.',
        text: 'Harborline Studio LLC',
        patchRect: { x: 96, y: 730, width: 190, height: 22 },
        pdfX: 96,
        baselineY: 734,
        fontFamily: 'helvetica',
        bold: true,
        italic: false,
        fontSizePt: 18,
        colorHex: '#111827',
        backgroundHex: '#ffffff',
        paddingPt: 2,
        coverOriginal: true,
        detectedFontLabel: 'Helvetica Bold · 18pt'
      },
      // Multi-line new text block with background fill
      {
        id: 'e-add-text',
        kind: 'add-text',
        pagePlanId: 'p-reordered-1',
        text: 'STATUS: PAID IN FULL\nRef #ACH-8841',
        pdfX: 400,
        pdfY: 660,
        fontFamily: 'courier',
        bold: true,
        italic: false,
        fontSizePt: 10,
        colorHex: '#1e7e34',
        backgroundHex: '#edf7f0',
        opacity: 1
      },
      // Logo replacement with opaque backing rectangle covering underlying logo
      {
        id: 'e-logo',
        kind: 'image',
        pagePlanId: 'p-reordered-1',
        name: 'harborline-mark.png',
        bytes: logoPng,
        mimeType: 'image/png',
        previewDataUrl: logoDataUrl,
        pdfX: 48,
        pdfY: 716,
        pdfWidth: 38,
        pdfHeight: 38,
        aspectRatio: 1,
        lockAspectRatio: true,
        coverUnderlying: true,
        coverColorHex: '#ffffff',
        opacity: 1
      },
      // Whiteout cover patch
      {
        id: 'e-whiteout',
        kind: 'shape',
        pagePlanId: 'p-reordered-1',
        shapeType: 'whiteout',
        pdfX: 48,
        pdfY: 242,
        pdfWidth: 420,
        pdfHeight: 16,
        fillHex: '#ffffff',
        strokeHex: '#000000',
        strokeWidthPt: 0,
        opacity: 1
      },
      // Bordered rectangle + horizontal line on blank page
      {
        id: 'e-rect',
        kind: 'shape',
        pagePlanId: 'p-blank',
        shapeType: 'rect',
        pdfX: 48,
        pdfY: 700,
        pdfWidth: 220,
        pdfHeight: 60,
        fillHex: '#f5f5f7',
        strokeHex: '#1d1d1f',
        strokeWidthPt: 1,
        opacity: 0.95
      },
      {
        id: 'e-line',
        kind: 'shape',
        pagePlanId: 'p-blank',
        shapeType: 'line',
        pdfX: 48,
        pdfY: 660,
        pdfWidth: 500,
        pdfHeight: 4,
        fillHex: '#ffffff',
        strokeHex: '#71717a',
        strokeWidthPt: 1,
        opacity: 1
      },
      // Drawn PNG signature on Invoice page
      {
        id: 'e-sig-drawn',
        kind: 'signature',
        pagePlanId: 'p-reordered-1',
        mode: 'drawn',
        pngBytes: logoPng,
        previewDataUrl: logoDataUrl,
        fontFamily: 'times',
        fontSizePt: 18,
        inkHex: '#18181b',
        pdfX: 52,
        pdfY: 122,
        pdfWidth: 140,
        pdfHeight: 42,
        showBaseline: false
      },
      // Typed vector italic signature on merged Appendix page
      {
        id: 'e-sig-typed',
        kind: 'signature',
        pagePlanId: 'p-merged-appendix',
        mode: 'typed',
        typedText: 'Jordan Ellis',
        fontFamily: 'times',
        fontSizePt: 20,
        inkHex: '#1e3a8a',
        pdfX: 54,
        pdfY: 100,
        pdfWidth: 180,
        pdfHeight: 44,
        showBaseline: true
      }
    ];

    const exportedBytes = await applyEditsAndExport(sources, pagePlan, edits);
    expect(startsWithPdfHeader(exportedBytes)).toBe(true);
    expect(exportedBytes.byteLength).toBeGreaterThan(primaryBytes.byteLength);

    // Re-parse exported PDF in pdf-lib to verify structural integrity
    const reloaded = await PDFDocument.load(exportedBytes, { updateMetadata: false });
    expect(reloaded.getPageCount()).toBe(4);
    expect(reloaded.getCreator()).toBe('localpdf');
    expect(reloaded.getProducer()).toContain('localpdf');

    // Verify rotations
    expect(reloaded.getPage(0).getRotation().angle).toBe(90);
    expect(reloaded.getPage(1).getRotation().angle).toBe(0);
    expect(reloaded.getPage(2).getRotation().angle).toBe(0);
    expect(reloaded.getPage(3).getRotation().angle).toBe(180);

    // Verify custom blank page A4 size preserved
    const blankSize = reloaded.getPage(2).getSize();
    expect(blankSize.width).toBe(595);
    expect(blankSize.height).toBe(842);

    // Verify deleting a page reduces exported page count cleanly
    const afterDelete = await applyEditsAndExport(
      sources,
      pagePlan.filter((p) => p.id !== 'p-blank'),
      edits
    );
    const reloadedAfterDelete = await PDFDocument.load(afterDelete);
    expect(reloadedAfterDelete.getPageCount()).toBe(3);
  });

  it('throws cleanly if pagePlan is empty', async () => {
    await expect(applyEditsAndExport([], [], [])).rejects.toThrow(/zero pages/i);
  });
});

describe('striped table color sampling & compact patch bounds', () => {
  function createRgbaBuffer(
    width: number,
    height: number,
    fill: [number, number, number]
  ): Uint8ClampedArray {
    const buf = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      buf[i * 4] = fill[0];
      buf[i * 4 + 1] = fill[1];
      buf[i * 4 + 2] = fill[2];
      buf[i * 4 + 3] = 255;
    }
    return buf;
  }

  function paintRect(
    buf: Uint8ClampedArray,
    bufW: number,
    x0: number,
    y0: number,
    w: number,
    h: number,
    color: [number, number, number]
  ) {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const idx = (y * bufW + x) * 4;
        buf[idx] = color[0];
        buf[idx + 1] = color[1];
        buf[idx + 2] = color[2];
        buf[idx + 3] = 255;
      }
    }
  }

  it('recovers pure white background and crisp ink on a white row touching adjacent gray zebra stripes', () => {
    const w = 120;
    const h = 30;
    // Alternating table: gray stripes above (y=0..9) and below (y=20..29), white row in middle (y=10..19)
    const buf = createRgbaBuffer(w, h, [229, 229, 229]); // #e5e5e5
    paintRect(buf, w, 0, 10, w, 10, [255, 255, 255]); // white row

    // Paint anti-aliased halos + crisp black glyph strokes inside the white row
    for (let gx = 12; gx < 104; gx += 12) {
      paintRect(buf, w, gx - 1, 12, 4, 6, [175, 175, 175]); // anti-aliased edge halo
      paintRect(buf, w, gx, 12, 2, 6, [0, 0, 0]); // solid black core stroke
    }

    // Even when bounding rect touches 1px of adjacent gray stripes top & bottom, modal background stays #ffffff
    const res = estimateInkAndBackgroundFromPixels(buf, w, h, {
      x: 8,
      y: 9,
      width: 104,
      height: 12
    });
    expect(res.bgHex).toBe('#ffffff');
    expect(res.inkHex).toBe('#000000');
  });

  it('recovers exact gray stripe background on a shaded zebra row sandwiched between white rows', () => {
    const w = 100;
    const h = 30;
    const buf = createRgbaBuffer(w, h, [255, 255, 255]);
    paintRect(buf, w, 0, 10, w, 10, [229, 229, 229]); // #e5e5e5 shaded row
    for (let gx = 10; gx < 88; gx += 10) {
      paintRect(buf, w, gx, 12, 2, 6, [17, 17, 17]); // #111111 text
    }

    const res = estimateInkAndBackgroundFromPixels(buf, w, h, {
      x: 6,
      y: 10,
      width: 88,
      height: 10
    });
    expect(res.bgHex).toBe('#e5e5e5');
    expect(res.inkHex).toBe('#111111');
  });

  it('keeps crisp dark ink on narrow numeric cells and recovers dark banner + light ink', () => {
    // Narrow numeric cell ("0.01" ~ 18x10 px)
    const bufNarrow = createRgbaBuffer(26, 12, [255, 255, 255]);
    paintRect(bufNarrow, 26, 6, 3, 2, 6, [18, 18, 18]);
    paintRect(bufNarrow, 26, 12, 3, 2, 6, [18, 18, 18]);
    paintRect(bufNarrow, 26, 17, 3, 2, 6, [18, 18, 18]);
    const narrow = estimateInkAndBackgroundFromPixels(bufNarrow, 26, 12, {
      x: 4,
      y: 1,
      width: 18,
      height: 10
    });
    expect(narrow.bgHex).toBe('#ffffff');
    expect(narrow.inkHex).toBe('#121212');

    // Dark header banner (#18181b) with white text (#ffffff)
    const bufDark = createRgbaBuffer(80, 20, [24, 24, 27]);
    for (let gx = 10; gx < 68; gx += 10) {
      paintRect(bufDark, 80, gx, 5, 2, 10, [255, 255, 255]);
    }
    const dark = estimateInkAndBackgroundFromPixels(bufDark, 80, 20, {
      x: 6,
      y: 2,
      width: 68,
      height: 16
    });
    expect(dark.bgHex).toBe('#18181b');
    expect(dark.inkHex).toBe('#ffffff');
  });

  it('keeps vertical cover patch bounds tight for compact table rows', () => {
    const patch = computeReplacePatchRect({
      patchRect: { x: 120, y: 400, width: 42, height: 9.2 },
      baselineY: 401.76,
      fontSizePt: 8,
      paddingPt: 1
    });
    expect(patch.x).toBe(119);
    expect(patch.width).toBe(44);
    // Vertical height stays well inside a compact 11pt table row
    expect(patch.height).toBeLessThanOrEqual(10.5);
  });
});

describe('community preset plugins validation', () => {
  it('loads all 5 bundled plugins and passes strict schema validation', () => {
    expect(BUNDLED_PLUGINS.length).toBe(5);
    const results = validateAllPlugins();
    expect(results.length).toBe(5);
    for (const res of results) {
      expect(res.ok, `${res.file}: ${res.errors.join('; ')}`).toBe(true);
    }
  });
});
