import { useEffect, useRef, useState } from 'react';
import { FileText, FolderOpen } from 'lucide-react';
import { getCssFontStyle } from '../lib/fontMatcher';
import {
  computeReplacePatchRect,
  pdfRectToViewportRect,
  viewportPointToPdfPoint,
  viewportRectToPdfRect
} from '../lib/pdfEditor';
import {
  extractPageTextLines,
  renderBlankPageToCanvas,
  renderPageToCanvas,
  type LoadedPdfProxy
} from '../lib/pdfInspector';
import type {
  DocumentEdit,
  ExtractedTextLine,
  FontAliasRule,
  PagePlanItem,
  ToolMode
} from '../lib/types';

interface PdfWorkspaceProps {
  activePage: PagePlanItem | null;
  activePageNumber: number;
  totalPages: number;
  pdfProxy?: LoadedPdfProxy;
  zoom: number;
  tool: ToolMode;
  edits: DocumentEdit[];
  selectedEditId: string | null;
  fontAliases: FontAliasRule[];
  onSelectEdit: (editId: string | null) => void;
  onUpdateEdit: (editId: string, updater: (edit: DocumentEdit) => DocumentEdit, recordHistory?: boolean) => void;
  onClickExtractedLine: (line: ExtractedTextLine) => void;
  onCanvasAddText: (pdfX: number, pdfY: number) => void;
  onCanvasAddWhiteout: (pdfX: number, pdfY: number, pdfWidth: number, pdfHeight: number) => void;
  onOpenPdfClick: () => void;
  onOpenSample: () => void;
  onDropPdfFile: (file: File) => void;
}

type DragState =
  | {
      mode: 'move';
      editId: string;
      startClientX: number;
      startClientY: number;
      origX: number;
      origY: number;
      origBaselineY?: number;
      origPatchX?: number;
      origPatchY?: number;
    }
  | {
      mode: 'resize';
      editId: string;
      corner: 'nw' | 'ne' | 'sw' | 'se';
      startClientX: number;
      startClientY: number;
      origX: number;
      origY: number;
      origW: number;
      origH: number;
      lockAspect: boolean;
      aspectRatio: number;
    }
  | {
      mode: 'draw-whiteout';
      startVpX: number;
      startVpY: number;
      curVpX: number;
      curVpY: number;
    };

