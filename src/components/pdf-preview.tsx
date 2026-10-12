import type { jsPDF } from "jspdf";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type PdfJs = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfJs> | null = null;

/**
 * pdf.js uses the very new Map.getOrInsert* methods, which most browsers do
 * not ship yet. Add them before pdf.js loads so previews render everywhere.
 */
function ensureMapHelpers() {
  const proto = Map.prototype as unknown as Record<string, unknown>;
  if (typeof proto["getOrInsert"] !== "function") {
    proto["getOrInsert"] = function (this: Map<unknown, unknown>, key: unknown, value: unknown) {
      if (!this.has(key)) this.set(key, value);
      return this.get(key);
    };
  }
  if (typeof proto["getOrInsertComputed"] !== "function") {
    proto["getOrInsertComputed"] = function (
      this: Map<unknown, unknown>,
      key: unknown,
      compute: (key: unknown) => unknown,
    ) {
      if (!this.has(key)) this.set(key, compute(key));
      return this.get(key);
    };
  }
}

/**
 * Reusing the exact bytes of an already generated document keeps repeat
 * previews instant: the built PDF and its parsed form stay in a small LRU so
 * switching back to a document skips both the jsPDF build and the pdf.js parse.
 */
type CachedPdf = { objectUrl: string; file: PDFDocumentProxy };
const PDF_CACHE_LIMIT = 10;
const pdfCache = new Map<string, CachedPdf>();

function pdfCachePut(key: string, entry: CachedPdf) {
  pdfCache.delete(key);
  pdfCache.set(key, entry);
  while (pdfCache.size > PDF_CACHE_LIMIT) {
    const oldest = pdfCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    const evicted = pdfCache.get(oldest);
    pdfCache.delete(oldest);
    if (evicted) {
      URL.revokeObjectURL(evicted.objectUrl);
      void evicted.file.cleanup();
    }
  }
}

