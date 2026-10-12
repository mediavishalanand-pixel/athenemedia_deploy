// Browser-only helpers for vendor bill uploads. Import dynamically.
import * as pdfjsLib from "pdfjs-dist";
import "@/lib/pdf/pdf-preview";
import { readBillImageText } from "@/lib/bill-ocr.functions";

export const BILL_BUCKET = "vendor-bills";
export const BILL_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

const fileToDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

async function ocr(dataUrl: string) {
  try {
    const { text } = await readBillImageText({ data: { dataUrl } });
    return text;
  } catch (error) {
    console.error(error);
    return "";
  }
}

/** Extracts searchable text from a PDF or image bill. */
export async function extractBillText(file: File): Promise<string> {
  if (file.type.startsWith("image/")) return ocr(await fileToDataUrl(file));
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const parts: string[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, 20); i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      parts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    const text = parts.join("\n").replace(/[ \t]+/g, " ").trim();
    if (text.length >= 20) return text;
    // Scanned PDF: read each page (up to 10) as an image.
    const scanned: string[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, 10); i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
      scanned.push(await ocr(canvas.toDataURL("image/jpeg", 0.85)));
    }
    return scanned.join("\n").trim();
  } finally {
    void doc.cleanup();
  }
}

/** Renders every page of a PDF bill to images for in-app viewing. */
export async function renderPdfPages(blob: Blob, scale = 1.5): Promise<string[]> {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const out: string[] = [];
  try {
    for (let i = 1; i <= Math.min(doc.numPages, 30); i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
      out.push(canvas.toDataURL("image/jpeg", 0.9));
    }
  } finally {
    void doc.cleanup();
  }
  return out;
}
