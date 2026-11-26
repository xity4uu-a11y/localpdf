import type {
  FontAliasRule,
  FontMatch,
  RgbColor01,
  StandardFontFamily,
  StandardFontKey,
  ViewportRect
} from './types';

const SERIF_TOKENS = [
  'times',
  'timesnewroman',
  'timesroman',
  'georgia',
  'garamond',
  'palatino',
  'cambria',
  'baskerville',
  'bookman',
  'charter',
  'minion',
  'merriweather',
  'playfair',
  'didot',
  'bodoni',
  'caslon',
  'century',
  'liberationserif',
  'dejavuserif',
  'notoserif',
  'ptserif',
  'sourceserif',
  'serif'
];

const MONO_TOKENS = [
  'courier',
  'couriernew',
  'consolas',
  'monaco',
  'menlo',
  'jetbrains',
  'firacode',
  'firamono',
  'robotomono',
  'sourcecode',
  'ibmplexmono',
  'dejavusansmono',
  'liberationmono',
  'inconsolata',
  'sfmono',
  'ubuntu mono',
  'ubuntumono',
  'mono',
  'monospace'
];

const SANS_TOKENS = [
  'helvetica',
  'arial',
  'inter',
  'roboto',
  'opensans',
  'lato',
  'montserrat',
  'calibri',
  'segoe',
  'sfpro',
  'sanfrancisco',
  'verdana',
  'tahoma',
  'trebuchet',
  'gillsans',
  'futura',
  'avenir',
  'proxima',
  'sourcesans',
  'notosans',
  'liberationsans',
  'dejavusans',
  'myriad',
  'frutiger',
  'univers',
  'ibmplexsans',
  'worksans',
  'dmsans',
  'plusjakarta',
  'sans-serif',
  'sans'
];

export function stripSubsetPrefix(rawPdfFontName: string): string {
  const trimmed = (rawPdfFontName || '').trim();
  return trimmed.replace(/^[A-Z]{6}\+/, '');
}

export function getStandardFontKey(
  family: StandardFontFamily,
  bold: boolean,
  italic: boolean
): StandardFontKey {
  if (family === 'times') {
    if (bold && italic) return 'TimesRomanBoldItalic';
    if (bold) return 'TimesRomanBold';
    if (italic) return 'TimesRomanItalic';
    return 'TimesRoman';
  }
  if (family === 'courier') {
    if (bold && italic) return 'CourierBoldOblique';
    if (bold) return 'CourierBold';
    if (italic) return 'CourierOblique';
    return 'Courier';
  }
  if (bold && italic) return 'HelveticaBoldOblique';
  if (bold) return 'HelveticaBold';
  if (italic) return 'HelveticaOblique';
  return 'Helvetica';
}

export function formatFontDisplayLabel(
  family: StandardFontFamily,
  bold: boolean,
  italic: boolean
): string {
  const base = family === 'times' ? 'Times' : family === 'courier' ? 'Courier' : 'Helvetica';
  const parts: string[] = [base];
  if (bold) parts.push('Bold');
  if (italic) parts.push(family === 'times' ? 'Italic' : 'Oblique');
  return parts.join(' ');
}

export function getCssFontStyle(
  family: StandardFontFamily,
  bold: boolean,
  italic: boolean
): { fontFamily: string; fontWeight: number; fontStyle: 'normal' | 'italic' } {
  const fontFamily =
    family === 'times'
      ? '"Times New Roman", Times, Georgia, serif'
      : family === 'courier'
        ? '"Courier New", Courier, "JetBrains Mono", ui-monospace, monospace'
        : 'Helvetica, Arial, -apple-system, BlinkMacSystemFont, "Inter", sans-serif';

  return {
    fontFamily,
    fontWeight: bold ? 700 : 400,
    fontStyle: italic ? 'italic' : 'normal'
  };
}

