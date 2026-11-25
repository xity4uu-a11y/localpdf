import {
  PDFDocument,
  PDFFont,
  StandardFonts,
  degrees,
  rgb
} from 'pdf-lib';
import { getStandardFontKey, hexToRgb01 } from './fontMatcher';
import type {
  DocumentEdit,
  PagePlanItem,
  PdfRect,
  SourceDocument,
  StandardFontFamily,
  StandardFontKey,
  ViewportRect
} from './types';

const STANDARD_FONT_ENUM_MAP: Record<StandardFontKey, StandardFonts> = {
  Helvetica: StandardFonts.Helvetica,
  HelveticaBold: StandardFonts.HelveticaBold,
  HelveticaOblique: StandardFonts.HelveticaOblique,
  HelveticaBoldOblique: StandardFonts.HelveticaBoldOblique,
  TimesRoman: StandardFonts.TimesRoman,
  TimesRomanBold: StandardFonts.TimesRomanBold,
  TimesRomanItalic: StandardFonts.TimesRomanItalic,
  TimesRomanBoldItalic: StandardFonts.TimesRomanBoldItalic,
  Courier: StandardFonts.Courier,
  CourierBold: StandardFonts.CourierBold,
  CourierOblique: StandardFonts.CourierOblique,
  CourierBoldOblique: StandardFonts.CourierBoldOblique
};

/**
 * Converts a PDF user-space rectangle (bottom-left origin) into browser
 * viewport CSS pixels (top-left origin).
 */
export function pdfRectToViewportRect(
  rect: PdfRect,
  pageHeightPt: number,
  scale: number
): ViewportRect {
  return {
    x: rect.x * scale,
    y: (pageHeightPt - rect.y - rect.height) * scale,
    width: rect.width * scale,
    height: rect.height * scale
  };
}

/**
 * Converts a browser viewport rectangle (top-left origin) into PDF user-space
 * coordinates (bottom-left origin).
 */
export function viewportRectToPdfRect(
  rect: ViewportRect,
  pageHeightPt: number,
  scale: number
): PdfRect {
  const safeScale = scale > 0 ? scale : 1;
  const pdfHeight = rect.height / safeScale;
  return {
    x: rect.x / safeScale,
    y: pageHeightPt - rect.y / safeScale - pdfHeight,
    width: rect.width / safeScale,
    height: pdfHeight
  };
}

/**
 * Converts a viewport click point into a PDF user-space coordinate.
 */
export function viewportPointToPdfPoint(
  vpX: number,
  vpY: number,
  pageHeightPt: number,
  scale: number
): { pdfX: number; pdfY: number } {
  const safeScale = scale > 0 ? scale : 1;
  return {
    pdfX: vpX / safeScale,
    pdfY: pageHeightPt - vpY / safeScale
  };
}

/**
 * Ensures text passed to PDF StandardFonts (WinAnsi encoding) never crashes
 * export on unsupported Unicode codepoints while preserving all WinAnsi glyphs.
 */
export function sanitizeForWinAnsi(input: string): string {
  const replacements: Record<string, string> = {
    '\u00A0': ' ',
    '\u2002': ' ',
    '\u2003': ' ',
    '\u2009': ' ',
    '\u2010': '-',
    '\u2011': '-',
    '\u2012': '-',
    '\u2015': '—',
    '\u2192': '->',
    '\u2190': '<-',
    '\u2212': '-',
    '\u2713': 'x',
    '\u2714': 'x'
  };

  let out = '';
  for (const ch of input) {
    if (ch in replacements) {
      out += replacements[ch];
      continue;
    }
    const code = ch.charCodeAt(0);
    // Printable ASCII, newline, tab, Latin-1 supplement, and common WinAnsi CP1252 glyphs
    const isWinAnsiSafe =
      ch === '\n' ||
      ch === '\r' ||
      ch === '\t' ||
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0xa0 && code <= 0xff) ||
      code === 0x2013 || // en-dash
      code === 0x2014 || // em-dash
      code === 0x2018 || // left single quote
      code === 0x2019 || // right single quote
      code === 0x201c || // left double quote
      code === 0x201d || // right double quote
      code === 0x2022 || // bullet
      code === 0x2026 || // ellipsis
      code === 0x20ac || // euro
      code === 0x2122; // trademark

    out += isWinAnsiSafe ? ch : '?';
  }
  return out;
}