export function PdfWorkspace({
  activePage,
  activePageNumber,
  totalPages,
  pdfProxy,
  zoom,
  tool,
  edits,
  selectedEditId,
  fontAliases,
  onSelectEdit,
  onUpdateEdit,
  onClickExtractedLine,
  onCanvasAddText,
  onCanvasAddWhiteout,
  onOpenPdfClick,
  onOpenSample,
  onDropPdfFile
}: PdfWorkspaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const [pageDims, setPageDims] = useState({
    pageWidthPt: 612,
    pageHeightPt: 792,
    viewportWidthPx: 612,
    viewportHeightPx: 792
  });
  const [extractedLines, setExtractedLines] = useState<ExtractedTextLine[]>([]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [editingInlineId, setEditingInlineId] = useState<string | null>(null);

  // Render active PDF page and extract font-aware text lines
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!activePage || !canvas) {
      setExtractedLines([]);
      return;
    }

    let cancelled = false;

    async function renderAndInspect() {
      if (!activePage || !canvas) return;
      try {
        if (activePage.isBlank) {
          const res = await renderBlankPageToCanvas(
            canvas,
            activePage.blankWidthPt ?? 612,
            activePage.blankHeightPt ?? 792,
            zoom
          );
          if (!cancelled) {
            setPageDims({
              pageWidthPt: res.pageWidthPt,
              pageHeightPt: res.pageHeightPt,
              viewportWidthPx: res.viewportWidthPx,
              viewportHeightPx: res.viewportHeightPx
            });
            setExtractedLines([]);
          }
          return;
        }

        if (!pdfProxy) return;

        const res = await renderPageToCanvas(
          pdfProxy,
          activePage.sourcePageIndex + 1,
          canvas,
          zoom,
          activePage.rotationDelta
        );
        if (cancelled) return;

        setPageDims({
          pageWidthPt: res.pageWidthPt,
          pageHeightPt: res.pageHeightPt,
          viewportWidthPx: res.viewportWidthPx,
          viewportHeightPx: res.viewportHeightPx
        });

        const lines = await extractPageTextLines(
          pdfProxy,
          activePage.sourcePageIndex + 1,
          activePage.id,
          {
            canvas,
            scale: zoom,
            rotationDelta: activePage.rotationDelta,
            dpr: res.dpr,
            customAliases: fontAliases
          }
        );

        if (!cancelled) {
          setExtractedLines(lines);
        }
      } catch {
        // Ignore cancelled renders during rapid zoom/page switching
      }
    }

    renderAndInspect();
    return () => {
      cancelled = true;
    };
  }, [activePage, pdfProxy, zoom, fontAliases]);

  // Global pointer listeners for moving, resizing, and drawing whiteout boxes
  useEffect(() => {
    if (!dragState) return;

    function handleMove(e: PointerEvent) {
      if (!dragState) return;
      if (dragState.mode === 'move') {
        const dxPt = (e.clientX - dragState.startClientX) / zoom;
        const dyPt = -(e.clientY - dragState.startClientY) / zoom;

        onUpdateEdit(
          dragState.editId,
          (edit) => {
            if (edit.kind === 'replace-text') {
              return {
                ...edit,
                pdfX: Number((dragState.origX + dxPt).toFixed(2)),
                baselineY: Number(((dragState.origBaselineY ?? edit.baselineY) + dyPt).toFixed(2)),
                patchRect: {
                  ...edit.patchRect,
                  x: Number(((dragState.origPatchX ?? edit.patchRect.x) + dxPt).toFixed(2)),
                  y: Number(((dragState.origPatchY ?? edit.patchRect.y) + dyPt).toFixed(2))
                }
              };
            }
            return {
              ...edit,
              pdfX: Number((dragState.origX + dxPt).toFixed(2)),
              pdfY: Number((dragState.origY + dyPt).toFixed(2))
            };
          },
          false
        );
      } else if (dragState.mode === 'resize') {
        const dxPt = (e.clientX - dragState.startClientX) / zoom;
        const dyPt = -(e.clientY - dragState.startClientY) / zoom;

        let nextX = dragState.origX;
        let nextY = dragState.origY;
        let nextW = dragState.origW;
        let nextH = dragState.origH;

        if (dragState.corner.includes('e')) {
          nextW = Math.max(16, dragState.origW + dxPt);
        }
        if (dragState.corner.includes('w')) {
          const wCandidate = Math.max(16, dragState.origW - dxPt);
          nextX = dragState.origX + (dragState.origW - wCandidate);
          nextW = wCandidate;
        }
        if (dragState.corner.includes('n')) {
          nextH = Math.max(12, dragState.origH + dyPt);
        }
        if (dragState.corner.includes('s')) {
          const hCandidate = Math.max(12, dragState.origH - dyPt);
          nextY = dragState.origY + (dragState.origH - hCandidate);
          nextH = hCandidate;
        }

        if (dragState.lockAspect && dragState.aspectRatio > 0) {
          nextH = Math.max(12, nextW / dragState.aspectRatio);
          if (dragState.corner.includes('s')) {
            nextY = dragState.origY + (dragState.origH - nextH);
          }
        }

        onUpdateEdit(
          dragState.editId,
          (edit) => {
            if (edit.kind === 'image' || edit.kind === 'shape' || edit.kind === 'signature') {
              return {
                ...edit,
                pdfX: Number(nextX.toFixed(2)),
                pdfY: Number(nextY.toFixed(2)),
                pdfWidth: Number(nextW.toFixed(2)),
                pdfHeight: Number(nextH.toFixed(2))
              };
            }
            return edit;
          },
          false
        );
      } else if (dragState.mode === 'draw-whiteout') {
        const stage = stageRef.current;
        if (!stage) return;
        const rect = stage.getBoundingClientRect();
        const curVpX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const curVpY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
        setDragState((prev) =>
          prev && prev.mode === 'draw-whiteout' ? { ...prev, curVpX, curVpY } : prev
        );
      }
    }

    function handleUp() {
      if (dragState?.mode === 'draw-whiteout') {
        const x = Math.min(dragState.startVpX, dragState.curVpX);
        const y = Math.min(dragState.startVpY, dragState.curVpY);
        const w = Math.abs(dragState.curVpX - dragState.startVpX);
        const h = Math.abs(dragState.curVpY - dragState.startVpY);
        if (w >= 8 && h >= 6) {
          const pdfRect = viewportRectToPdfRect(
            { x, y, width: w, height: h },
            pageDims.pageHeightPt,
            zoom
          );
          onCanvasAddWhiteout(
            Number(pdfRect.x.toFixed(2)),
            Number(pdfRect.y.toFixed(2)),
            Number(pdfRect.width.toFixed(2)),
            Number(pdfRect.height.toFixed(2))
          );
        }
      }
      setDragState(null);
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [dragState, zoom, pageDims.pageHeightPt, onUpdateEdit, onCanvasAddWhiteout]);

  // Empty welcome state
  if (!activePage) {
    return (
      <main
        className="workspace"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingFile(true);
        }}
        onDragLeave={() => setIsDraggingFile(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingFile(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onDropPdfFile(file);
        }}
      >
        <div className="empty-state">
          <div className={`dropzone-card ${isDraggingFile ? 'dragging' : ''}`}>
            <div className="dropzone-icon" aria-hidden="true">
              <FileText size={22} />
            </div>
            <h1 className="dropzone-title">Drop a PDF to edit right in your browser</h1>
            <p className="dropzone-subtitle">
              Click existing text to replace it with automatic font and size matching, swap header
              logos, draw signatures, or merge pages. Export cleanly with zero watermarks and zero
              account prompts.
            </p>
            <div className="dropzone-actions">
              <button type="button" className="btn btn-primary" onClick={onOpenPdfClick}>
                <FolderOpen size={14} />
                <span>Choose PDF File</span>
              </button>
              <button type="button" className="btn" onClick={onOpenSample}>
                <span>Open Sample Invoice &amp; Resume PDF</span>
              </button>
            </div>
            <p className="dropzone-footnote">
              100% client-side · PDF.js + pdf-lib · 0 bytes uploaded
            </p>
          </div>
        </div>
      </main>
    );
  }

  const pageEdits = edits.filter((e) => e.pagePlanId === activePage.id);
  const replacedLineIds = new Set(
    pageEdits
      .filter((e): e is Extract<DocumentEdit, { kind: 'replace-text' }> => e.kind === 'replace-text')
      .map((e) => e.sourceLineId)
      .filter(Boolean)
  );

  function handleOverlayPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;

    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const vpX = e.clientX - rect.left;
    const vpY = e.clientY - rect.top;

    if (tool === 'add-text') {
      const { pdfX, pdfY } = viewportPointToPdfPoint(vpX, vpY, pageDims.pageHeightPt, zoom);
      onCanvasAddText(Number(pdfX.toFixed(2)), Number(pdfY.toFixed(2)));
      return;
    }

    if (tool === 'whiteout') {
      setDragState({
        mode: 'draw-whiteout',
        startVpX: vpX,
        startVpY: vpY,
        curVpX: vpX,
        curVpY: vpY
      });
      return;
    }

    onSelectEdit(null);
    setEditingInlineId(null);
  }

  function startMove(e: React.PointerEvent, edit: DocumentEdit) {
    if (editingInlineId === edit.id) return;
    e.stopPropagation();
    onSelectEdit(edit.id);
    if (edit.kind === 'replace-text') {
      setDragState({
        mode: 'move',
        editId: edit.id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origX: edit.pdfX,
        origY: edit.patchRect.y,
        origBaselineY: edit.baselineY,
        origPatchX: edit.patchRect.x,
        origPatchY: edit.patchRect.y
      });
    } else {
      setDragState({
        mode: 'move',
        editId: edit.id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origX: edit.pdfX,
        origY: edit.pdfY
      });
    }
  }

  function startResize(
    e: React.PointerEvent,
    edit: Extract<DocumentEdit, { kind: 'image' | 'shape' | 'signature' }>,
    corner: 'nw' | 'ne' | 'sw' | 'se'
  ) {
    e.stopPropagation();
    setDragState({
      mode: 'resize',
      editId: edit.id,
      corner,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: edit.pdfX,
      origY: edit.pdfY,
      origW: edit.pdfWidth,
      origH: edit.pdfHeight,
      lockAspect: edit.kind === 'image' ? edit.lockAspectRatio : false,
      aspectRatio: edit.kind === 'image' ? edit.aspectRatio : edit.pdfWidth / Math.max(1, edit.pdfHeight)
    });
  }

  const draftRectStyle =
    dragState?.mode === 'draw-whiteout'
      ? {
          left: Math.min(dragState.startVpX, dragState.curVpX),
          top: Math.min(dragState.startVpY, dragState.curVpY),
          width: Math.abs(dragState.curVpX - dragState.startVpX),
          height: Math.abs(dragState.curVpY - dragState.startVpY)
        }
      : null;

  return (
    <main className="workspace">
      <div className="workspace-scroll">
        <div
          ref={stageRef}
          className="page-stage"
          style={{
            width: pageDims.viewportWidthPx,
            height: pageDims.viewportHeightPx,
            cursor:
              tool === 'add-text' ? 'text' : tool === 'whiteout' ? 'crosshair' : 'default'
          }}
        >
          <canvas ref={canvasRef} className="pdf-canvas" />

          <div className="overlay-layer" onPointerDown={handleOverlayPointerDown}>
            {/* Detected Existing PDF Text Hitboxes */}
            {(tool === 'select' || tool === 'edit-text') &&
              extractedLines.map((line) => {
                if (replacedLineIds.has(line.id)) return null;
                const vp = pdfRectToViewportRect(
                  {
                    x: line.pdfX,
                    y: line.pdfY,
                    width: line.pdfWidth,
                    height: line.pdfHeight
                  },
                  pageDims.pageHeightPt,
                  zoom
                );

                return (
                  <div
                    key={line.id}
                    className={`detected-text-box ${tool === 'edit-text' ? 'edit-mode-visible' : ''}`}
                    style={{
                      left: vp.x - 2,
                      top: vp.y - 1,
                      width: Math.max(12, vp.width + 4),
                      height: Math.max(12, vp.height + 2)
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onClickExtractedLine(line);
                    }}
                    title={`Click to edit (${line.fontMatch.displayLabel}, ${line.fontSizePt}pt)`}
                  >
                    <span className="detected-font-tag">
                      {line.fontMatch.displayLabel} · {line.fontSizePt}pt
                    </span>
                  </div>
                );
              })}

            {/* Rendered User Edits */}
            {pageEdits.map((edit) => {
              const isSelected = edit.id === selectedEditId;

              if (edit.kind === 'replace-text') {
                const patch = computeReplacePatchRect(edit);
                const vpPatch = pdfRectToViewportRect(
                  patch,
                  pageDims.pageHeightPt,
                  zoom
                );
                const cssFont = getCssFontStyle(edit.fontFamily, edit.bold, edit.italic);
                const isInline = editingInlineId === edit.id;
                const textTopOffset =
                  (pageDims.pageHeightPt - edit.baselineY - edit.fontSizePt * 0.88) * zoom -
                  vpPatch.y;

                return (
                  <div
                    key={edit.id}
                    className={`edit-overlay ${isSelected ? 'selected' : ''}`}
                    style={{
                      left: vpPatch.x,
                      top: vpPatch.y,
                      minWidth: vpPatch.width,
                      minHeight: vpPatch.height,
                      background: edit.coverOriginal ? edit.backgroundHex : 'transparent'
                    }}
                    onPointerDown={(e) => startMove(e, edit)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onSelectEdit(edit.id);
                      setEditingInlineId(edit.id);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEdit(edit.id);
                    }}
                  >
                    {isInline ? (
                      <textarea
                        autoFocus
                        className="inline-text-editor"
                        value={edit.text}
                        rows={Math.max(1, edit.text.split('\n').length)}
                        style={{
                          marginLeft: (edit.pdfX - patch.x) * zoom,
                          marginTop: Math.max(0, textTopOffset),
                          fontFamily: cssFont.fontFamily,
                          fontWeight: cssFont.fontWeight,
                          fontStyle: cssFont.fontStyle,
                          fontSize: edit.fontSizePt * zoom,
                          color: edit.colorHex
                        }}
                        onChange={(e) =>
                          onUpdateEdit(edit.id, (prev) =>
                            prev.kind === 'replace-text' ? { ...prev, text: e.target.value } : prev
                          )
                        }
                        onBlur={() => setEditingInlineId(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setEditingInlineId(null);
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          marginLeft: (edit.pdfX - patch.x) * zoom,
                          marginTop: Math.max(0, textTopOffset),
                          fontFamily: cssFont.fontFamily,
                          fontWeight: cssFont.fontWeight,
                          fontStyle: cssFont.fontStyle,
                          fontSize: edit.fontSizePt * zoom,
                          color: edit.colorHex,
                          lineHeight: 1.22,
                          whiteSpace: 'pre'
                        }}
                      >
                        {edit.text || ' '}
                      </div>
                    )}
                  </div>
                );
              }

              if (edit.kind === 'add-text') {
                const cssFont = getCssFontStyle(edit.fontFamily, edit.bold, edit.italic);
                const vpX = edit.pdfX * zoom;
                const vpY = (pageDims.pageHeightPt - edit.pdfY - edit.fontSizePt * 0.9) * zoom;
                const isInline = editingInlineId === edit.id;

                return (
                  <div
                    key={edit.id}
                    className={`edit-overlay ${isSelected ? 'selected' : ''}`}
                    style={{
                      left: vpX,
                      top: vpY,
                      background: edit.backgroundHex || 'transparent',
                      padding: edit.backgroundHex ? `${3 * zoom}px ${5 * zoom}px` : 0,
                      opacity: edit.opacity
                    }}
                    onPointerDown={(e) => startMove(e, edit)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onSelectEdit(edit.id);
                      setEditingInlineId(edit.id);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEdit(edit.id);
                    }}
                  >
                    {isInline ? (
                      <textarea
                        autoFocus
                        className="inline-text-editor"
                        value={edit.text}
                        rows={Math.max(1, edit.text.split('\n').length)}
                        style={{
                          fontFamily: cssFont.fontFamily,
                          fontWeight: cssFont.fontWeight,
                          fontStyle: cssFont.fontStyle,
                          fontSize: edit.fontSizePt * zoom,
                          color: edit.colorHex
                        }}
                        onChange={(e) =>
                          onUpdateEdit(edit.id, (prev) =>
                            prev.kind === 'add-text' ? { ...prev, text: e.target.value } : prev
                          )
                        }
                        onBlur={() => setEditingInlineId(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setEditingInlineId(null);
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          fontFamily: cssFont.fontFamily,
                          fontWeight: cssFont.fontWeight,
                          fontStyle: cssFont.fontStyle,
                          fontSize: edit.fontSizePt * zoom,
                          color: edit.colorHex,
                          lineHeight: 1.25,
                          whiteSpace: 'pre'
                        }}
                      >
                        {edit.text || 'New text'}
                      </div>
                    )}
                  </div>
                );
              }

              if (edit.kind === 'shape') {
                const vp = pdfRectToViewportRect(
                  { x: edit.pdfX, y: edit.pdfY, width: edit.pdfWidth, height: edit.pdfHeight },
                  pageDims.pageHeightPt,
                  zoom
                );
                return (
                  <div
                    key={edit.id}
                    className={`edit-overlay ${isSelected ? 'selected' : ''}`}
                    style={{
                      left: vp.x,
                      top: vp.y,
                      width: vp.width,
                      height: vp.height,
                      background: edit.shapeType === 'line' ? 'transparent' : edit.fillHex,
                      border:
                        edit.shapeType === 'rect' && edit.strokeWidthPt > 0
                          ? `${edit.strokeWidthPt * zoom}px solid ${edit.strokeHex}`
                          : 'none',
                      opacity: edit.opacity,
                      display: 'flex',
                      alignItems: 'center'
                    }}
                    onPointerDown={(e) => startMove(e, edit)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEdit(edit.id);
                    }}
                  >
                    {edit.shapeType === 'line' && (
                      <div
                        style={{
                          width: '100%',
                          height: Math.max(1, edit.strokeWidthPt * zoom),
                          background: edit.strokeHex
                        }}
                      />
                    )}
                    {isSelected && (
                      <>
                        <span className="resize-handle nw" onPointerDown={(e) => startResize(e, edit, 'nw')} />
                        <span className="resize-handle ne" onPointerDown={(e) => startResize(e, edit, 'ne')} />
                        <span className="resize-handle sw" onPointerDown={(e) => startResize(e, edit, 'sw')} />
                        <span className="resize-handle se" onPointerDown={(e) => startResize(e, edit, 'se')} />
                      </>
                    )}
                  </div>
                );
              }

              if (edit.kind === 'image') {
                const vp = pdfRectToViewportRect(
                  { x: edit.pdfX, y: edit.pdfY, width: edit.pdfWidth, height: edit.pdfHeight },
                  pageDims.pageHeightPt,
                  zoom
                );
                return (
                  <div
                    key={edit.id}
                    className={`edit-overlay ${isSelected ? 'selected' : ''}`}
                    style={{
                      left: vp.x,
                      top: vp.y,
                      width: vp.width,
                      height: vp.height,
                      background: edit.coverUnderlying ? edit.coverColorHex : 'transparent'
                    }}
                    onPointerDown={(e) => startMove(e, edit)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEdit(edit.id);
                    }}
                  >
                    <img
                      src={edit.previewDataUrl}
                      alt={edit.name}
                      draggable={false}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'fill',
                        opacity: edit.opacity,
                        display: 'block',
                        pointerEvents: 'none'
                      }}
                    />
                    {isSelected && (
                      <>
                        <span className="resize-handle nw" onPointerDown={(e) => startResize(e, edit, 'nw')} />
                        <span className="resize-handle ne" onPointerDown={(e) => startResize(e, edit, 'ne')} />
                        <span className="resize-handle sw" onPointerDown={(e) => startResize(e, edit, 'sw')} />
                        <span className="resize-handle se" onPointerDown={(e) => startResize(e, edit, 'se')} />
                      </>
                    )}
                  </div>
                );
              }

              // Signature edit
              const vp = pdfRectToViewportRect(
                { x: edit.pdfX, y: edit.pdfY, width: edit.pdfWidth, height: edit.pdfHeight },
                pageDims.pageHeightPt,
                zoom
              );
              const sigFont = getCssFontStyle(edit.fontFamily, false, true);

              return (
                <div
                  key={edit.id}
                  className={`edit-overlay ${isSelected ? 'selected' : ''}`}
                  style={{
                    left: vp.x,
                    top: vp.y,
                    width: vp.width,
                    height: vp.height,
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: edit.showBaseline ? '1px solid #71717a' : 'none'
                  }}
                  onPointerDown={(e) => startMove(e, edit)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEdit(edit.id);
                  }}
                >
                  {edit.mode === 'drawn' && edit.previewDataUrl ? (
                    <img
                      src={edit.previewDataUrl}
                      alt="Signature"
                      draggable={false}
                      style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
                    />
                  ) : (
                    <span
                      style={{
                        fontFamily: sigFont.fontFamily,
                        fontStyle: 'italic',
                        fontSize: edit.fontSizePt * zoom,
                        color: edit.inkHex,
                        paddingLeft: 4 * zoom,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {edit.typedText}
                    </span>
                  )}
                  {isSelected && (
                    <>
                      <span className="resize-handle nw" onPointerDown={(e) => startResize(e, edit, 'nw')} />
                      <span className="resize-handle ne" onPointerDown={(e) => startResize(e, edit, 'ne')} />
                      <span className="resize-handle sw" onPointerDown={(e) => startResize(e, edit, 'sw')} />
                      <span className="resize-handle se" onPointerDown={(e) => startResize(e, edit, 'se')} />
                    </>
                  )}
                </div>
              );
            })}

            {draftRectStyle && <div className="draft-whiteout-rect" style={draftRectStyle} />}
          </div>
        </div>
      </div>

      <footer className="workspace-statusbar">
        <span>
          Page {activePageNumber} of {totalPages} · {extractedLines.length} editable text block
          {extractedLines.length === 1 ? '' : 's'} detected
        </span>
        <span className="statusbar-mono">
          {Math.round(pageDims.pageWidthPt)} x {Math.round(pageDims.pageHeightPt)} pt · Double-click
          any text edit for inline typing
        </span>
      </footer>
    </main>
  );
}