/** Stable content hash for cache keys — cheap and collision-safe enough here. */
export function hashPdfCacheKey(...parts: unknown[]): string {
  const text = JSON.stringify(parts);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${hash.toString(36)}${text.length.toString(36)}`;
}

/** Loads pdf.js once per session and keeps it warm for later previews. */
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      ensureMapHelpers();
      const [pdfjs, worker] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
      ]);
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

/**
 * Renders the exact generated PDF inside the app by drawing its pages with
 * pdf.js. Embedding the file directly is blocked by Chrome inside the preview
 * window, so pages are painted onto canvases instead.
 */
export function PdfPreview({
  build,
  height = 620,
  deps = [],
  cacheKey,
  fitMode = "contain",
}: {
  build: () => jsPDF;
  height?: number;
  deps?: unknown[];
  /** Content-derived identity for the built PDF — enables reuse across opens. */
  cacheKey?: string;
  /** Contain shows the complete page; width is for naturally tall inline previews. */
  fitMode?: "contain" | "width";
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const pdfFile = useRef<PDFDocumentProxy | null>(null);
  const renderTask = useRef<RenderTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [documentVersion, setDocumentVersion] = useState(0);

  // Start fetching pdf.js as soon as any preview mounts.
  useEffect(() => {
    void loadPdfjs();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    let reusedCache = false;
    setReady(false);
    setError(null);

    // Let the dialog paint before the heavy document build runs.
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const cached = cacheKey ? pdfCache.get(cacheKey) : undefined;
          if (cached) {
            pdfCache.delete(cacheKey!);
            pdfCache.set(cacheKey!, cached);
            objectUrl = cached.objectUrl;
            reusedCache = true;
            if (!cancelled) {
              setFileUrl(objectUrl);
              pdfFile.current = cached.file;
              setPageCount(cached.file.numPages);
              setCurrentPage((page) => Math.min(page, cached.file.numPages));
              setDocumentVersion((version) => version + 1);
            }
            return;
          }
          const pdfjsReady = loadPdfjs();

          const doc = build();
          const buffer = doc.output("arraybuffer") as ArrayBuffer;
          objectUrl = URL.createObjectURL(new Blob([buffer], { type: "application/pdf" }));
          if (!cancelled) setFileUrl(objectUrl);

          const pdfjs = await pdfjsReady;
          if (cancelled) return;

          const file = await pdfjs.getDocument({
            data: new Uint8Array(buffer.slice(0)),
          }).promise;
          if (cancelled) return;
          if (cacheKey) {
            pdfCachePut(cacheKey, { objectUrl, file });
            reusedCache = true;
          }
          pdfFile.current = file;
          setPageCount(file.numPages);
          setCurrentPage((page) => Math.min(page, file.numPages));
          setDocumentVersion((version) => version + 1);
        } catch (err) {
          if (!cancelled)
            setError(err instanceof Error ? err.message : "Could not render the document preview.");
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      renderTask.current?.cancel();
      renderTask.current = null;
      // Cached documents stay alive in the LRU — only fresh ones are torn down.
      if (!reusedCache) {
        void pdfFile.current?.cleanup();
        pdfFile.current = null;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    const node = holder.current;
    const target = canvas.current;
    const file = pdfFile.current;
    if (!node || !target || !file || documentVersion === 0) return;

    let cancelled = false;
    let sequence = 0;
    let lastSize = "";
    const renderSelectedPage = async () => {
      // The frame settles twice on mount (layout + observer); only repaint
      // when the available space actually changes.
      const width = Math.max(320, node.clientWidth);
      const height = node.clientHeight;
      const size = `${width}x${height}`;
      if (size === lastSize) return;
      lastSize = size;
      const activeSequence = ++sequence;
      renderTask.current?.cancel();
      renderTask.current = null;
      setReady(false);
      try {
        const page = await file.getPage(currentPage);
        if (cancelled || activeSequence !== sequence) return;
        const base = page.getViewport({ scale: 1 });
        const widthFit = width / base.width;
        const heightFit = height > 0 ? height / base.height : widthFit;
        const fit = fitMode === "contain" ? Math.min(widthFit, heightFit) : widthFit;
        const dpr = window.devicePixelRatio || 1;
        // 1.2 keeps text crisp without paying for a 1.5x oversample on every
        // repaint — the preview opens noticeably faster.
        const viewport = page.getViewport({ scale: fit * dpr * 1.2 });
        target.width = Math.floor(viewport.width);
        target.height = Math.floor(viewport.height);
        target.style.width = `${Math.floor(base.width * fit)}px`;
        target.style.height = `${Math.floor(base.height * fit)}px`;
        const context = target.getContext("2d");
        if (!context) return;
        const task = page.render({ canvas: target, canvasContext: context, viewport });
        renderTask.current = task;
        await task.promise;
        if (!cancelled && activeSequence === sequence) setReady(true);
      } catch (err) {
        if (!cancelled && !(err instanceof Error && err.name === "RenderingCancelledException")) {
          setError(err instanceof Error ? err.message : "Could not render the document preview.");
        }
      }
    };

    void renderSelectedPage();
    const observer = new ResizeObserver(() => void renderSelectedPage());
    observer.observe(node);
    return () => {
      cancelled = true;
      sequence += 1;
      observer.disconnect();
      renderTask.current?.cancel();
      renderTask.current = null;
    };
  }, [currentPage, documentVersion, fitMode]);

  if (error) return <p className="ro-empty">{error}</p>;

  return (
    <div className="doc-preview-shell">
      {pageCount > 1 && (
        <nav className="doc-preview-pagination" aria-label="Document pages">
          <span>Page</span>
          <div className="doc-preview-page-buttons">
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => (
              <Button
                key={page}
                type="button"
                size="icon"
                variant={currentPage === page ? "default" : "outline"}
                className="doc-preview-page-button"
                aria-label={`Show page ${page}`}
                aria-current={currentPage === page ? "page" : undefined}
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </Button>
            ))}
          </div>
          <strong>{currentPage} / {pageCount}</strong>
        </nav>
      )}
      <div
        className="doc-preview-frame"
        style={{ height: `min(${height}px, calc(100vh - 180px))`, minHeight: 360 }}
      >
        <div ref={holder} className="doc-preview-pages">
          <canvas ref={canvas} className="doc-preview-canvas" />
        </div>
        {!ready && <p className="doc-preview-loading">Preparing document…</p>}
      </div>
      {fileUrl && (
        <p style={{ marginTop: 8, fontSize: 12 }}>
          <a className="text-link" href={fileUrl} target="_blank" rel="noreferrer">
            Open in a new tab
          </a>
        </p>
      )}
    </div>
  );
}
