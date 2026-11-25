import {
  Download,
  Eraser,
  FilePlus2,
  FolderOpen,
  ImagePlus,
  Moon,
  MousePointer2,
  PenTool,
  Redo2,
  Sun,
  Type,
  TypeOutline,
  Undo2,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import type { ToolMode } from '../lib/types';

interface ToolbarProps {
  hasDocument: boolean;
  documentName: string;
  tool: ToolMode;
  onToolChange: (tool: ToolMode) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onOpenPdfClick: () => void;
  onMergePdfClick: () => void;
  onOpenSample: () => void;
  onInsertImageClick: () => void;
  onOpenSignature: () => void;
  onDownloadPdf: () => void;
  isExporting: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export function Toolbar({
  hasDocument,
  documentName,
  tool,
  onToolChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoom,
  onZoomChange,
  onOpenPdfClick,
  onMergePdfClick,
  onOpenSample,
  onInsertImageClick,
  onOpenSignature,
  onDownloadPdf,
  isExporting,
  theme,
  onToggleTheme
}: ToolbarProps) {
  return (
    <header className="toolbar" role="toolbar" aria-label="PDF editor controls">
      <div className="toolbar-group">
        <div className="brand-mark" title={documentName || 'localpdf'}>
          <span className="brand-icon" aria-hidden="true">
            LP
          </span>
          <span>localpdf</span>
        </div>

        <div className="toolbar-divider" />

        <button type="button" className="btn" onClick={onOpenPdfClick} title="Open local PDF">
          <FolderOpen size={14} />
          <span>Open</span>
        </button>

        {hasDocument ? (
          <button
            type="button"
            className="btn"
            onClick={onMergePdfClick}
            title="Append another local PDF into this document"
          >
            <FilePlus2 size={14} />
            <span>Merge</span>
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={onOpenSample}
            title="Generate a sample 2-page invoice and resume PDF locally"
          >
            <span>Sample PDF</span>
          </button>
        )}
      </div>

      {hasDocument && (
        <div className="toolbar-group">
          <div className="segmented" role="radiogroup" aria-label="Editing tools">
            <button
              type="button"
              className={`segmented-btn ${tool === 'select' ? 'active' : ''}`}
              onClick={() => onToolChange('select')}
              title="Select or move overlays (V)"
            >
              <MousePointer2 size={13} />
              <span>Select</span>
            </button>
            <button
              type="button"
              className={`segmented-btn ${tool === 'edit-text' ? 'active' : ''}`}
              onClick={() => onToolChange('edit-text')}
              title="Click existing PDF text to edit with matched font (T)"
            >
              <TypeOutline size={13} />
              <span>Edit Text</span>
            </button>
            <button
              type="button"
              className={`segmented-btn ${tool === 'add-text' ? 'active' : ''}`}
              onClick={() => onToolChange('add-text')}
              title="Click anywhere to add new text (A)"
            >
              <Type size={13} />
              <span>Add Text</span>
            </button>
            <button
              type="button"
              className={`segmented-btn ${tool === 'image' ? 'active' : ''}`}
              onClick={onInsertImageClick}
              title="Insert or replace logo/image (I)"
            >
              <ImagePlus size={13} />
              <span>Logo / Image</span>
            </button>
            <button
              type="button"
              className={`segmented-btn ${tool === 'whiteout' ? 'active' : ''}`}
              onClick={() => onToolChange('whiteout')}
              title="Drag to draw whiteout or rectangle patch (W)"
            >
              <Eraser size={13} />
              <span>Whiteout</span>
            </button>
            <button
              type="button"
              className={`segmented-btn ${tool === 'signature' ? 'active' : ''}`}
              onClick={onOpenSignature}
              title="Draw or type a signature (S)"
            >
              <PenTool size={13} />
              <span>Sign</span>
            </button>
          </div>

          <div className="toolbar-divider" />

          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            <Undo2 size={14} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
          >
            <Redo2 size={14} />
          </button>

          <div className="toolbar-divider" />

          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={() => onZoomChange(Math.max(0.5, Number((zoom - 0.15).toFixed(2))))}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={() => onZoomChange(Math.min(2.5, Number((zoom + 0.15).toFixed(2))))}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
        </div>
      )}

      <div className="toolbar-group">
        <div
          className="privacy-pill"
          title="All rendering and PDF writing run strictly inside your browser tab."
        >
          <span className="privacy-dot" aria-hidden="true" />
          <span>Local Browser Engine · 0 bytes uploaded</span>
        </div>

        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={onToggleTheme}
          title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          aria-label="Toggle color theme"
        >
          {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
        </button>

        {hasDocument && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onDownloadPdf}
            disabled={isExporting}
            title="Download edited PDF directly from browser memory — zero watermark"
          >
            <Download size={14} />
            <span>{isExporting ? 'Exporting...' : 'Download PDF'}</span>
          </button>
        )}
      </div>
    </header>
  );
}
