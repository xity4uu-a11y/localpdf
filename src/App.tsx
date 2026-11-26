import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InspectorPanel } from './components/InspectorPanel';
import { PageSidebar } from './components/PageSidebar';
import { PdfWorkspace } from './components/PdfWorkspace';
import { SignatureModal, type SignatureResult } from './components/SignatureModal';
import { Toolbar } from './components/Toolbar';
import { applyEditsAndExport } from './lib/pdfEditor';
import { loadPdfProxy, type LoadedPdfProxy } from './lib/pdfInspector';
import { collectPluginFontAliases } from './lib/presets';
import { bytesToDataUrl, createMinimalSampleLogoPng, createSamplePdf } from './lib/samplePdf';
import type {
  DocumentEdit,
  EditorSnapshot,
  ExtractedTextLine,
  PagePlanItem,
  PluginManifest,
  PluginPresetAction,
  RotationDelta,
  SourceDocument,
  StandardFontFamily,
  ToolMode
} from './lib/types';

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const EMPTY_SNAPSHOT: EditorSnapshot = { pagePlan: [], edits: [] };

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [sources, setSources] = useState<SourceDocument[]>([]);
  const [pdfProxies, setPdfProxies] = useState<Map<string, LoadedPdfProxy>>(new Map());
  const [documentName, setDocumentName] = useState('');

  // Undo / redo history
  const [past, setPast] = useState<EditorSnapshot[]>([]);
  const [present, setPresent] = useState<EditorSnapshot>(EMPTY_SNAPSHOT);
  const [future, setFuture] = useState<EditorSnapshot[]>([]);

  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [selectedEditId, setSelectedEditId] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolMode>('edit-text');
  const [zoom, setZoom] = useState(1.15);
  const [isExporting, setIsExporting] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [textDefaults, setTextDefaults] = useState<{
    fontFamily: StandardFontFamily;
    bold: boolean;
    italic: boolean;
    fontSizePt: number;
    inkHex: string;
    backgroundHex: string;
    paddingPt: number;
  }>({
    fontFamily: 'helvetica',
    bold: false,
    italic: false,
    fontSizePt: 11,
    inkHex: '#1d1d1f',
    backgroundHex: '#ffffff',
    paddingPt: 1
  });

  const openFileInputRef = useRef<HTMLInputElement | null>(null);
  const mergeFileInputRef = useRef<HTMLInputElement | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const replacingImageEditIdRef = useRef<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const fontAliases = useMemo(() => collectPluginFontAliases(), []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  const commitSnapshot = useCallback(
    (updater: (prev: EditorSnapshot) => EditorSnapshot) => {
      setPresent((prev) => {
        const next = updater(prev);
        setPast((h) => [...h.slice(-49), prev]);
        setFuture([]);
        return next;
      });
    },
    []
  );

  const handleUndo = useCallback(() => {
    setPast((prevPast) => {
      if (prevPast.length === 0) return prevPast;
      const previous = prevPast[prevPast.length - 1];
      setFuture((f) => [present, ...f]);
      setPresent(previous);
      if (previous.pagePlan.length > 0 && !previous.pagePlan.some((p) => p.id === activePageId)) {
        setActivePageId(previous.pagePlan[0].id);
      }
      return prevPast.slice(0, -1);
    });
  }, [present, activePageId]);

  const handleRedo = useCallback(() => {
    setFuture((prevFuture) => {
      if (prevFuture.length === 0) return prevFuture;
      const next = prevFuture[0];
      setPast((h) => [...h, present]);
      setPresent(next);
      return prevFuture.slice(1);
    });
  }, [present]);

  const loadNewPdfBytes = useCallback(
    async (bytes: Uint8Array, name: string) => {
      try {
        const proxy = await loadPdfProxy(bytes);
        const srcId = makeId('src');
        const newSrc: SourceDocument = {
          id: srcId,
          name,
          bytes: bytes.slice(),
          pageCount: proxy.numPages
        };
        const pages: PagePlanItem[] = Array.from({ length: proxy.numPages }, (_, i) => ({
          id: makeId('page'),
          sourceDocId: srcId,
          sourcePageIndex: i,
          rotationDelta: 0
        }));

        setSources([newSrc]);
        setPdfProxies(new Map([[srcId, proxy]]));
        setDocumentName(name);
        setPast([]);
        setFuture([]);
        setPresent({ pagePlan: pages, edits: [] });
        setActivePageId(pages[0]?.id ?? null);
        setSelectedEditId(null);
        setTool('edit-text');
        showToast(`Loaded "${name}" (${proxy.numPages} page${proxy.numPages === 1 ? '' : 's'}) locally`);
      } catch (err) {
        showToast(
          `Could not open PDF: ${err instanceof Error ? err.message : 'invalid or encrypted file'}`
        );
      }
    },
    [showToast]
  );

  const mergePdfBytes = useCallback(
    async (bytes: Uint8Array, name: string) => {
      try {
        const proxy = await loadPdfProxy(bytes);
        const srcId = makeId('src');
        const mergedSrc: SourceDocument = {
          id: srcId,
          name,
          bytes: bytes.slice(),
          pageCount: proxy.numPages
        };
        const appendedPages: PagePlanItem[] = Array.from({ length: proxy.numPages }, (_, i) => ({
          id: makeId('page'),
          sourceDocId: srcId,
          sourcePageIndex: i,
          rotationDelta: 0
        }));

        setSources((prev) => [...prev, mergedSrc]);
        setPdfProxies((prev) => {
          const next = new Map(prev);
          next.set(srcId, proxy);
          return next;
        });

        commitSnapshot((prev) => ({
          ...prev,
          pagePlan: [...prev.pagePlan, ...appendedPages]
        }));
        if (!activePageId && appendedPages[0]) {
          setActivePageId(appendedPages[0].id);
        }
        showToast(`Appended ${proxy.numPages} page${proxy.numPages === 1 ? '' : 's'} from "${name}"`);
      } catch (err) {
        showToast(`Merge failed: ${err instanceof Error ? err.message : 'invalid PDF'}`);
      }
    },
    [commitSnapshot, activePageId, showToast]
  );

  const handleOpenSample = useCallback(async () => {
    const bytes = await createSamplePdf();
    await loadNewPdfBytes(bytes, 'northwind-invoice-resume-sample.pdf');
  }, [loadNewPdfBytes]);

  const handleDropPdfFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        showToast('Please select a .pdf file.');
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      await loadNewPdfBytes(bytes, file.name);
    },
    [loadNewPdfBytes, showToast]
  );

  const handleUpdateEdit = useCallback(
    (editId: string, updater: (edit: DocumentEdit) => DocumentEdit, recordHistory = true) => {
      if (recordHistory) {
        commitSnapshot((prev) => ({
          ...prev,
          edits: prev.edits.map((e) => (e.id === editId ? updater(e) : e))
        }));
      } else {
        setPresent((prev) => ({
          ...prev,
          edits: prev.edits.map((e) => (e.id === editId ? updater(e) : e))
        }));
      }
    },
    [commitSnapshot]
  );

  const handleDeleteEdit = useCallback(
    (editId: string) => {
      commitSnapshot((prev) => ({
        ...prev,
        edits: prev.edits.filter((e) => e.id !== editId)
      }));
      setSelectedEditId((cur) => (cur === editId ? null : cur));
    },
    [commitSnapshot]
  );

  const handleClickExtractedLine = useCallback(
    (line: ExtractedTextLine) => {
      if (!activePageId) return;
      const existing = present.edits.find(
        (e) => e.kind === 'replace-text' && e.pagePlanId === activePageId && e.sourceLineId === line.id
      );
      if (existing) {
        setSelectedEditId(existing.id);
        return;
      }

      const newEdit: DocumentEdit = {
        id: makeId('rep'),
        kind: 'replace-text',
        pagePlanId: activePageId,
        sourceLineId: line.id,
        originalText: line.text,
        text: line.text,
        patchRect: {
          x: line.pdfX,
          y: line.pdfY,
          width: line.pdfWidth,
          height: line.pdfHeight
        },
        pdfX: line.pdfX,
        baselineY: line.baselineY,
        fontFamily: line.fontMatch.family,
        bold: line.fontMatch.bold,
        italic: line.fontMatch.italic,
        fontSizePt: line.fontSizePt,
        colorHex: line.inkHex,
        backgroundHex: line.bgHex,
        paddingPt: textDefaults.paddingPt,
        coverOriginal: true,
        detectedFontLabel: `${line.fontMatch.displayLabel} · ${line.fontSizePt}pt`
      };

      commitSnapshot((prev) => ({
        ...prev,
        edits: [...prev.edits, newEdit]
      }));
      setSelectedEditId(newEdit.id);
    },
    [activePageId, present.edits, textDefaults.paddingPt, commitSnapshot]
  );

  const handleCanvasAddText = useCallback(
    (pdfX: number, pdfY: number) => {
      if (!activePageId) return;
      const edit: DocumentEdit = {
        id: makeId('txt'),
        kind: 'add-text',
        pagePlanId: activePageId,
        text: 'Edit text here',
        pdfX,
        pdfY,
        fontFamily: textDefaults.fontFamily,
        bold: textDefaults.bold,
        italic: textDefaults.italic,
        fontSizePt: textDefaults.fontSizePt,
        colorHex: textDefaults.inkHex,
        opacity: 1
      };
      commitSnapshot((prev) => ({
        ...prev,
        edits: [...prev.edits, edit]
      }));
      setSelectedEditId(edit.id);
      setTool('select');
    },
    [activePageId, textDefaults, commitSnapshot]
  );

  const handleCanvasAddWhiteout = useCallback(
    (pdfX: number, pdfY: number, pdfWidth: number, pdfHeight: number) => {
      if (!activePageId) return;
      const edit: DocumentEdit = {
        id: makeId('box'),
        kind: 'shape',
        pagePlanId: activePageId,
        shapeType: 'whiteout',
        pdfX,
        pdfY,
        pdfWidth,
        pdfHeight,
        fillHex: textDefaults.backgroundHex,
        strokeHex: '#1d1d1f',
        strokeWidthPt: 0,
        opacity: 1
      };
      commitSnapshot((prev) => ({
        ...prev,
        edits: [...prev.edits, edit]
      }));
      setSelectedEditId(edit.id);
      setTool('select');
    },
    [activePageId, textDefaults.backgroundHex, commitSnapshot]
  );

  const handleImageFileSelected = useCallback(
    async (file: File) => {
      if (!activePageId) return;
      const mimeType: 'image/png' | 'image/jpeg' =
        file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name) ? 'image/jpeg' : 'image/png';
      const bytes = new Uint8Array(await file.arrayBuffer());
      const previewDataUrl = bytesToDataUrl(bytes, mimeType);

      // Measure natural dimensions cleanly
      const dims = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth || 120, h: img.naturalHeight || 60 });
        img.onerror = () => resolve({ w: 120, h: 60 });
        img.src = previewDataUrl;
      });
      const aspectRatio = dims.w / Math.max(1, dims.h);

      const replacingId = replacingImageEditIdRef.current;
      replacingImageEditIdRef.current = null;

      if (replacingId) {
        commitSnapshot((prev) => ({
          ...prev,
          edits: prev.edits.map((e) =>
            e.id === replacingId && e.kind === 'image'
              ? {
                  ...e,
                  name: file.name,
                  bytes,
                  mimeType,
                  previewDataUrl,
                  aspectRatio
                }
              : e
          )
        }));
        showToast(`Replaced image with "${file.name}"`);
        return;
      }

      const defaultW = Math.min(160, Math.max(48, dims.w * 0.5));
      const defaultH = defaultW / aspectRatio;
      const edit: DocumentEdit = {
        id: makeId('img'),
        kind: 'image',
        pagePlanId: activePageId,
        name: file.name,
        bytes,
        mimeType,
        previewDataUrl,
        pdfX: 48,
        pdfY: 700,
        pdfWidth: Number(defaultW.toFixed(1)),
        pdfHeight: Number(defaultH.toFixed(1)),
        aspectRatio,
        lockAspectRatio: true,
        coverUnderlying: true,
        coverColorHex: '#ffffff',
        opacity: 1
      };
      commitSnapshot((prev) => ({
        ...prev,
        edits: [...prev.edits, edit]
      }));
      setSelectedEditId(edit.id);
      setTool('select');
      showToast(`Placed "${file.name}" — drag corners to align over existing logo`);
    },
    [activePageId, commitSnapshot, showToast]
  );

  const handleSwapWithDemoLogo = useCallback(
    (editId: string) => {
      const bytes = createMinimalSampleLogoPng();
      const previewDataUrl = bytesToDataUrl(bytes, 'image/png');
      commitSnapshot((prev) => ({
        ...prev,
        edits: prev.edits.map((e) =>
          e.id === editId && e.kind === 'image'
            ? {
                ...e,
                name: 'studio-emblem-demo.png',
                bytes,
                mimeType: 'image/png',
                previewDataUrl,
                aspectRatio: 1
              }
            : e
        )
      }));
      showToast('Swapped with built-in demo studio emblem');
    },
    [commitSnapshot, showToast]
  );

  const handleApplySignature = useCallback(
    (sig: SignatureResult) => {
      if (!activePageId) return;
      const edit: DocumentEdit = {
        id: makeId('sig'),
        kind: 'signature',
        pagePlanId: activePageId,
        mode: sig.mode,
        pngBytes: sig.pngBytes,
        previewDataUrl: sig.previewDataUrl,
        typedText: sig.typedText,
        fontFamily: sig.fontFamily,
        fontSizePt: 22,
        inkHex: sig.inkHex,
        pdfX: 54,
        pdfY: 120,
        pdfWidth: 180,
        pdfHeight: 54,
        showBaseline: sig.showBaseline
      };
      commitSnapshot((prev) => ({
        ...prev,
        edits: [...prev.edits, edit]
      }));
      setSelectedEditId(edit.id);
      setTool('select');
      showToast('Signature placed — drag or resize to fit the signature line');
    },
    [activePageId, commitSnapshot, showToast]
  );

  const handleMovePage = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (target < 0 || target >= present.pagePlan.length) return;
      commitSnapshot((prev) => {
        const nextPlan = [...prev.pagePlan];
        const [moved] = nextPlan.splice(index, 1);
        nextPlan.splice(target, 0, moved);
        return { ...prev, pagePlan: nextPlan };
      });
    },
    [present.pagePlan.length, commitSnapshot]
  );

  const handleRotatePage = useCallback(
    (pageId: string) => {
      commitSnapshot((prev) => ({
        ...prev,
        pagePlan: prev.pagePlan.map((p) =>
          p.id === pageId
            ? { ...p, rotationDelta: (((p.rotationDelta + 90) % 360) as RotationDelta) }
            : p
        )
      }));
    },
    [commitSnapshot]
  );

  const handleDeletePage = useCallback(
    (pageId: string) => {
      if (present.pagePlan.length <= 1) return;
      commitSnapshot((prev) => {
        const remaining = prev.pagePlan.filter((p) => p.id !== pageId);
        return {
          pagePlan: remaining,
          edits: prev.edits.filter((e) => e.pagePlanId !== pageId)
        };
      });
      if (activePageId === pageId) {
        const nextPage = present.pagePlan.find((p) => p.id !== pageId);
        setActivePageId(nextPage?.id ?? null);
      }
      setSelectedEditId(null);
    },
    [present.pagePlan, activePageId, commitSnapshot]
  );

  const handleInsertBlankPage = useCallback(() => {
    const newPage: PagePlanItem = {
      id: makeId('blank'),
      sourceDocId: 'blank',
      sourcePageIndex: 0,
      rotationDelta: 0,
      isBlank: true,
      blankWidthPt: 612,
      blankHeightPt: 792
    };
    commitSnapshot((prev) => ({
      ...prev,
      pagePlan: [...prev.pagePlan, newPage]
    }));
    setActivePageId(newPage.id);
    showToast('Inserted blank Letter page (612 x 792 pt)');
  }, [commitSnapshot, showToast]);

  const handleApplyPluginDefaults = useCallback(
    (plugin: PluginManifest) => {
      setTextDefaults({
        fontFamily: plugin.defaults.fontFamily,
        bold: plugin.defaults.bold,
        italic: plugin.defaults.italic,
        fontSizePt: plugin.defaults.fontSizePt,
        inkHex: plugin.defaults.inkHex,
        backgroundHex: plugin.defaults.backgroundHex,
        paddingPt: plugin.defaults.paddingPt ?? 2
      });
      showToast(`Applied typography defaults from "${plugin.name}"`);
    },
    [showToast]
  );

  const handleTriggerPresetAction = useCallback(
    (plugin: PluginManifest, action: PluginPresetAction) => {
      if (action.kind === 'merge-plan') {
        mergeFileInputRef.current?.click();
        return;
      }
      if (!activePageId) return;

      if (action.kind === 'add-text') {
        const edit: DocumentEdit = {
          id: makeId('preset-txt'),
          kind: 'add-text',
          pagePlanId: activePageId,
          text: action.text ?? action.label,
          pdfX: action.offsetXPt ?? 54,
          pdfY: action.offsetYPt ?? 680,
          fontFamily: action.fontFamily ?? plugin.defaults.fontFamily,
          bold: action.bold ?? plugin.defaults.bold,
          italic: action.italic ?? plugin.defaults.italic,
          fontSizePt: action.fontSizePt ?? plugin.defaults.fontSizePt,
          colorHex: action.inkHex ?? plugin.defaults.inkHex,
          backgroundHex: action.backgroundHex,
          opacity: 1
        };
        commitSnapshot((prev) => ({ ...prev, edits: [...prev.edits, edit] }));
        setSelectedEditId(edit.id);
        showToast(`Added "${action.label}"`);
        return;
      }

      if (action.kind === 'whiteout') {
        const edit: DocumentEdit = {
          id: makeId('preset-box'),
          kind: 'shape',
          pagePlanId: activePageId,
          shapeType: 'whiteout',
          pdfX: action.offsetXPt ?? 54,
          pdfY: action.offsetYPt ?? 680,
          pdfWidth: action.widthPt ?? 160,
          pdfHeight: action.heightPt ?? 32,
          fillHex: action.backgroundHex ?? plugin.defaults.backgroundHex,
          strokeHex: '#1d1d1f',
          strokeWidthPt: 0,
          opacity: 1
        };
        commitSnapshot((prev) => ({ ...prev, edits: [...prev.edits, edit] }));
        setSelectedEditId(edit.id);
        showToast(`Placed "${action.label}"`);
        return;
      }

      if (action.kind === 'logo-slot') {
        const demoPng = createMinimalSampleLogoPng();
        const edit: DocumentEdit = {
          id: makeId('preset-logo'),
          kind: 'image',
          pagePlanId: activePageId,
          name: 'studio-emblem-demo.png',
          bytes: demoPng,
          mimeType: 'image/png',
          previewDataUrl: bytesToDataUrl(demoPng, 'image/png'),
          pdfX: action.offsetXPt ?? 48,
          pdfY: action.offsetYPt ?? 712,
          pdfWidth: 42,
          pdfHeight: 42,
          aspectRatio: 1,
          lockAspectRatio: true,
          coverUnderlying: true,
          coverColorHex: action.backgroundHex ?? '#ffffff',
          opacity: 1
        };
        commitSnapshot((prev) => ({ ...prev, edits: [...prev.edits, edit] }));
        setSelectedEditId(edit.id);
        showToast('Placed cover-enabled logo slot — click "Swap File" in Inspector to drop your logo');
        return;
      }

      if (action.kind === 'signature-slot') {
        const edit: DocumentEdit = {
          id: makeId('preset-sig'),
          kind: 'signature',
          pagePlanId: activePageId,
          mode: 'typed',
          typedText: action.text ?? 'Jordan Ellis',
          fontFamily: action.fontFamily ?? 'times',
          fontSizePt: action.fontSizePt ?? 18,
          inkHex: action.inkHex ?? '#1a365d',
          pdfX: action.offsetXPt ?? 54,
          pdfY: action.offsetYPt ?? 118,
          pdfWidth: action.widthPt ?? 170,
          pdfHeight: action.heightPt ?? 48,
          showBaseline: true
        };
        commitSnapshot((prev) => ({ ...prev, edits: [...prev.edits, edit] }));
        setSelectedEditId(edit.id);
        showToast(`Placed "${action.label}"`);
      }
    },
    [activePageId, commitSnapshot, showToast]
  );

  const handleDownloadPdf = useCallback(async () => {
    if (present.pagePlan.length === 0) return;
    setIsExporting(true);
    try {
      const outputBytes = await applyEditsAndExport(sources, present.pagePlan, present.edits);
      const copyBuffer = new Uint8Array(outputBytes.byteLength);
      copyBuffer.set(outputBytes);
      const blob = new Blob([copyBuffer.buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const baseName = (documentName || 'document.pdf').replace(/\.pdf$/i, '');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}-edited.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Downloaded "${baseName}-edited.pdf" — 0 bytes uploaded`);
    } catch (err) {
      showToast(`Export error: ${err instanceof Error ? err.message : 'failed to save PDF'}`);
    } finally {
      setIsExporting(false);
    }
  }, [sources, present.pagePlan, present.edits, documentName, showToast]);

  // Global keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (!isTyping) {
          e.preventDefault();
          if (e.shiftKey) handleRedo();
          else handleUndo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        if (!isTyping) {
          e.preventDefault();
          handleRedo();
        }
        return;
      }

      if (isTyping) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedEditId) {
          e.preventDefault();
          handleDeleteEdit(selectedEditId);
        }
      } else if (e.key.toLowerCase() === 'v') {
        setTool('select');
      } else if (e.key.toLowerCase() === 't') {
        setTool('edit-text');
      } else if (e.key.toLowerCase() === 'a') {
        setTool('add-text');
      } else if (e.key.toLowerCase() === 'w') {
        setTool('whiteout');
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo, selectedEditId, handleDeleteEdit]);

  const hasDocument = present.pagePlan.length > 0;
  const activePageIndex = present.pagePlan.findIndex((p) => p.id === activePageId);
  const activePage = activePageIndex >= 0 ? present.pagePlan[activePageIndex] : null;
  const activeProxy = activePage ? pdfProxies.get(activePage.sourceDocId) : undefined;
  const activePageEdits = useMemo(
    () => (activePage ? present.edits.filter((e) => e.pagePlanId === activePage.id) : []),
    [activePage, present.edits]
  );
  const selectedEdit = useMemo(
    () => present.edits.find((e) => e.id === selectedEditId) ?? null,
    [present.edits, selectedEditId]
  );

  return (
    <div className="app-shell">
      <Toolbar
        hasDocument={hasDocument}
        documentName={documentName}
        tool={tool}
        onToolChange={setTool}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        zoom={zoom}
        onZoomChange={setZoom}
        onOpenPdfClick={() => openFileInputRef.current?.click()}
        onMergePdfClick={() => mergeFileInputRef.current?.click()}
        onOpenSample={handleOpenSample}
        onInsertImageClick={() => {
          replacingImageEditIdRef.current = null;
          imageFileInputRef.current?.click();
        }}
        onOpenSignature={() => setSignatureOpen(true)}
        onDownloadPdf={handleDownloadPdf}
        isExporting={isExporting}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
      />

      <div className="studio-body">
        <PageSidebar
          pagePlan={present.pagePlan}
          activePageId={activePageId}
          pdfProxies={pdfProxies}
          edits={present.edits}
          onSelectPage={(id) => {
            setActivePageId(id);
            setSelectedEditId(null);
          }}
          onMovePage={handleMovePage}
          onRotatePage={handleRotatePage}
          onDeletePage={handleDeletePage}
          onInsertBlankPage={handleInsertBlankPage}
          onMergePdfClick={() => mergeFileInputRef.current?.click()}
        />

        <PdfWorkspace
          activePage={activePage}
          activePageNumber={activePageIndex + 1}
          totalPages={present.pagePlan.length}
          pdfProxy={activeProxy}
          zoom={zoom}
          tool={tool}
          edits={present.edits}
          selectedEditId={selectedEditId}
          fontAliases={fontAliases}
          onSelectEdit={setSelectedEditId}
          onUpdateEdit={handleUpdateEdit}
          onClickExtractedLine={handleClickExtractedLine}
          onCanvasAddText={handleCanvasAddText}
          onCanvasAddWhiteout={handleCanvasAddWhiteout}
          onOpenPdfClick={() => openFileInputRef.current?.click()}
          onOpenSample={handleOpenSample}
          onDropPdfFile={handleDropPdfFile}
        />

        <InspectorPanel
          hasDocument={hasDocument}
          pageEdits={activePageEdits}
          selectedEdit={selectedEdit}
          onSelectEdit={setSelectedEditId}
          onUpdateEdit={(id, updater) => handleUpdateEdit(id, updater, true)}
          onDeleteEdit={handleDeleteEdit}
          onReplaceImageFile={(editId) => {
            replacingImageEditIdRef.current = editId;
            imageFileInputRef.current?.click();
          }}
          onSwapWithDemoLogo={handleSwapWithDemoLogo}
          onApplyPluginDefaults={handleApplyPluginDefaults}
          onTriggerPresetAction={handleTriggerPresetAction}
        />
      </div>

      <SignatureModal
        isOpen={signatureOpen}
        onClose={() => setSignatureOpen(false)}
        onApply={handleApplySignature}
      />

      {/* Hidden Local File Inputs */}
      <input
        ref={openFileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) await handleDropPdfFile(file);
        }}
      />

      <input
        ref={mergeFileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (!hasDocument) {
            await loadNewPdfBytes(bytes, file.name);
          } else {
            await mergePdfBytes(bytes, file.name);
          }
        }}
      />

      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/png,image/jpeg,.png,.jpg,.jpeg"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) await handleImageFileSelected(file);
        }}
      />

      {toast && (
        <div className="toast-banner" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}
