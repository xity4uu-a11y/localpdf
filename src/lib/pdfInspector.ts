import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist/types/src/display/api';
import {
  detectFontMatch,
  estimateInkAndBackgroundFromCanvas
} from './fontMatcher';
import type {
  ExtractedTextLine,
  ExtractedTextRun,
  FontAliasRule,
  RotationDelta
} from './types';

// Local bundled worker — zero external CDN fetches, 100% offline capable.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type LoadedPdfProxy = PDFDocumentProxy;

interface PdfJsTextItemLike {
  str: string;
  dir?: string;
  width: number;
  height: number;
  transform: number[];
  fontName: string;
  hasEOL?: boolean;
}

interface PdfJsStyleLike {
  fontFamily?: string;
  ascent?: number;
  descent?: number;
}

export async function loadPdfProxy(bytes: Uint8Array): Promise<LoadedPdfProxy> {
  // Always clone bytes before transferring to PDF.js worker so the original
  // SourceDocument Uint8Array remains intact for pdf-lib export.
  const copy = bytes.slice();
  const loadingTask = pdfjsLib.getDocument({
    data: copy,
    useSystemFonts: true,
    isEvalSupported: false
  });
  return loadingTask.promise;
}

export interface PageRenderResult {
  pageWidthPt: number;
  pageHeightPt: number;
  viewportWidthPx: number;
  viewportHeightPx: number;
  baseRotation: number;
  totalRotation: number;
  dpr: number;
}

const activeRenderTasks = new WeakMap<HTMLCanvasElement, RenderTask>();

export async function renderPageToCanvas(
  pdfDoc: LoadedPdfProxy,
  pageNumber1Based: number,
  canvas: HTMLCanvasElement,
  scale: number,
  rotationDelta: RotationDelta = 0
): Promise<PageRenderResult> {
  const existingTask = activeRenderTasks.get(canvas);
  if (existingTask) {
    try {
      existingTask.cancel();
    } catch {
      // Ignore cancellation race
    }
  }

  const page = await pdfDoc.getPage(pageNumber1Based);
  const baseRotation = page.rotate || 0;
  const totalRotation = (baseRotation + rotationDelta) % 360;
  const unscaledViewport = page.getViewport({ scale: 1, rotation: totalRotation });
  const viewport = page.getViewport({ scale, rotation: totalRotation });

  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2.5) : 1;
  canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
  canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Could not acquire 2D canvas context for PDF rendering.');
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  const renderTask = page.render({
    canvasContext: ctx,
    viewport
  });
  activeRenderTasks.set(canvas, renderTask);

  await renderTask.promise;

  return {
    pageWidthPt: unscaledViewport.width,
    pageHeightPt: unscaledViewport.height,
    viewportWidthPx: viewport.width,
    viewportHeightPx: viewport.height,
    baseRotation,
    totalRotation,
    dpr
  };
}

export async function renderBlankPageToCanvas(
  canvas: HTMLCanvasElement,
  widthPt: number,
  heightPt: number,
  scale: number
): Promise<PageRenderResult> {
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2.5) : 1;
  const viewportWidthPx = widthPt * scale;
  const viewportHeightPx = heightPt * scale;
  canvas.width = Math.max(1, Math.floor(viewportWidthPx * dpr));
  canvas.height = Math.max(1, Math.floor(viewportHeightPx * dpr));
  canvas.style.width = `${viewportWidthPx}px`;
  canvas.style.height = `${viewportHeightPx}px`;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, viewportWidthPx, viewportHeightPx);
  }

  return {
    pageWidthPt: widthPt,
    pageHeightPt: heightPt,
    viewportWidthPx,
    viewportHeightPx,
    baseRotation: 0,
    totalRotation: 0,
    dpr
  };
}

function resolveRealFontName(
  page: Awaited<ReturnType<LoadedPdfProxy['getPage']>>,
  internalFontId: string
): string {
  try {
    const commonObjs = page.commonObjs as unknown as {
      has?: (name: string) => boolean;
      get?: (name: string) => { name?: string; loadedName?: string } | undefined;
    };
    if (commonObjs?.has?.(internalFontId) && commonObjs.get) {
      const obj = commonObjs.get(internalFontId);
      if (obj?.name) return obj.name;
    }
  } catch {
    // Font object not resolved in commonObjs; fall back to styles + internal id
  }
  return internalFontId;
}

/**
 * Extracts text runs from a PDF page, resolves real PostScript/TrueType font
 * descriptors, merges adjacent runs on the same baseline into editable phrases,
 * and samples ink & background colors directly from the rendered page canvas.
 */
