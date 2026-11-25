import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { StandardFontFamily } from '../lib/types';

export interface SignatureResult {
  mode: 'drawn' | 'typed';
  pngBytes?: Uint8Array;
  previewDataUrl?: string;
  typedText?: string;
  fontFamily: StandardFontFamily;
  inkHex: string;
  showBaseline: boolean;
}

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (sig: SignatureResult) => void;
}

const INK_SWATCHES = ['#18181b', '#1e3a8a', '#0f4c5c', '#374151'];

export function SignatureModal({ isOpen, onClose, onApply }: SignatureModalProps) {
  const [mode, setMode] = useState<'drawn' | 'typed'>('drawn');
  const [inkHex, setInkHex] = useState('#18181b');
  const [strokeWidth, setStrokeWidth] = useState(2.4);
  const [typedText, setTypedText] = useState('Jordan Ellis');
  const [fontFamily, setFontFamily] = useState<StandardFontFamily>('times');
  const [showBaseline, setShowBaseline] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!isOpen || mode !== 'drawn') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = 440 * dpr;
    canvas.height = 160 * dpr;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, 440, 160);
    }
    setHasStrokes(false);
  }, [isOpen, mode]);

  if (!isOpen) return null;

  function getPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 440,
      y: ((e.clientY - rect.top) / rect.height) * 160
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPtRef.current = getPoint(e);
    setHasStrokes(true);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !lastPtRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const pt = getPoint(e);
    const prev = lastPtRef.current;
    const midX = (prev.x + pt.x) / 2;
    const midY = (prev.y + pt.y) / 2;

    ctx.strokeStyle = inkHex;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();

    lastPtRef.current = pt;
  }

  function handlePointerUp() {
    drawingRef.current = false;
    lastPtRef.current = null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 440, 160);
    }
    setHasStrokes(false);
  }

  async function handleConfirm() {
    if (mode === 'drawn') {
      const canvas = canvasRef.current;
      if (!canvas || !hasStrokes) return;
      const dataUrl = canvas.toDataURL('image/png');
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png')
      );
      if (!blob) return;
      const buf = new Uint8Array(await blob.arrayBuffer());
      onApply({
        mode: 'drawn',
        pngBytes: buf,
        previewDataUrl: dataUrl,
        fontFamily,
        inkHex,
        showBaseline
      });
      onClose();
      return;
    }

    if (!typedText.trim()) return;
    onApply({
      mode: 'typed',
      typedText: typedText.trim(),
      fontFamily,
      inkHex,
      showBaseline
    });
    onClose();
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Insert signature">
      <div className="modal-card">
        <div className="modal-header">
          <h2 className="modal-title">Add Signature</h2>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            aria-label="Close signature dialog"
          >
            <X size={15} />
          </button>
        </div>

        <div className="modal-body">
          <div className="segmented" style={{ alignSelf: 'flex-start' }}>
            <button
              type="button"
              className={`segmented-btn ${mode === 'drawn' ? 'active' : ''}`}
              onClick={() => setMode('drawn')}
            >
              Draw Freehand
            </button>
            <button
              type="button"
              className={`segmented-btn ${mode === 'typed' ? 'active' : ''}`}
              onClick={() => setMode('typed')}
            >
              Type Signature
            </button>
          </div>

          {mode === 'drawn' ? (
            <>
              <canvas
                ref={canvasRef}
                className="signature-pad-canvas"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {INK_SWATCHES.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      onClick={() => setInkHex(swatch)}
                      aria-label={`Ink color ${swatch}`}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 999,
                        background: swatch,
                        border:
                          inkHex === swatch ? '2px solid var(--accent)' : '1px solid var(--border-strong)'
                      }}
                    />
                  ))}
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Stroke</span>
                    <input
                      type="range"
                      min={1.4}
                      max={4.5}
                      step={0.2}
                      value={strokeWidth}
                      onChange={(e) => setStrokeWidth(Number(e.target.value))}
                      style={{ width: 72 }}
                    />
                  </label>
                </div>
                <button type="button" className="btn btn-ghost" onClick={clearCanvas}>
                  Clear
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="field-group">
                <label className="field-label" htmlFor="typed-sig-input">
                  Signature Text
                </label>
                <input
                  id="typed-sig-input"
                  className="input"
                  value={typedText}
                  onChange={(e) => setTypedText(e.target.value)}
                  placeholder="Type your name"
                />
              </div>

              <div className="field-row">
                <div className="field-group">
                  <label className="field-label" htmlFor="typed-sig-font">
                    Style
                  </label>
                  <select
                    id="typed-sig-font"
                    className="select"
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value as StandardFontFamily)}
                  >
                    <option value="times">Serif Italic (Times)</option>
                    <option value="helvetica">Clean Italic (Helvetica)</option>
                  </select>
                </div>

                <div className="field-group">
                  <label className="field-label">Ink Color</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 30 }}>
                    {INK_SWATCHES.map((swatch) => (
                      <button
                        key={swatch}
                        type="button"
                        onClick={() => setInkHex(swatch)}
                        aria-label={`Ink color ${swatch}`}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 999,
                          background: swatch,
                          border:
                            inkHex === swatch
                              ? '2px solid var(--accent)'
                              : '1px solid var(--border-strong)'
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div
                className="typed-sig-preview"
                style={{
                  color: inkHex,
                  fontFamily:
                    fontFamily === 'times'
                      ? '"Times New Roman", Georgia, serif'
                      : 'Helvetica, Arial, sans-serif'
                }}
              >
                {typedText || 'Preview'}
              </div>
            </>
          )}

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={showBaseline}
              onChange={(e) => setShowBaseline(e.target.checked)}
            />
            <span>Include subtle signature baseline rule</span>
          </label>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={mode === 'drawn' ? !hasStrokes : !typedText.trim()}
          >
            Place Signature
          </button>
        </div>
      </div>
    </div>
  );
}
