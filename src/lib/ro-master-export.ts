import template from "@/assets/ro-master-template.xlsm?url";
import {
  RO_MASTER_COLUMNS,
  RO_MASTER_FORMULA_COLUMNS,
  type RoMasterColumn,
  type RoMasterRecord,
  type RoMasterValue,
} from "@/lib/ro-master";

/**
 * Download of the RO master workbook: the uploaded .xlsm is used as the template
 * and only the data cells are rewritten, so fonts, fills, widths, number formats,
 * formulas and macros all stay exactly as they are in the original file.
 */

const SHEET_NAME = "RO";
/** Data rows start under the heading row. */
const FIRST_DATA_ROW = 2;

function columnLetter(index: number) {
  let value = index + 1;
  let letters = "";
  while (value > 0) {
    const rest = (value - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters;
}

function escapeXml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Excel serial date (1900 system, Excel's 1900 leap-year quirk included). */
function excelSerial(date: Date) {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((utc - Date.UTC(1899, 11, 30)) / 86400000);
}

type TemplateCell = { style: string; formula: string | null };

/** Reads the style and formula of every cell in the first data row of the template. */
function readTemplateRow(sheetXml: string): Map<string, TemplateCell> {
  const cells = new Map<string, TemplateCell>();
  const rowMatch = new RegExp(`<row[^>]*r="${FIRST_DATA_ROW}"[^>]*>([\\s\\S]*?)</row>`).exec(
    sheetXml,
  );
  if (!rowMatch) return cells;
  const cellPattern = /<c ([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g;
  let match: RegExpExecArray | null;
  while ((match = cellPattern.exec(rowMatch[1] ?? ""))) {
    const attributes = match[1] ?? "";
    const body = match[3] ?? "";
    const reference = /r="([A-Z]+)\d+"/.exec(attributes)?.[1];
    if (!reference) continue;
    const style = /s="(\d+)"/.exec(attributes)?.[1] ?? "";
    const formula = /<f[^>]*>([\s\S]*?)<\/f>/.exec(body)?.[1] ?? null;
    cells.set(reference, { style, formula });
  }
  return cells;
}

/** Shifts every row reference in a template formula onto the target row. */
function shiftFormula(formula: string, row: number) {
  return formula.replace(
    new RegExp(`(\\$?[A-Z]{1,3}\\$?)${FIRST_DATA_ROW}\\b`, "g"),
    (_all, prefix: string) => `${prefix}${row}`,
  );
}

function cellXml(reference: string, template: TemplateCell | undefined, value: RoMasterValue) {
  const style = template?.style ? ` s="${template.style}"` : "";
  const row = Number(/\d+/.exec(reference)?.[0] ?? FIRST_DATA_ROW);
  if (template?.formula) {
    return `<c r="${reference}"${style}><f>${escapeXml(shiftFormula(template.formula, row))}</f></c>`;
  }
  if (value === null || value === "") return `<c r="${reference}"${style}/>`;
  if (value instanceof Date) {
    return `<c r="${reference}"${style}><v>${excelSerial(value)}</v></c>`;
  }
  if (typeof value === "number") {
    return `<c r="${reference}"${style}><v>${value}</v></c>`;
  }
  return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function buildRowXml(
  record: RoMasterRecord,
  rowNumber: number,
  template: Map<string, TemplateCell>,
  redStyles?: Map<string, string>,
) {
  const cells = RO_MASTER_COLUMNS.map((column, index) => {
    const letter = columnLetter(index);
    const reference = `${letter}${rowNumber}`;
    const isFormula = RO_MASTER_FORMULA_COLUMNS.includes(column as RoMasterColumn);
    const base = template.get(letter);
    // Cancelled orders keep every other bit of formatting, but print in red.
    const cell =
      base && redStyles
        ? { ...base, style: redStyles.get(base.style) ?? base.style }
        : base;
    return cellXml(reference, cell, isFormula ? null : record[column]);
  });
  return `<row r="${rowNumber}" spans="1:${RO_MASTER_COLUMNS.length}">${cells.join("")}</row>`;
}

/** Clones the template's cell styles with a red font, returning old → new style ids. */
function addRedStyles(stylesXml: string, styleIds: string[]) {
  const fontsBlock = /<fonts([^>]*)>([\s\S]*?)<\/fonts>/.exec(stylesXml);
  const xfsBlock = /<cellXfs([^>]*)>([\s\S]*?)<\/cellXfs>/.exec(stylesXml);
  const map = new Map<string, string>();
  if (!fontsBlock || !xfsBlock) return { xml: stylesXml, map };

  const fonts = [...(fontsBlock[2] ?? "").matchAll(/<font\b[\s\S]*?(?:\/>|<\/font>)/g)].map(
    (m) => m[0],
  );
  const xfs = [...(xfsBlock[2] ?? "").matchAll(/<xf\b[\s\S]*?(?:\/>|<\/xf>)/g)].map((m) => m[0]);
  const newFonts: string[] = [];
  const newXfs: string[] = [];

  for (const id of new Set(styleIds)) {
    const xf = xfs[Number(id) || 0];
    if (!xf) continue;
    const fontId = Number(/fontId="(\d+)"/.exec(xf)?.[1] ?? "0");
    const font = fonts[fontId] ?? '<font><sz val="10"/><name val="Tahoma"/></font>';
    const body = /<font\b[^>]*>([\s\S]*?)<\/font>/.exec(font)?.[1] ?? "";
    const redFont = `<font>${body.replace(/<color[^>]*\/>/g, "")}<color rgb="FFFF0000"/></font>`;
    const redFontId = fonts.length + newFonts.length;
    newFonts.push(redFont);
    const redXf = xf
      .replace(/fontId="\d+"/, `fontId="${redFontId}"`)
      .replace(/applyFont="\d"/, "")
      .replace(/<xf /, '<xf applyFont="1" ');
    map.set(id, String(xfs.length + newXfs.length));
    newXfs.push(redXf);
  }

  const xml = stylesXml
    .replace(
      /<fonts([^>]*)>([\s\S]*?)<\/fonts>/,
      (_all, attrs: string, inner: string) =>
        `<fonts${attrs.replace(/count="\d+"/, `count="${fonts.length + newFonts.length}"`)}>${inner}${newFonts.join("")}</fonts>`,
    )
    .replace(
      /<cellXfs([^>]*)>([\s\S]*?)<\/cellXfs>/,
      (_all, attrs: string, inner: string) =>
        `<cellXfs${attrs.replace(/count="\d+"/, `count="${xfs.length + newXfs.length}"`)}>${inner}${newXfs.join("")}</cellXfs>`,
    );
  return { xml, map };
}

/** Locates the worksheet part that holds the RO sheet. */
async function sheetPath(zip: import("jszip"), sheetName: string) {
  const workbook = (await zip.file("xl/workbook.xml")?.async("string")) ?? "";
  const rels = (await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) ?? "";
  const sheet = new RegExp(`<sheet[^>]*name="${sheetName}"[^>]*>`).exec(workbook)?.[0] ?? "";
  const relId = /r:id="([^"]+)"/.exec(sheet)?.[1];
  const target = relId
    ? new RegExp(`<Relationship[^>]*Id="${relId}"[^>]*Target="([^"]+)"`).exec(rels)?.[1]
    : null;
  if (!target) return { path: "xl/worksheets/sheet1.xml", workbook };
  return { path: target.startsWith("/") ? target.slice(1) : `xl/${target}`, workbook };
}

/** Builds the filled workbook and hands back the bytes, ready to save. */
export async function buildRoMasterWorkbook(records: RoMasterRecord[]): Promise<Blob> {
  const [{ default: JSZip }, response] = await Promise.all([
    import("jszip"),
    fetch(template),
  ]);
  if (!response.ok) throw new Error("Could not load the RO master template");
  const zip = await JSZip.loadAsync(await response.arrayBuffer());

  const { path, workbook } = await sheetPath(zip as never, SHEET_NAME);
  const sheetXml = (await zip.file(path)?.async("string")) ?? "";
  if (!sheetXml) throw new Error("The RO sheet is missing from the template");

  const templateCells = readTemplateRow(sheetXml);
  const headerRow =
    /<row[^>]*r="1"[^>]*>[\s\S]*?<\/row>/.exec(sheetXml)?.[0] ??
    /<row[^>]*r="1"[^>]*\/>/.exec(sheetXml)?.[0] ??
    "";
  let redStyles = new Map<string, string>();
  if (records.some((record) => record.cancelled)) {
    const stylesXml = (await zip.file("xl/styles.xml")?.async("string")) ?? "";
    if (stylesXml) {
      const styleIds = [...templateCells.values()].map((cell) => cell.style).filter(Boolean);
      const red = addRedStyles(stylesXml, styleIds);
      redStyles = red.map;
      zip.file("xl/styles.xml", red.xml);
    }
  }

  const rowsXml = records
    .map((record, index) =>
      buildRowXml(
        record,
        FIRST_DATA_ROW + index,
        templateCells,
        record.cancelled ? redStyles : undefined,
      ),
    )
    .join("");

  let nextSheet = sheetXml.replace(
    /<sheetData>[\s\S]*?<\/sheetData>|<sheetData\/>/,
    `<sheetData>${headerRow}${rowsXml}</sheetData>`,
  );
  // Cached values are dropped, so ask Excel to recalculate on open.
  nextSheet = nextSheet.replace(
    /<dimension ref="A1:[A-Z]+\d+"\/>/,
    `<dimension ref="A1:${columnLetter(RO_MASTER_COLUMNS.length - 1)}${Math.max(
      FIRST_DATA_ROW,
      records.length + 1,
    )}"/>`,
  );
  zip.file(path, nextSheet);

  const nextWorkbook = workbook.includes("<calcPr")
    ? workbook.replace(/<calcPr([^>]*?)\/>/, '<calcPr$1 fullCalcOnLoad="1"/>')
    : workbook.replace("</workbook>", '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
  zip.file("xl/workbook.xml", nextWorkbook);

  // The calculation chain points at the old cells, so it is dropped cleanly.
  zip.remove("xl/calcChain.xml");
  const rels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (rels) {
    zip.file(
      "xl/_rels/workbook.xml.rels",
      rels.replace(/<Relationship[^>]*Target="calcChain\.xml"[^>]*\/>/, ""),
    );
  }
  const types = await zip.file("[Content_Types].xml")?.async("string");
  if (types) {
    zip.file(
      "[Content_Types].xml",
      types.replace(/<Override[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/, ""),
    );
  }

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.ms-excel.sheet.macroEnabled.12",
  });
}

export function saveRoMasterWorkbook(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
