import baseAutoTable, { type UserOptions } from "jspdf-autotable";
import type { jsPDF } from "jspdf";

export * from "jspdf-autotable";

const NUMBER_RE = /^[-–]?\s*(₹|Rs\.?)?\s*[-–]?\s*[\d,]+(\.\d+)?\s*%?$/;

/**
 * autoTable wrapper: numbers (amounts, counts, RO / invoice numbers) never wrap.
 * If a number is too long for its cell it is kept on one line and its font
 * shrinks until it fits.
 */
export default function autoTable(doc: jsPDF, options: UserOptions) {
  const userWillDraw = options.willDrawCell;
  return baseAutoTable(doc, {
    ...options,
    willDrawCell: (data) => {
      const cell = data.cell;
      const lines = Array.isArray(cell.text) ? cell.text : [String(cell.text ?? "")];
      const joined = lines.join("").trim();
      if (joined && (NUMBER_RE.test(joined) || (lines.length > 1 && NUMBER_RE.test(lines.join("").replace(/\s+/g, ""))))) {
        const text = lines.length > 1 ? lines.join("").replace(/\s+(?=\d)/g, "") : joined;
        const padding = cell.padding("horizontal");
        const available = cell.width - padding;
        let size = cell.styles.fontSize;
        doc.setFontSize(size);
        while (size > 4 && doc.getTextWidth(text) > available) {
          size -= 0.25;
          doc.setFontSize(size);
        }
        cell.styles.fontSize = size;
        cell.text = [text];
      }
      return userWillDraw?.(data);
    },
  });
}
