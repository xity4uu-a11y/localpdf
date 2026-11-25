export type StandardFontFamily = 'helvetica' | 'times' | 'courier';

export type StandardFontKey =
  | 'Helvetica'
  | 'HelveticaBold'
  | 'HelveticaOblique'
  | 'HelveticaBoldOblique'
  | 'TimesRoman'
  | 'TimesRomanBold'
  | 'TimesRomanItalic'
  | 'TimesRomanBoldItalic'
  | 'Courier'
  | 'CourierBold'
  | 'CourierOblique'
  | 'CourierBoldOblique';

export interface FontAliasRule {
  pattern: string;
  mapsTo: StandardFontFamily;
  bold?: boolean;
  italic?: boolean;
}

export interface FontMatch {
  family: StandardFontFamily;
  bold: boolean;
  italic: boolean;
  fontKey: StandardFontKey;
  rawPdfFontName: string;
  cleanedFontName: string;
  confidence: 'exact' | 'family' | 'fallback';
  displayLabel: string;
}

export interface RgbColor01 {
  r: number;
  g: number;
  b: number;
}

export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExtractedTextRun {
  id: string;
  text: string;
  pdfX: number;
  pdfY: number;
  baselineY: number;
  pdfWidth: number;
  pdfHeight: number;
  fontSizePt: number;
  fontMatch: FontMatch;
}

export interface ExtractedTextLine {
  id: string;
  pagePlanId: string;
  text: string;
  pdfX: number;
  pdfY: number;
  baselineY: number;
  pdfWidth: number;
  pdfHeight: number;
  fontSizePt: number;
  fontMatch: FontMatch;
  inkHex: string;
  bgHex: string;
}

export interface ReplaceTextEdit {
  id: string;
  kind: 'replace-text';
  pagePlanId: string;
  sourceLineId?: string;
  originalText: string;
  text: string;
  patchRect: PdfRect;
  pdfX: number;
  baselineY: number;
  fontFamily: StandardFontFamily;
  bold: boolean;
  italic: boolean;
  fontSizePt: number;
  colorHex: string;
  backgroundHex: string;
  paddingPt: number;
  coverOriginal: boolean;
  detectedFontLabel: string;
}

export interface AddTextEdit {
  id: string;
  kind: 'add-text';
  pagePlanId: string;
  text: string;
  pdfX: number;
  pdfY: number;
  fontFamily: StandardFontFamily;
  bold: boolean;
  italic: boolean;
  fontSizePt: number;
  colorHex: string;
  backgroundHex?: string;
  opacity: number;
}

export interface ImageOverlayEdit {
  id: string;
  kind: 'image';
  pagePlanId: string;
  name: string;
  bytes: Uint8Array;
  mimeType: 'image/png' | 'image/jpeg';
  previewDataUrl: string;
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
  aspectRatio: number;
  lockAspectRatio: boolean;
  coverUnderlying: boolean;
  coverColorHex: string;
  opacity: number;
}

export interface WhiteoutShapeEdit {
  id: string;
  kind: 'shape';
  pagePlanId: string;
  shapeType: 'whiteout' | 'rect' | 'line';
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
  fillHex: string;
  strokeHex: string;
  strokeWidthPt: number;
  opacity: number;
}

export interface SignatureEdit {
  id: string;
  kind: 'signature';
  pagePlanId: string;
  mode: 'drawn' | 'typed';
  pngBytes?: Uint8Array;
  previewDataUrl?: string;
  typedText?: string;
  fontFamily: StandardFontFamily;
  fontSizePt: number;
  inkHex: string;
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
  showBaseline: boolean;
}

export type DocumentEdit =
  | ReplaceTextEdit
  | AddTextEdit
  | ImageOverlayEdit
  | WhiteoutShapeEdit
  | SignatureEdit;

export interface SourceDocument {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
}

export type RotationDelta = 0 | 90 | 180 | 270;

export interface PagePlanItem {
  id: string;
  sourceDocId: string;
  sourcePageIndex: number;
  rotationDelta: RotationDelta;
  isBlank?: boolean;
  blankWidthPt?: number;
  blankHeightPt?: number;
  label?: string;
}

export interface EditorSnapshot {
  pagePlan: PagePlanItem[];
  edits: DocumentEdit[];
}

export type ToolMode = 'select' | 'edit-text' | 'add-text' | 'image' | 'whiteout' | 'signature';

export interface PluginPresetAction {
  id: string;
  label: string;
  kind: 'add-text' | 'whiteout' | 'logo-slot' | 'signature-slot' | 'merge-plan';
  text?: string;
  fontFamily?: StandardFontFamily;
  bold?: boolean;
  italic?: boolean;
  fontSizePt?: number;
  inkHex?: string;
  backgroundHex?: string;
  widthPt?: number;
  heightPt?: number;
  offsetXPt?: number;
  offsetYPt?: number;
  notes?: string;
}

export interface PluginManifest {
  schemaVersion: '1.0.0';
  id: string;
  name: string;
  version: string;
  category: 'typography' | 'template' | 'stamp' | 'workflow';
  author: string;
  license: string;
  description: string;
  defaults: {
    fontFamily: StandardFontFamily;
    bold: boolean;
    italic: boolean;
    fontSizePt: number;
    inkHex: string;
    backgroundHex: string;
    paddingPt?: number;
  };
  fontAliases?: FontAliasRule[];
  presets: PluginPresetAction[];
  tags: string[];
}