export function detectFontMatch(
  rawPdfFontName: string,
  styleFontFamily?: string,
  customAliases: FontAliasRule[] = []
): FontMatch {
  const cleaned = stripSubsetPrefix(rawPdfFontName || '');
  const combinedRaw = `${cleaned} ${styleFontFamily || ''}`.trim();
  const lower = combinedRaw.toLowerCase();
  const compact = lower.replace(/[^a-z0-9]/g, '');

  let bold =
    /(?:^|[-_,\s])(bold|bd|semibold|demibold|demi|extrabold|heavy|black|medium|w6|w7|700|800|900)(?:$|[-_,\s]|mt|ps|std|pro|italic|oblique)/i.test(
      combinedRaw
    ) || /(?:bold|semibold|demi|heavy|black)(?:mt|ps|it|oblique|italic)?$/i.test(compact);

  let italic =
    /(?:^|[-_,\s])(italic|oblique|slanted|inclined|kursiv|it|obl)(?:$|[-_,\s]|mt|ps|std|pro)/i.test(
      combinedRaw
    ) || /(?:italic|oblique)(?:mt|ps)?$/i.test(compact);

  for (const alias of customAliases) {
    const aliasCompact = alias.pattern.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (aliasCompact && compact.includes(aliasCompact)) {
      const resolvedBold = alias.bold ?? bold;
      const resolvedItalic = alias.italic ?? italic;
      return {
        family: alias.mapsTo,
        bold: resolvedBold,
        italic: resolvedItalic,
        fontKey: getStandardFontKey(alias.mapsTo, resolvedBold, resolvedItalic),
        rawPdfFontName,
        cleanedFontName: cleaned || styleFontFamily || 'Helvetica',
        confidence: 'family',
        displayLabel: formatFontDisplayLabel(alias.mapsTo, resolvedBold, resolvedItalic)
      };
    }
  }

  let family: StandardFontFamily = 'helvetica';
  let confidence: 'exact' | 'family' | 'fallback' = 'fallback';

  if (compact.includes('helvetica')) {
    family = 'helvetica';
    confidence = 'exact';
  } else if (compact.includes('times')) {
    family = 'times';
    confidence = 'exact';
  } else if (compact.includes('courier')) {
    family = 'courier';
    confidence = 'exact';
  } else if (MONO_TOKENS.some((tok) => compact.includes(tok.replace(/\s+/g, '')))) {
    family = 'courier';
    confidence = 'family';
  } else if (
    SERIF_TOKENS.some((tok) => compact.includes(tok)) &&
    !compact.includes('sansserif') &&
    !compact.includes('sans')
  ) {
    family = 'times';
    confidence = 'family';
  } else if (SANS_TOKENS.some((tok) => compact.includes(tok.replace(/[^a-z0-9]/g, '')))) {
    family = 'helvetica';
    confidence = 'family';
  } else if (styleFontFamily) {
    const sf = styleFontFamily.toLowerCase();
    if (sf.includes('monospace')) {
      family = 'courier';
      confidence = 'family';
    } else if (sf.includes('serif') && !sf.includes('sans-serif')) {
      family = 'times';
      confidence = 'family';
    } else if (sf.includes('sans-serif')) {
      family = 'helvetica';
      confidence = 'family';
    }
  }

  // Handle single-word PDF PostScript abbreviations like "Times-BoldItalic" or "Helvetica-BoldOblique"
  if (/bolditalic|boldoblique/i.test(compact)) {
    bold = true;
    italic = true;
  }

  return {
    family,
    bold,
    italic,
    fontKey: getStandardFontKey(family, bold, italic),
    rawPdfFontName,
    cleanedFontName: cleaned || styleFontFamily || 'Helvetica',
    confidence,
    displayLabel: formatFontDisplayLabel(family, bold, italic)
  };
}

export function normalizeHexColor(hex: string, fallback = '#1c1c1e'): string {
  const cleaned = (hex || '').trim();
  const shortMatch = /^#?([0-9a-fA-F]{3})$/.exec(cleaned);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const fullMatch = /^#?([0-9a-fA-F]{6})$/.exec(cleaned);
  if (fullMatch) {
    return `#${fullMatch[1].toLowerCase()}`;
  }
  return fallback;
}

export function hexToRgb01(hex: string): RgbColor01 {
  const norm = normalizeHexColor(hex, '#1c1c1e');
  const r = parseInt(norm.slice(1, 3), 16) / 255;
  const g = parseInt(norm.slice(3, 5), 16) / 255;
  const b = parseInt(norm.slice(5, 7), 16) / 255;
  return { r, g, b };
}