export async function extractPageTextLines(
  pdfDoc: LoadedPdfProxy,
  pageNumber1Based: number,
  pagePlanId: string,
  options: {
    canvas?: HTMLCanvasElement | null;
    scale?: number;
    rotationDelta?: RotationDelta;
    dpr?: number;
    customAliases?: FontAliasRule[];
  } = {}
): Promise<ExtractedTextLine[]> {
  const page = await pdfDoc.getPage(pageNumber1Based);
  const baseRotation = page.rotate || 0;
  const totalRotation = (baseRotation + (options.rotationDelta ?? 0)) % 360;
  const scale = options.scale ?? 1;
  const scaledViewport = page.getViewport({ scale, rotation: totalRotation });
  const textContent = await page.getTextContent();
  const styles = (textContent.styles || {}) as Record<string, PdfJsStyleLike>;
  const customAliases = options.customAliases ?? [];

  const runs: ExtractedTextRun[] = [];
  let idx = 0;

  for (const rawItem of textContent.items) {
    const item = rawItem as unknown as PdfJsTextItemLike;
    if (!item || typeof item.str !== 'string' || item.str.trim().length === 0) {
      continue;
    }
    if (!Array.isArray(item.transform) || item.transform.length < 6) {
      continue;
    }

    const [a, b, c, d, tx, ty] = item.transform;
    const scaleX = Math.hypot(a, b);
    const scaleY = Math.hypot(c, d);
    const fontSizePt = Math.max(5, Number((scaleY || scaleX || item.height || 10).toFixed(2)));
    const pdfWidth = Math.max(4, item.width || item.str.length * fontSizePt * 0.52);
    const pdfHeight = Math.max(fontSizePt * 1.15, item.height || fontSizePt);

    const style = styles[item.fontName];
    const resolvedFontName = resolveRealFontName(page, item.fontName);
    const fontMatch = detectFontMatch(resolvedFontName, style?.fontFamily, customAliases);

    const descent = fontSizePt * 0.22;
    runs.push({
      id: `${pagePlanId}-run-${idx++}`,
      text: item.str,
      pdfX: tx,
      pdfY: ty - descent,
      baselineY: ty,
      pdfWidth,
      pdfHeight,
      fontSizePt,
      fontMatch
    });
  }

  // Sort top-to-bottom (higher PDF Y first), then left-to-right
  runs.sort((r1, r2) => {
    const dy = Math.abs(r1.baselineY - r2.baselineY);
    if (dy <= Math.min(r1.fontSizePt, r2.fontSizePt) * 0.35) {
      return r1.pdfX - r2.pdfX;
    }
    return r2.baselineY - r1.baselineY;
  });

  // Merge adjacent runs sharing baseline, font family/weight/italic, and normal word spacing
  // (keep gap threshold conservative so distinct table columns remain separate editable cells)
  const mergedLines: ExtractedTextLine[] = [];
  const ctx = options.canvas ? options.canvas.getContext('2d', { willReadFrequently: true }) : null;
  const dpr = options.dpr ?? 1;

  for (const run of runs) {
    const prev = mergedLines[mergedLines.length - 1];
    const canMerge =
      prev &&
      Math.abs(prev.baselineY - run.baselineY) <= Math.min(prev.fontSizePt, run.fontSizePt) * 0.35 &&
      Math.abs(prev.fontSizePt - run.fontSizePt) <= 0.8 &&
      prev.fontMatch.fontKey === run.fontMatch.fontKey &&
      run.pdfX - (prev.pdfX + prev.pdfWidth) >= -run.fontSizePt * 0.4 &&
      run.pdfX - (prev.pdfX + prev.pdfWidth) <= run.fontSizePt * 0.65;

    if (canMerge) {
      const gap = run.pdfX - (prev.pdfX + prev.pdfWidth);
      const needsSpace =
        gap > run.fontSizePt * 0.18 &&
        !prev.text.endsWith(' ') &&
        !run.text.startsWith(' ');
      prev.text = `${prev.text}${needsSpace ? ' ' : ''}${run.text}`;
      const rightEdge = Math.max(prev.pdfX + prev.pdfWidth, run.pdfX + run.pdfWidth);
      prev.pdfWidth = rightEdge - prev.pdfX;
      prev.pdfHeight = Math.max(prev.pdfHeight, run.pdfHeight);
    } else {
      mergedLines.push({
        id: `${pagePlanId}-line-${mergedLines.length}`,
        pagePlanId,
        text: run.text,
        pdfX: run.pdfX,
        pdfY: run.pdfY,
        baselineY: run.baselineY,
        pdfWidth: run.pdfWidth,
        pdfHeight: run.pdfHeight,
        fontSizePt: run.fontSizePt,
        fontMatch: run.fontMatch,
        inkHex: '#1c1c1e',
        bgHex: '#ffffff'
      });
    }
  }

  // Enrich each merged text line with sampled ink and background colors using exact PDF.js viewport coords
  if (ctx) {
    for (const line of mergedLines) {
      const [vx1, vy1, vx2, vy2] = scaledViewport.convertToViewportRectangle([
        line.pdfX,
        line.pdfY,
        line.pdfX + line.pdfWidth,
        line.pdfY + line.pdfHeight
      ]);
      const sampled = estimateInkAndBackgroundFromCanvas(
        ctx,
        {
          x: Math.min(vx1, vx2),
          y: Math.min(vy1, vy2),
          width: Math.abs(vx2 - vx1),
          height: Math.abs(vy2 - vy1)
        },
        dpr
      );
      line.inkHex = sampled.inkHex;
      line.bgHex = sampled.bgHex;
    }
  }

  return mergedLines;
}
