import { useEffect, useRef } from 'react';
import {
  ArrowDown,
  ArrowUp,
  FilePlus2,
  PlusSquare,
  RotateCw,
  Trash2
} from 'lucide-react';
import {
  renderBlankPageToCanvas,
  renderPageToCanvas,
  type LoadedPdfProxy
} from '../lib/pdfInspector';
import type { DocumentEdit, PagePlanItem } from '../lib/types';

interface PageThumbProps {
  item: PagePlanItem;
  proxy?: LoadedPdfProxy;
}

function PageThumb({ item, proxy }: PageThumbProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    async function draw() {
      if (!canvas) return;
      try {
        if (item.isBlank) {
          await renderBlankPageToCanvas(
            canvas,
            item.blankWidthPt ?? 612,
            item.blankHeightPt ?? 792,
            0.22
          );
        } else if (proxy && !cancelled) {
          await renderPageToCanvas(proxy, item.sourcePageIndex + 1, canvas, 0.22, item.rotationDelta);
        }
      } catch {
        // Ignore cancelled thumbnail renders
      }
    }

    draw();
    return () => {
      cancelled = true;
    };
  }, [item.isBlank, item.blankWidthPt, item.blankHeightPt, item.sourcePageIndex, item.rotationDelta, proxy]);

  return <canvas ref={canvasRef} className="page-thumb-canvas" />;
}

interface PageSidebarProps {
  pagePlan: PagePlanItem[];
  activePageId: string | null;
  pdfProxies: Map<string, LoadedPdfProxy>;
  edits: DocumentEdit[];
  onSelectPage: (pageId: string) => void;
  onMovePage: (index: number, direction: -1 | 1) => void;
  onRotatePage: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
  onInsertBlankPage: () => void;
  onMergePdfClick: () => void;
}

export function PageSidebar({
  pagePlan,
  activePageId,
  pdfProxies,
  edits,
  onSelectPage,
  onMovePage,
  onRotatePage,
  onDeletePage,
  onInsertBlankPage,
  onMergePdfClick
}: PageSidebarProps) {
  const editCounts = new Map<string, number>();
  for (const e of edits) {
    editCounts.set(e.pagePlanId, (editCounts.get(e.pagePlanId) ?? 0) + 1);
  }

  return (
    <aside className="sidebar" aria-label="Page organizer">
      <div className="panel-header">
        <span>Pages</span>
        <span style={{ fontFamily: 'var(--font-mono)' }}>{pagePlan.length}</span>
      </div>

      <div className="sidebar-list">
        {pagePlan.map((item, idx) => {
          const isActive = item.id === activePageId;
          const count = editCounts.get(item.id) ?? 0;
          const proxy = pdfProxies.get(item.sourceDocId);

          return (
            <div
              key={item.id}
              className={`page-card ${isActive ? 'active' : ''}`}
              onClick={() => onSelectPage(item.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectPage(item.id);
                }
              }}
            >
              <div className="page-thumb-frame">
                <PageThumb item={item} proxy={proxy} />
              </div>

              <div className="page-card-meta">
                <span className="page-card-number">
                  {String(idx + 1).padStart(2, '0')}
                  {item.isBlank ? ' · Blank' : ''}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
                  {item.rotationDelta !== 0 ? `${item.rotationDelta} deg ` : ''}
                  {count > 0 ? `${count} edit${count === 1 ? '' : 's'}` : ''}
                </span>
              </div>

              <div className="page-card-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="mini-btn"
                  disabled={idx === 0}
                  onClick={() => onMovePage(idx, -1)}
                  title="Move page up"
                  aria-label={`Move page ${idx + 1} up`}
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  disabled={idx === pagePlan.length - 1}
                  onClick={() => onMovePage(idx, 1)}
                  title="Move page down"
                  aria-label={`Move page ${idx + 1} down`}
                >
                  <ArrowDown size={12} />
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => onRotatePage(item.id)}
                  title="Rotate 90 degrees clockwise"
                  aria-label={`Rotate page ${idx + 1}`}
                >
                  <RotateCw size={12} />
                </button>
                <button
                  type="button"
                  className="mini-btn danger"
                  disabled={pagePlan.length <= 1}
                  onClick={() => onDeletePage(item.id)}
                  title="Delete page"
                  aria-label={`Delete page ${idx + 1}`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <button type="button" className="btn" onClick={onMergePdfClick} style={{ width: '100%' }}>
          <FilePlus2 size={13} />
          <span>Merge Local PDF</span>
        </button>
        <button type="button" className="btn" onClick={onInsertBlankPage} style={{ width: '100%' }}>
          <PlusSquare size={13} />
          <span>Insert Blank Page</span>
        </button>
      </div>
    </aside>
  );
}
