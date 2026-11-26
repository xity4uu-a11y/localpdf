import { useState } from 'react';
import { Bold, Italic, Trash2, Upload } from 'lucide-react';
import { BUNDLED_PLUGINS } from '../lib/presets';
import type {
  DocumentEdit,
  PluginManifest,
  PluginPresetAction,
  StandardFontFamily
} from '../lib/types';

interface InspectorPanelProps {
  hasDocument: boolean;
  pageEdits: DocumentEdit[];
  selectedEdit: DocumentEdit | null;
  onSelectEdit: (editId: string | null) => void;
  onUpdateEdit: (editId: string, updater: (edit: DocumentEdit) => DocumentEdit) => void;
  onDeleteEdit: (editId: string) => void;
  onReplaceImageFile: (editId: string) => void;
  onSwapWithDemoLogo: (editId: string) => void;
  onApplyPluginDefaults: (plugin: PluginManifest) => void;
  onTriggerPresetAction: (plugin: PluginManifest, action: PluginPresetAction) => void;
}

function summarizeEdit(edit: DocumentEdit): { label: string; kindTag: string } {
  switch (edit.kind) {
    case 'replace-text':
      return { label: edit.text || '(Empty replacement)', kindTag: 'TEXT' };
    case 'add-text':
      return { label: edit.text || '(New text)', kindTag: 'NEW' };
    case 'image':
      return { label: edit.name || 'Image', kindTag: 'LOGO' };
    case 'shape':
      return {
        label:
          edit.shapeType === 'whiteout'
            ? 'Whiteout Patch'
            : edit.shapeType === 'line'
              ? 'Divider Line'
              : 'Rectangle',
        kindTag: 'BOX'
      };
    case 'signature':
      return {
        label: edit.mode === 'drawn' ? 'Drawn Signature' : edit.typedText || 'Signature',
        kindTag: 'SIGN'
      };
  }
}

