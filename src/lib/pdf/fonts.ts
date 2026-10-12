// Tahoma-style fonts for jsPDF output. Tahoma itself is a Microsoft font we
// cannot embed, so the PDFs use DejaVu Sans (the standard open Tahoma
// substitute), subsetted to the characters the documents use, registered
// under the family name "Tahoma". On-screen previews use real Tahoma via CSS.
import { FONT_FILES } from "@/assets/fonts/font-data";

export const PDF_FONT = "Tahoma";

type FontPdf = {
  addFileToVFS: (name: string, data: string) => void;
  addFont: (postScriptName: string, fontName: string, fontStyle: string) => void;
};

const FONTS: Array<[file: string, style: string]> = [
  ["Tahoma-Regular.ttf", "normal"],
  ["Tahoma-Bold.ttf", "bold"],
  ["Tahoma-Italic.ttf", "italic"],
  ["Tahoma-BoldItalic.ttf", "bolditalic"],
];

const registered = new WeakSet<object>();

export function registerPdfFonts(doc: FontPdf) {
  if (registered.has(doc)) return;
  registered.add(doc);
  for (const [file, style] of FONTS) {
    doc.addFileToVFS(file, FONT_FILES[file] ?? "");
    doc.addFont(file, PDF_FONT, style);
  }
}