export function rgb01ToHex(color: RgbColor01): string {
  const toHex = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

export function rgb255ToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function medianChannel(values: number[]): number {
  if (values.length === 0) return 255;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Pure pixel-buffer estimator for text background and ink color.
 * Uses a quantized 3D RGB histogram over the text interior plus immediate
 * same-row horizontal flanks (never expanding vertically into adjacent table
 * stripes) so zebra-striped tables always recover the exact row fill and
 * crisp glyph core ink.
 */
export function estimateInkAndBackgroundFromPixels(
  data: Uint8ClampedArray,
  bufferWidth: number,
  bufferHeight: number,
  innerRect: PixelRect,
  horizontalFlankPx = 2
): { inkHex: string; bgHex: string } {
  if (bufferWidth <= 0 || bufferHeight <= 0 || data.length < bufferWidth * bufferHeight * 4) {
    return { inkHex: '#1c1c1e', bgHex: '#ffffff' };
  }

  const ix0 = Math.max(0, Math.min(bufferWidth - 1, Math.floor(innerRect.x)));
  const iy0 = Math.max(0, Math.min(bufferHeight - 1, Math.floor(innerRect.y)));
  const ix1 = Math.max(ix0 + 1, Math.min(bufferWidth, Math.ceil(innerRect.x + innerRect.width)));
  const iy1 = Math.max(iy0 + 1, Math.min(bufferHeight, Math.ceil(innerRect.y + innerRect.height)));
  const iw = ix1 - ix0;
  const ih = iy1 - iy0;

  if (iw < 2 || ih < 2) {
    return { inkHex: '#1c1c1e', bgHex: '#ffffff' };
  }

  // Build 3D RGB histogram (bin width = 4) over interior + same-row horizontal flanks.
  // Background occupies ~65-90% of a text box, while strokes occupy ~10-30%.
  const BIN = 4;
  const buckets = new Map<number, { count: number; sumR: number; sumG: number; sumB: number }>();

  const addBgSample = (px: number, py: number, weight = 1) => {
    const idx = (py * bufferWidth + px) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    const entry = buckets.get(key);
    if (entry) {
      entry.count += weight;
      entry.sumR += r * weight;
      entry.sumG += g * weight;
      entry.sumB += b * weight;
    } else {
      buckets.set(key, {
        count: weight,
        sumR: r * weight,
        sumG: g * weight,
        sumB: b * weight
      });
    }
  };

  const bgStepX = iw > 160 ? Math.floor(iw / 120) : 1;
  const bgStepY = ih > 64 ? Math.floor(ih / 48) : 1;

  for (let y = iy0; y < iy1; y += bgStepY) {
    for (let x = ix0; x < ix1; x += bgStepX) {
      addBgSample(x, y, 1);
    }
  }

  // Same-row horizontal flanks (strictly within the vertical center band of this row)
  const flank = Math.max(0, Math.round(horizontalFlankPx));
  if (flank > 0) {
    const midY0 = iy0 + Math.floor(ih * 0.2);
    const midY1 = Math.max(midY0 + 1, iy1 - Math.floor(ih * 0.2));
    const leftX0 = Math.max(0, ix0 - flank);
    const rightX1 = Math.min(bufferWidth, ix1 + flank);

    for (let y = midY0; y < midY1; y += 1) {
      for (let x = leftX0; x < ix0; x += 1) {
        addBgSample(x, y, 2);
      }
      for (let x = ix1; x < rightX1; x += 1) {
        addBgSample(x, y, 2);
      }
    }
  }

  let winningBucket: { count: number; sumR: number; sumG: number; sumB: number } | null = null;
  for (const entry of buckets.values()) {
    if (!winningBucket || entry.count > winningBucket.count) {
      winningBucket = entry;
    }
  }

  let bgR = 255;
  let bgG = 255;
  let bgB = 255;
  if (winningBucket && winningBucket.count > 0) {
    const seedR = winningBucket.sumR / winningBucket.count;
    const seedG = winningBucket.sumG / winningBucket.count;
    const seedB = winningBucket.sumB / winningBucket.count;

    // Refine background using nearby bins within +/- BIN*2 to eliminate quantization bias
    let totalW = 0;
    let accR = 0;
    let accG = 0;
    let accB = 0;
    for (const entry of buckets.values()) {
      const er = entry.sumR / entry.count;
      const eg = entry.sumG / entry.count;
      const eb = entry.sumB / entry.count;
      if (
        Math.abs(er - seedR) <= BIN * 2 &&
        Math.abs(eg - seedG) <= BIN * 2 &&
        Math.abs(eb - seedB) <= BIN * 2
      ) {
        totalW += entry.count;
        accR += entry.sumR;
        accG += entry.sumG;
        accB += entry.sumB;
      }
    }
    bgR = Math.round(accR / Math.max(1, totalW));
    bgG = Math.round(accG / Math.max(1, totalW));
    bgB = Math.round(accB / Math.max(1, totalW));
  }

  // Snap imperceptibly off-white page backgrounds cleanly to pure white
  if (bgR >= 251 && bgG >= 251 && bgB >= 251) {
    bgR = 255;
    bgG = 255;
    bgB = 255;
  }

  const bgHex = rgb255ToHex(bgR, bgG, bgB);

  // Sample interior glyph pixels contrasting against the true row background
  const candidates: Array<{ dist: number; r: number; g: number; b: number }> = [];
  const inkStepX = iw > 180 ? Math.floor(iw / 120) : 1;
  const inkStepY = ih > 64 ? Math.floor(ih / 48) : 1;

  for (let y = iy0; y < iy1; y += inkStepY) {
    for (let x = ix0; x < ix1; x += inkStepX) {
      const idx = (y * bufferWidth + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const dr = r - bgR;
      const dg = g - bgG;
      const db = b - bgB;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist >= 36) {
        candidates.push({ dist, r, g, b });
      }
    }
  }

  if (candidates.length === 0) {
    const bgLuma = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;
    return { inkHex: bgLuma > 135 ? '#1c1c1e' : '#ffffff', bgHex };
  }

  // Keep top 20% highest-contrast pixels (solid glyph stroke cores, rejecting anti-aliased fringes)
  candidates.sort((a, b) => b.dist - a.dist);
  const coreCount = Math.max(1, Math.ceil(candidates.length * 0.2));
  const core = candidates.slice(0, coreCount);

  const inkR = medianChannel(core.map((c) => c.r));
  const inkG = medianChannel(core.map((c) => c.g));
  const inkB = medianChannel(core.map((c) => c.b));

  return {
    inkHex: rgb255ToHex(inkR, inkG, inkB),
    bgHex
  };
}

/**
 * Samples the rendered PDF canvas inside a text bounding box (plus same-row
 * horizontal flanks) to estimate the exact row background color and glyph ink
 * color without bleeding into adjacent table stripes.
 */
export function estimateInkAndBackgroundFromCanvas(
  ctx: CanvasRenderingContext2D | null,
  rect: ViewportRect,
  dpr = 1
): { inkHex: string; bgHex: string } {
  if (!ctx) {
    return { inkHex: '#1c1c1e', bgHex: '#ffffff' };
  }

  const canvasW = ctx.canvas.width;
  const canvasH = ctx.canvas.height;
  const flank = Math.max(1, Math.round(2 * dpr));

  const rawX0 = Math.floor(rect.x * dpr);
  const rawY0 = Math.floor(rect.y * dpr);
  const rawX1 = Math.ceil((rect.x + rect.width) * dpr);
  const rawY1 = Math.ceil((rect.y + rect.height) * dpr);

  // Expand horizontally by flank (same row), NEVER vertically into adjacent table rows
  const sx = Math.max(0, rawX0 - flank);
  const sy = Math.max(0, rawY0);
  const ex = Math.min(canvasW, rawX1 + flank);
  const ey = Math.min(canvasH, rawY1);

  const w = ex - sx;
  const h = ey - sy;
  if (w < 2 || h < 2) {
    return { inkHex: '#1c1c1e', bgHex: '#ffffff' };
  }

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(sx, sy, w, h).data;
  } catch {
    return { inkHex: '#1c1c1e', bgHex: '#ffffff' };
  }

  return estimateInkAndBackgroundFromPixels(
    data,
    w,
    h,
    {
      x: Math.max(0, rawX0 - sx),
      y: 0,
      width: Math.max(1, Math.min(w, rawX1 - sx) - Math.max(0, rawX0 - sx)),
      height: h
    },
    flank
  );
}
