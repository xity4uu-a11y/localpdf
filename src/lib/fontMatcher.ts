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

/**
 * Samples the rendered PDF canvas around and inside a text bounding box to
 * estimate the true background color (white, tinted header band, dark banner)
 * and the primary ink color of the text glyphs.
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
  const pad = Math.max(2, Math.round(3 * dpr));

  const sx = Math.max(0, Math.floor(rect.x * dpr) - pad);
  const sy = Math.max(0, Math.floor(rect.y * dpr) - pad);
  const ex = Math.min(canvasW, Math.ceil((rect.x + rect.width) * dpr) + pad);
  const ey = Math.min(canvasH, Math.ceil((rect.y + rect.height) * dpr) + pad);

  const w = ex - sx;
  const h = ey - sy;
  if (w < 4 || h < 4) {
    return { inkHex: '#1c1c1e', bgHex: '#ffffff' };
  }

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(sx, sy, w, h).data;
  } catch {
    return { inkHex: '#1c1c1e', bgHex: '#ffffff' };
  }

  const bgR: number[] = [];
  const bgG: number[] = [];
  const bgB: number[] = [];

  // Sample outer perimeter ring for background color
  for (let x = 0; x < w; x += 2) {
    const topIdx = x * 4;
    bgR.push(data[topIdx]);
    bgG.push(data[topIdx + 1]);
    bgB.push(data[topIdx + 2]);

    const botIdx = ((h - 1) * w + x) * 4;
    bgR.push(data[botIdx]);
    bgG.push(data[botIdx + 1]);
    bgB.push(data[botIdx + 2]);
  }
  for (let y = 1; y < h - 1; y += 2) {
    const leftIdx = y * w * 4;
    bgR.push(data[leftIdx]);
    bgG.push(data[leftIdx + 1]);
    bgB.push(data[leftIdx + 2]);

    const rightIdx = (y * w + (w - 1)) * 4;
    bgR.push(data[rightIdx]);
    bgG.push(data[rightIdx + 1]);
    bgB.push(data[rightIdx + 2]);
  }

  const medBgR = medianChannel(bgR);
  const medBgG = medianChannel(bgG);
  const medBgB = medianChannel(bgB);
  const bgHex = rgb255ToHex(medBgR, medBgG, medBgB);

  // Sample interior pixels contrasting with background to recover glyph ink
  const candidates: Array<{ dist: number; r: number; g: number; b: number }> = [];
  const innerStartX = Math.min(pad, Math.floor(w / 4));
  const innerEndX = Math.max(innerStartX + 1, w - innerStartX);
  const innerStartY = Math.min(pad, Math.floor(h / 4));
  const innerEndY = Math.max(innerStartY + 1, h - innerStartY);
  const stepX = Math.max(1, Math.floor((innerEndX - innerStartX) / 60));
  const stepY = Math.max(1, Math.floor((innerEndY - innerStartY) / 24));

  for (let y = innerStartY; y < innerEndY; y += stepY) {
    for (let x = innerStartX; x < innerEndX; x += stepX) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const dr = r - medBgR;
      const dg = g - medBgG;
      const db = b - medBgB;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist >= 38) {
        candidates.push({ dist, r, g, b });
      }
    }
  }

  if (candidates.length === 0) {
    const bgLuma = 0.299 * medBgR + 0.587 * medBgG + 0.114 * medBgB;
    return { inkHex: bgLuma > 135 ? '#1c1c1e' : '#ffffff', bgHex };
  }

  // Keep top 40% highest-contrast pixels (core glyph strokes, ignoring anti-aliased edge halos)
  candidates.sort((a, b) => b.dist - a.dist);
  const coreCount = Math.max(1, Math.ceil(candidates.length * 0.4));
  const core = candidates.slice(0, coreCount);

  const inkR = medianChannel(core.map((c) => c.r));
  const inkG = medianChannel(core.map((c) => c.g));
  const inkB = medianChannel(core.map((c) => c.b));

  return {
    inkHex: rgb255ToHex(inkR, inkG, inkB),
    bgHex
  };
}