export function detectImageFormat(bytes: Uint8Array, fallbackMime: 'image/png' | 'image/jpeg'): 'png' | 'jpeg' {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  return fallbackMime === 'image/png' ? 'png' : 'jpeg';
}

function toPdfRgb(hex: string) {
  const { r, g, b } = hexToRgb01(hex);
  return rgb(r, g, b);
}

/**
 * Applies all non-destructive edits, page reorganizations, rotations, blank
 * insertions, and multi-PDF merges to produce clean, watermark-free PDF bytes
 * completely inside the browser.
 */
export async function applyEditsAndExport(
  sources: SourceDocument[],
  pagePlan: PagePlanItem[],
  edits: DocumentEdit[]
): Promise<Uint8Array> {
  if (pagePlan.length === 0) {
    throw new Error('Cannot export a document with zero pages.');
  }

  const outDoc = await PDFDocument.create({ updateMetadata: false });
  outDoc.setCreator('localpdf');
  outDoc.setProducer('localpdf (client-side browser engine)');
  outDoc.setModificationDate(new Date());

  const sourceCache = new Map<string, PDFDocument>();
  const sourceById = new Map<string, SourceDocument>();
  for (const src of sources) {
    sourceById.set(src.id, src);
  }

  const fontCache = new Map<StandardFontKey, PDFFont>();
  async function getFont(
    family: StandardFontFamily,
    bold: boolean,
    italic: boolean
  ): Promise<PDFFont> {
    const key = getStandardFontKey(family, bold, italic);
    const cached = fontCache.get(key);
    if (cached) return cached;
    const embedded = await outDoc.embedFont(STANDARD_FONT_ENUM_MAP[key]);
    fontCache.set(key, embedded);
    return embedded;
  }

  // Group edits by target pagePlanItem.id while preserving z-order
  const editsByPage = new Map<string, DocumentEdit[]>();
  for (const edit of edits) {
    const list = editsByPage.get(edit.pagePlanId) ?? [];
    list.push(edit);
    editsByPage.set(edit.pagePlanId, list);
  }

  for (const planItem of pagePlan) {
    let page;
    if (planItem.isBlank) {
      page = outDoc.addPage([planItem.blankWidthPt ?? 612, planItem.blankHeightPt ?? 792]);
    } else {
      let srcPdf = sourceCache.get(planItem.sourceDocId);
      if (!srcPdf) {
        const srcDoc = sourceById.get(planItem.sourceDocId);
        if (!srcDoc) {
          throw new Error(`Missing source PDF for id "${planItem.sourceDocId}".`);
        }
        srcPdf = await PDFDocument.load(srcDoc.bytes, { ignoreEncryption: true });
        sourceCache.set(planItem.sourceDocId, srcPdf);
      }

      const [copied] = await outDoc.copyPages(srcPdf, [planItem.sourcePageIndex]);
      page = outDoc.addPage(copied);
    }

    if (planItem.rotationDelta !== 0) {
      const currentAngle = page.getRotation().angle;
      page.setRotation(degrees((currentAngle + planItem.rotationDelta) % 360));
    }

    const pageEdits = editsByPage.get(planItem.id) ?? [];

    for (const edit of pageEdits) {
      if (edit.kind === 'replace-text') {
        const pad = Math.max(0, edit.paddingPt);
        if (edit.coverOriginal) {
          const patchX = edit.patchRect.x - pad;
          const patchY = Math.min(edit.patchRect.y, edit.baselineY - edit.fontSizePt * 0.28) - pad * 0.75;
          const patchW = edit.patchRect.width + pad * 2;
          const patchH = Math.max(edit.patchRect.height, edit.fontSizePt * 1.2) + pad * 1.5;

          page.drawRectangle({
            x: patchX,
            y: patchY,
            width: patchW,
            height: patchH,
            color: toPdfRgb(edit.backgroundHex),
            borderWidth: 0
          });
        }

        const safeText = sanitizeForWinAnsi(edit.text);
        if (safeText.length > 0) {
          const font = await getFont(edit.fontFamily, edit.bold, edit.italic);
          const lines = safeText.split(/\r?\n/);
          const lineHeight = edit.fontSizePt * 1.22;
          lines.forEach((line, idx) => {
            if (line.length === 0) return;
            page.drawText(line, {
              x: edit.pdfX,
              y: edit.baselineY - idx * lineHeight,
              size: edit.fontSizePt,
              font,
              color: toPdfRgb(edit.colorHex)
            });
          });
        }
      } else if (edit.kind === 'add-text') {
        const safeText = sanitizeForWinAnsi(edit.text);
        if (safeText.length === 0) continue;

        const font = await getFont(edit.fontFamily, edit.bold, edit.italic);
        const lines = safeText.split(/\r?\n/);
        const lineHeight = edit.fontSizePt * 1.25;

        if (edit.backgroundHex) {
          const maxLineWidth = lines.reduce(
            (max, l) => Math.max(max, font.widthOfTextAtSize(l || ' ', edit.fontSizePt)),
            24
          );
          const totalHeight = lines.length * lineHeight;
          const padX = 5;
          const padY = 4;
          page.drawRectangle({
            x: edit.pdfX - padX,
            y: edit.pdfY - (lines.length - 1) * lineHeight - edit.fontSizePt * 0.25 - padY,
            width: maxLineWidth + padX * 2,
            height: totalHeight + padY * 2,
            color: toPdfRgb(edit.backgroundHex),
            opacity: edit.opacity
          });
        }

        lines.forEach((line, idx) => {
          if (line.length === 0) return;
          page.drawText(line, {
            x: edit.pdfX,
            y: edit.pdfY - idx * lineHeight,
            size: edit.fontSizePt,
            font,
            color: toPdfRgb(edit.colorHex),
            opacity: edit.opacity
          });
        });
      } else if (edit.kind === 'shape') {
        if (edit.shapeType === 'line') {
          page.drawLine({
            start: { x: edit.pdfX, y: edit.pdfY + edit.pdfHeight / 2 },
            end: { x: edit.pdfX + edit.pdfWidth, y: edit.pdfY + edit.pdfHeight / 2 },
            thickness: Math.max(0.5, edit.strokeWidthPt),
            color: toPdfRgb(edit.strokeHex),
            opacity: edit.opacity
          });
        } else {
          page.drawRectangle({
            x: edit.pdfX,
            y: edit.pdfY,
            width: edit.pdfWidth,
            height: edit.pdfHeight,
            color: toPdfRgb(edit.fillHex),
            borderColor: edit.strokeWidthPt > 0 ? toPdfRgb(edit.strokeHex) : undefined,
            borderWidth: edit.shapeType === 'whiteout' ? 0 : edit.strokeWidthPt,
            opacity: edit.opacity
          });
        }
      } else if (edit.kind === 'image') {
        if (edit.coverUnderlying) {
          page.drawRectangle({
            x: edit.pdfX - 1,
            y: edit.pdfY - 1,
            width: edit.pdfWidth + 2,
            height: edit.pdfHeight + 2,
            color: toPdfRgb(edit.coverColorHex),
            borderWidth: 0
          });
        }

        const fmt = detectImageFormat(edit.bytes, edit.mimeType);
        const embeddedImage =
          fmt === 'png'
            ? await outDoc.embedPng(edit.bytes)
            : await outDoc.embedJpg(edit.bytes);

        page.drawImage(embeddedImage, {
          x: edit.pdfX,
          y: edit.pdfY,
          width: edit.pdfWidth,
          height: edit.pdfHeight,
          opacity: edit.opacity
        });
      } else if (edit.kind === 'signature') {
        if (edit.mode === 'drawn' && edit.pngBytes && edit.pngBytes.length > 0) {
          const embeddedSig = await outDoc.embedPng(edit.pngBytes);
          page.drawImage(embeddedSig, {
            x: edit.pdfX,
            y: edit.pdfY,
            width: edit.pdfWidth,
            height: edit.pdfHeight
          });
        } else if (edit.typedText) {
          const font = await getFont(edit.fontFamily, false, true);
          const safeSig = sanitizeForWinAnsi(edit.typedText);
          page.drawText(safeSig, {
            x: edit.pdfX + 4,
            y: edit.pdfY + edit.pdfHeight * 0.34,
            size: edit.fontSizePt,
            font,
            color: toPdfRgb(edit.inkHex)
          });
        }

        if (edit.showBaseline) {
          page.drawLine({
            start: { x: edit.pdfX, y: edit.pdfY + 6 },
            end: { x: edit.pdfX + edit.pdfWidth, y: edit.pdfY + 6 },
            thickness: 0.75,
            color: toPdfRgb('#71717a')
          });
        }
      }
    }
  }

  return outDoc.save();
}