export function InspectorPanel({
  hasDocument,
  pageEdits,
  selectedEdit,
  onSelectEdit,
  onUpdateEdit,
  onDeleteEdit,
  onReplaceImageFile,
  onSwapWithDemoLogo,
  onApplyPluginDefaults,
  onTriggerPresetAction
}: InspectorPanelProps) {
  const [tab, setTab] = useState<'inspector' | 'presets'>('inspector');

  return (
    <aside className="inspector" aria-label="Properties and presets">
      <div className="inspector-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'inspector'}
          className={`inspector-tab ${tab === 'inspector' ? 'active' : ''}`}
          onClick={() => setTab('inspector')}
        >
          Inspector
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'presets'}
          className={`inspector-tab ${tab === 'presets' ? 'active' : ''}`}
          onClick={() => setTab('presets')}
        >
          Presets ({BUNDLED_PLUGINS.length})
        </button>
      </div>

      {tab === 'inspector' ? (
        <div className="inspector-scroll">
          {!hasDocument ? (
            <div className="section-card">
              <p className="section-title">No Document Loaded</p>
              <p className="preset-desc">
                Open any local PDF or load the built-in Invoice &amp; Resume sample to inspect
                detected fonts, replace text, swap logos, and export cleanly.
              </p>
            </div>
          ) : selectedEdit ? (
            <div className="section-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p className="section-title">
                  {selectedEdit.kind === 'replace-text'
                    ? 'Replace Existing Text'
                    : selectedEdit.kind === 'add-text'
                      ? 'Text Block'
                      : selectedEdit.kind === 'image'
                        ? 'Logo / Image'
                        : selectedEdit.kind === 'shape'
                          ? 'Whiteout / Shape'
                          : 'Signature'}
                </p>
                <button
                  type="button"
                  className="btn btn-danger btn-icon"
                  onClick={() => onDeleteEdit(selectedEdit.id)}
                  title="Delete selected edit"
                  aria-label="Delete selected edit"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {(selectedEdit.kind === 'replace-text' || selectedEdit.kind === 'add-text') && (
                <>
                  {selectedEdit.kind === 'replace-text' && (
                    <div className="detected-badge" title="Matched from PDF text descriptor">
                      Detected: {selectedEdit.detectedFontLabel}
                    </div>
                  )}

                  <div className="field-group">
                    <label className="field-label" htmlFor="inspector-text-content">
                      Text Content
                    </label>
                    <textarea
                      id="inspector-text-content"
                      className="textarea"
                      value={selectedEdit.text}
                      onChange={(e) =>
                        onUpdateEdit(selectedEdit.id, (prev) =>
                          prev.kind === 'replace-text' || prev.kind === 'add-text'
                            ? { ...prev, text: e.target.value }
                            : prev
                        )
                      }
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label" htmlFor="inspector-font-family">
                      Font Family
                    </label>
                    <select
                      id="inspector-font-family"
                      className="select"
                      value={selectedEdit.fontFamily}
                      onChange={(e) =>
                        onUpdateEdit(selectedEdit.id, (prev) =>
                          prev.kind === 'replace-text' || prev.kind === 'add-text'
                            ? { ...prev, fontFamily: e.target.value as StandardFontFamily }
                            : prev
                        )
                      }
                    >
                      <option value="helvetica">Helvetica (Sans-serif)</option>
                      <option value="times">Times (Serif)</option>
                      <option value="courier">Courier (Monospace)</option>
                    </select>
                  </div>

                  <div className="field-row">
                    <div className="field-group">
                      <label className="field-label" htmlFor="inspector-font-size">
                        Size (pt)
                      </label>
                      <input
                        id="inspector-font-size"
                        type="number"
                        className="input"
                        min={6}
                        max={96}
                        step={0.5}
                        value={selectedEdit.fontSizePt}
                        onChange={(e) =>
                          onUpdateEdit(selectedEdit.id, (prev) =>
                            prev.kind === 'replace-text' || prev.kind === 'add-text'
                              ? { ...prev, fontSizePt: Math.max(6, Number(e.target.value) || 10) }
                              : prev
                          )
                        }
                      />
                    </div>

                    <div className="field-group">
                      <span className="field-label">Style</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className={`btn btn-icon ${selectedEdit.bold ? 'btn-primary' : ''}`}
                          onClick={() =>
                            onUpdateEdit(selectedEdit.id, (prev) =>
                              prev.kind === 'replace-text' || prev.kind === 'add-text'
                                ? { ...prev, bold: !prev.bold }
                                : prev
                            )
                          }
                          title="Bold"
                          aria-label="Toggle bold"
                        >
                          <Bold size={13} />
                        </button>
                        <button
                          type="button"
                          className={`btn btn-icon ${selectedEdit.italic ? 'btn-primary' : ''}`}
                          onClick={() =>
                            onUpdateEdit(selectedEdit.id, (prev) =>
                              prev.kind === 'replace-text' || prev.kind === 'add-text'
                                ? { ...prev, italic: !prev.italic }
                                : prev
                            )
                          }
                          title="Italic"
                          aria-label="Toggle italic"
                        >
                          <Italic size={13} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="field-group">
                    <label className="field-label" htmlFor="inspector-ink-hex">
                      Ink Color
                    </label>
                    <div className="color-input-row">
                      <input
                        type="color"
                        className="color-swatch"
                        value={selectedEdit.colorHex}
                        onChange={(e) =>
                          onUpdateEdit(selectedEdit.id, (prev) =>
                            prev.kind === 'replace-text' || prev.kind === 'add-text'
                              ? { ...prev, colorHex: e.target.value }
                              : prev
                          )
                        }
                      />
                      <input
                        id="inspector-ink-hex"
                        className="input"
                        style={{ fontFamily: 'var(--font-mono)' }}
                        value={selectedEdit.colorHex}
                        onChange={(e) =>
                          onUpdateEdit(selectedEdit.id, (prev) =>
                            prev.kind === 'replace-text' || prev.kind === 'add-text'
                              ? { ...prev, colorHex: e.target.value }
                              : prev
                          )
                        }
                      />
                    </div>
                  </div>

                  {selectedEdit.kind === 'replace-text' && (
                    <>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={selectedEdit.coverOriginal}
                          onChange={(e) =>
                            onUpdateEdit(selectedEdit.id, (prev) =>
                              prev.kind === 'replace-text'
                                ? { ...prev, coverOriginal: e.target.checked }
                                : prev
                            )
                          }
                        />
                        <span>Cover original text behind edit</span>
                      </label>

                      {selectedEdit.coverOriginal && (
                        <div className="field-row">
                          <div className="field-group">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span className="field-label">Cover Color</span>
                              <button
                                type="button"
                                className="mini-btn"
                                onClick={() =>
                                  onUpdateEdit(selectedEdit.id, (prev) =>
                                    prev.kind === 'replace-text'
                                      ? { ...prev, backgroundHex: '#ffffff' }
                                      : prev
                                  )
                                }
                                title="Set cover fill to pure white (#ffffff)"
                              >
                                White
                              </button>
                            </div>
                            <div className="color-input-row">
                              <input
                                type="color"
                                className="color-swatch"
                                value={selectedEdit.backgroundHex}
                                onChange={(e) =>
                                  onUpdateEdit(selectedEdit.id, (prev) =>
                                    prev.kind === 'replace-text'
                                      ? { ...prev, backgroundHex: e.target.value }
                                      : prev
                                  )
                                }
                              />
                              <input
                                className="input"
                                style={{ fontFamily: 'var(--font-mono)' }}
                                value={selectedEdit.backgroundHex}
                                onChange={(e) =>
                                  onUpdateEdit(selectedEdit.id, (prev) =>
                                    prev.kind === 'replace-text'
                                      ? { ...prev, backgroundHex: e.target.value }
                                      : prev
                                  )
                                }
                              />
                            </div>
                          </div>

                          <div className="field-group">
                            <label className="field-label" htmlFor="inspector-pad">
                              Patch Pad (pt)
                            </label>
                            <input
                              id="inspector-pad"
                              type="number"
                              className="input"
                              min={0}
                              max={12}
                              step={0.5}
                              value={selectedEdit.paddingPt}
                              onChange={(e) =>
                                onUpdateEdit(selectedEdit.id, (prev) =>
                                  prev.kind === 'replace-text'
                                    ? { ...prev, paddingPt: Math.max(0, Number(e.target.value) || 0) }
                                    : prev
                                )
                              }
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {selectedEdit.kind === 'image' && (
                <>
                  <div className="detected-badge">{selectedEdit.name}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn"
                      style={{ flex: 1 }}
                      onClick={() => onReplaceImageFile(selectedEdit.id)}
                    >
                      <Upload size={13} />
                      <span>Swap File</span>
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => onSwapWithDemoLogo(selectedEdit.id)}
                      title="Swap with built-in minimalist studio emblem PNG"
                    >
                      <span>Demo Mark</span>
                    </button>
                  </div>

                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={selectedEdit.coverUnderlying}
                      onChange={(e) =>
                        onUpdateEdit(selectedEdit.id, (prev) =>
                          prev.kind === 'image'
                            ? { ...prev, coverUnderlying: e.target.checked }
                            : prev
                        )
                      }
                    />
                    <span>Cover underlying logo with opaque fill</span>
                  </label>

                  {selectedEdit.coverUnderlying && (
                    <div className="field-group">
                      <span className="field-label">Backing Color</span>
                      <div className="color-input-row">
                        <input
                          type="color"
                          className="color-swatch"
                          value={selectedEdit.coverColorHex}
                          onChange={(e) =>
                            onUpdateEdit(selectedEdit.id, (prev) =>
                              prev.kind === 'image'
                                ? { ...prev, coverColorHex: e.target.value }
                                : prev
                            )
                          }
                        />
                        <input
                          className="input"
                          style={{ fontFamily: 'var(--font-mono)' }}
                          value={selectedEdit.coverColorHex}
                          onChange={(e) =>
                            onUpdateEdit(selectedEdit.id, (prev) =>
                              prev.kind === 'image'
                                ? { ...prev, coverColorHex: e.target.value }
                                : prev
                            )
                          }
                        />
                      </div>
                    </div>
                  )}

                  <div className="field-row">
                    <div className="field-group">
                      <label className="field-label" htmlFor="img-w">
                        Width (pt)
                      </label>
                      <input
                        id="img-w"
                        type="number"
                        className="input"
                        min={16}
                        max={600}
                        value={Math.round(selectedEdit.pdfWidth)}
                        onChange={(e) => {
                          const w = Math.max(16, Number(e.target.value) || 40);
                          onUpdateEdit(selectedEdit.id, (prev) =>
                            prev.kind === 'image'
                              ? {
                                  ...prev,
                                  pdfWidth: w,
                                  pdfHeight: prev.lockAspectRatio
                                    ? Number((w / Math.max(0.1, prev.aspectRatio)).toFixed(1))
                                    : prev.pdfHeight
                                }
                              : prev
                          );
                        }}
                      />
                    </div>
                    <div className="field-group">
                      <label className="field-label" htmlFor="img-h">
                        Height (pt)
                      </label>
                      <input
                        id="img-h"
                        type="number"
                        className="input"
                        min={16}
                        max={600}
                        value={Math.round(selectedEdit.pdfHeight)}
                        onChange={(e) => {
                          const h = Math.max(16, Number(e.target.value) || 40);
                          onUpdateEdit(selectedEdit.id, (prev) =>
                            prev.kind === 'image'
                              ? {
                                  ...prev,
                                  pdfHeight: h,
                                  pdfWidth: prev.lockAspectRatio
                                    ? Number((h * Math.max(0.1, prev.aspectRatio)).toFixed(1))
                                    : prev.pdfWidth
                                }
                              : prev
                          );
                        }}
                      />
                    </div>
                  </div>

                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={selectedEdit.lockAspectRatio}
                      onChange={(e) =>
                        onUpdateEdit(selectedEdit.id, (prev) =>
                          prev.kind === 'image'
                            ? { ...prev, lockAspectRatio: e.target.checked }
                            : prev
                        )
                      }
                    />
                    <span>Lock aspect ratio</span>
                  </label>
                </>
              )}

              {selectedEdit.kind === 'shape' && (
                <>
                  <div className="field-group">
                    <label className="field-label" htmlFor="shape-mode">
                      Shape Kind
                    </label>
                    <select
                      id="shape-mode"
                      className="select"
                      value={selectedEdit.shapeType}
                      onChange={(e) =>
                        onUpdateEdit(selectedEdit.id, (prev) =>
                          prev.kind === 'shape'
                            ? {
                                ...prev,
                                shapeType: e.target.value as 'whiteout' | 'rect' | 'line'
                              }
                            : prev
                        )
                      }
                    >
                      <option value="whiteout">Whiteout Cover Box</option>
                      <option value="rect">Bordered Rectangle</option>
                      <option value="line">Horizontal Rule / Line</option>
                    </select>
                  </div>

                  {selectedEdit.shapeType !== 'line' && (
                    <div className="field-group">
                      <span className="field-label">Fill Color</span>
                      <div className="color-input-row">
                        <input
                          type="color"
                          className="color-swatch"
                          value={selectedEdit.fillHex}
                          onChange={(e) =>
                            onUpdateEdit(selectedEdit.id, (prev) =>
                              prev.kind === 'shape' ? { ...prev, fillHex: e.target.value } : prev
                            )
                          }
                        />
                        <input
                          className="input"
                          style={{ fontFamily: 'var(--font-mono)' }}
                          value={selectedEdit.fillHex}
                          onChange={(e) =>
                            onUpdateEdit(selectedEdit.id, (prev) =>
                              prev.kind === 'shape' ? { ...prev, fillHex: e.target.value } : prev
                            )
                          }
                        />
                      </div>
                    </div>
                  )}

                  {selectedEdit.shapeType !== 'whiteout' && (
                    <div className="field-row">
                      <div className="field-group">
                        <span className="field-label">Stroke Color</span>
                        <input
                          type="color"
                          className="color-swatch"
                          value={selectedEdit.strokeHex}
                          onChange={(e) =>
                            onUpdateEdit(selectedEdit.id, (prev) =>
                              prev.kind === 'shape' ? { ...prev, strokeHex: e.target.value } : prev
                            )
                          }
                        />
                      </div>
                      <div className="field-group">
                        <label className="field-label" htmlFor="stroke-w">
                          Stroke (pt)
                        </label>
                        <input
                          id="stroke-w"
                          type="number"
                          className="input"
                          min={0.5}
                          max={10}
                          step={0.5}
                          value={selectedEdit.strokeWidthPt}
                          onChange={(e) =>
                            onUpdateEdit(selectedEdit.id, (prev) =>
                              prev.kind === 'shape'
                                ? { ...prev, strokeWidthPt: Math.max(0.5, Number(e.target.value) || 1) }
                                : prev
                            )
                          }
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {selectedEdit.kind === 'signature' && (
                <>
                  {selectedEdit.mode === 'typed' && (
                    <div className="field-group">
                      <label className="field-label" htmlFor="sig-text">
                        Signature Text
                      </label>
                      <input
                        id="sig-text"
                        className="input"
                        value={selectedEdit.typedText ?? ''}
                        onChange={(e) =>
                          onUpdateEdit(selectedEdit.id, (prev) =>
                            prev.kind === 'signature' ? { ...prev, typedText: e.target.value } : prev
                          )
                        }
                      />
                    </div>
                  )}
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={selectedEdit.showBaseline}
                      onChange={(e) =>
                        onUpdateEdit(selectedEdit.id, (prev) =>
                          prev.kind === 'signature'
                            ? { ...prev, showBaseline: e.target.checked }
                            : prev
                        )
                      }
                    />
                    <span>Show signature baseline</span>
                  </label>
                </>
              )}
            </div>
          ) : (
            <div className="section-card">
              <p className="section-title">Quick Guide</p>
              <p className="preset-desc">
                Click any text on the page to edit it in the matched font. Use Logo / Image with
                &quot;Cover underlying logo&quot; enabled to swap an existing header mark cleanly.
              </p>
            </div>
          )}

          {hasDocument && (
            <div className="field-group">
              <div className="field-label">
                <span>Edits on This Page</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{pageEdits.length}</span>
              </div>

              {pageEdits.length === 0 ? (
                <p className="preset-desc">No edits on this page yet.</p>
              ) : (
                <div className="layer-list">
                  {pageEdits.map((edit) => {
                    const summary = summarizeEdit(edit);
                    return (
                      <div
                        key={edit.id}
                        className={`layer-item ${selectedEdit?.id === edit.id ? 'active' : ''}`}
                        onClick={() => onSelectEdit(edit.id)}
                      >
                        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span className="layer-item-text">{summary.label}</span>
                          <span className="layer-item-kind">{summary.kindTag}</span>
                        </div>
                        <button
                          type="button"
                          className="mini-btn danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteEdit(edit.id);
                          }}
                          title="Remove edit"
                          aria-label={`Remove ${summary.label}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="inspector-scroll">
          {BUNDLED_PLUGINS.map((plugin) => (
            <div key={plugin.id} className="preset-card">
              <div className="preset-header">
                <span className="preset-name">{plugin.name}</span>
                <span className="preset-cat">{plugin.category}</span>
              </div>
              <p className="preset-desc">{plugin.description}</p>
              <div className="preset-actions">
                <button
                  type="button"
                  className="preset-action-btn"
                  onClick={() => onApplyPluginDefaults(plugin)}
                >
                  Apply Defaults ({plugin.defaults.fontFamily} {plugin.defaults.fontSizePt}pt)
                </button>
                {plugin.presets.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className="preset-action-btn"
                    disabled={!hasDocument && action.kind !== 'merge-plan'}
                    onClick={() => onTriggerPresetAction(plugin, action)}
                    title={action.notes || action.label}
                  >
                    + {action.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
