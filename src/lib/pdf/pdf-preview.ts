import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Chrome builds that lack the upcoming Map methods break pdf.js caching.
type MapWithExtras<K, V> = Map<K, V> & { getOrInsertComputed?: (key: K, cb: (key: K) => V) => V; getOrInsert?: (key: K, value: V) => V };
const mapProto = Map.prototype as MapWithExtras<unknown, unknown>;
if (!mapProto.getOrInsertComputed) {
  mapProto.getOrInsertComputed = function (key, cb) {
    if (!this.has(key)) this.set(key, cb(key));
    return this.get(key)!;
  };
}
if (!mapProto.getOrInsert) {
  mapProto.getOrInsert = function (key, value) {
    if (!this.has(key)) this.set(key, value);
    return this.get(key)!;
  };
}

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// pdf.js v6 uses Math.sumPrecise when reading fonts; older browsers lack it.
if (typeof (Math as unknown as { sumPrecise?: unknown }).sumPrecise !== "function") {
  (Math as unknown as { sumPrecise: (values: Iterable<number>) => number }).sumPrecise = (values) => {
    let total = 0;
    for (const value of values) total += value;
    return total;
  };
}

type LoadedPdf = { bytes: Uint8Array; task: pdfjsLib.PDFDocumentLoadingTask };

// Recently shown documents stay loaded so switching media tabs back is instant.
const loaded: LoadedPdf[] = [];
const MAX_LOADED = 16;
const canvasRenderSequence = new WeakMap<HTMLCanvasElement, number>();
const activeCanvasRenders = new WeakMap<HTMLCanvasElement, pdfjsLib.RenderTask>();

// One long-lived pdf.js worker; otherwise every preview starts a fresh worker.
let sharedWorker: pdfjsLib.PDFWorker | null = null;
function previewWorker() {
  if (!sharedWorker || sharedWorker.destroyed) sharedWorker = new pdfjsLib.PDFWorker();
  return sharedWorker;
}

async function loadPdf(bytes: Uint8Array) {
  const hit = loaded.find((entry) => entry.bytes === bytes);
  if (hit) return hit.task.promise;
  // pdf.js takes ownership of the buffer it is given, so hand it a copy and
  // keep the original intact for the preview cache.
  const task = pdfjsLib.getDocument({ data: bytes.slice(), worker: previewWorker(), useSystemFonts: false, disableAutoFetch: true, disableStream: true });
  loaded.unshift({ bytes, task });
  while (loaded.length > MAX_LOADED) loaded.pop()?.task.destroy();
  return task.promise;
}

/** Renders one page of a generated PDF onto a canvas, showing the exact print output. */
export async function renderPdfPage(bytes: Uint8Array, pageNumber: number, canvas: HTMLCanvasElement) {
  const sequence = (canvasRenderSequence.get(canvas) ?? 0) + 1;
  canvasRenderSequence.set(canvas, sequence);
  activeCanvasRenders.get(canvas)?.cancel();
  const pdf = await loadPdf(bytes);
  if (canvasRenderSequence.get(canvas) !== sequence) return;
  const page = await pdf.getPage(Math.min(Math.max(1, pageNumber), pdf.numPages));
  if (canvasRenderSequence.get(canvas) !== sequence) return;
  const cssWidth = canvas.clientWidth || canvas.parentElement?.clientWidth || 800;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const task = page.render({ canvas, canvasContext: ctx, viewport });
  activeCanvasRenders.set(canvas, task);
  try {
    await task.promise;
  } finally {
    if (activeCanvasRenders.get(canvas) === task) activeCanvasRenders.delete(canvas);
  }
}

export async function pdfPageCount(bytes: Uint8Array) {
  const pdf = await loadPdf(bytes);
  return pdf.numPages;
}
