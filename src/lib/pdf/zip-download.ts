/** Shared helper: download one PDF directly, or several as a single ZIP. */
export type PdfFile = { name: string; data: ArrayBuffer };

const safe = (name: string) => name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();

const saveBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safe(fileName);
  link.click();
  URL.revokeObjectURL(url);
};

export async function downloadPdfFiles(files: PdfFile[], zipName: string) {
  if (!files.length) return;
  if (files.length === 1) {
    saveBlob(new Blob([files[0]!.data], { type: "application/pdf" }), files[0]!.name);
    return;
  }
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const used = new Set<string>();
  for (const file of files) {
    let name = file.name;
    for (let n = 2; used.has(name.toLowerCase()); n += 1) name = file.name.replace(/\.pdf$/i, ` (${n}).pdf`);
    used.add(name.toLowerCase());
    zip.file(name, file.data);
  }
  saveBlob(await zip.generateAsync({ type: "blob" }), zipName.endsWith(".zip") ? zipName : `${zipName}.zip`);
}
