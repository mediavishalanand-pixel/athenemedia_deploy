import { FileText, Mail, Paperclip, Plus, Send, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ReleaseOrderRow } from "@/lib/documents";
import { campaignPeriodOf, renderMailBody, renderMailSubject, type MailDraftTemplate } from "@/lib/mail-draft";
import type { Channel } from "@/lib/master-data";
import { buildReleaseOrderPdf, releaseOrderFileName } from "@/lib/pdf/ro-pdf";
import { roRowToDocument } from "@/lib/documents";
import type { DocCompany } from "@/lib/pdf/doc-context";
import { MultiValueField } from "@/components/multi-value-field";
import { findChannelByAlias } from "@/lib/channel-match";

type DraftState = {
  to: string;
  cc: string;
  additionalText: string;
  files: File[];
};

export type PreparedRoMailDraft = DraftState & {
  roId: string;
  subject: string;
  bodyText: string;
  signatureImageUrl: string;
  pdf: { fileName: string; blob: Blob };
};

export function RoDraftMailDialog({
  rows,
  channels,
  company,
  template,
  onClose,
  onPrepare,
  anchorTop,
}: {
  rows: ReleaseOrderRow[];
  channels: Channel[];
  company: DocCompany;
  template: MailDraftTemplate;
  onClose: () => void;
  onPrepare: (drafts: PreparedRoMailDraft[], mode: "draft" | "send") => Promise<void>;
  anchorTop?: number | null | undefined;
}) {
  const [activeId, setActiveId] = useState(rows[0]?.id ?? "");
  const [preparing, setPreparing] = useState<false | "draft" | "send">(false);
  const [applyAll, setApplyAll] = useState(false);
  const [applyAllFiles, setApplyAllFiles] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>(() =>
    Object.fromEntries(
      rows.map((row) => {
        const channel =
          channels.find((item) => item.id === row.channel_id) ??
          findChannelByAlias(row.channel_name, channels, (item) => [item.channel_name, ...(item.aliases ?? [])]);
        const tidy = (value?: string | null) => (value ?? "").split(/\s*[,;]\s*/).filter(Boolean).join(", ");
        return [row.id, { to: tidy(channel?.ro_email), cc: tidy(channel?.cc_email), additionalText: "", files: [] }];
      }),
    ),
  );
  // Only filenames up front — the PDFs themselves are built when drafts are prepared.
  const fileNames = useMemo(
    () => Object.fromEntries(rows.map((row) => [row.id, releaseOrderFileName(roRowToDocument(row))])),
    [rows],
  );
  const row = rows.find((item) => item.id === activeId) ?? rows[0];
  if (!row) return null;
  const draft = drafts[row.id];
  const fileName = fileNames[row.id] ?? "";
  if (!draft) return null;

  const setAllText = (text: string) =>
    setDrafts((current) => Object.fromEntries(Object.entries(current).map(([id, item]) => [id, { ...item, additionalText: text }])));
  const setAllFiles = (files: File[]) =>
    setDrafts((current) => Object.fromEntries(Object.entries(current).map(([id, item]) => [id, { ...item, files: [...files] }])));
  const setDraft = (patch: Partial<DraftState>) =>
    setDrafts((current) => ({ ...current, [row.id]: { ...current[row.id]!, ...patch } }));
  const valuesFor = (item: typeof row, fileName: string, additionalText: string) => ({
    fileName,
    additionalText,
    client: item.client_name || "—",
    campaign: item.campaign_name || "—",
    media: (item.media_type || "tv").toUpperCase(),
    period: campaignPeriodOf(item),
    roNumber: item.ro_number,
  });
  const previewValues = valuesFor(row, fileName, draft.additionalText);
  const previewSubject = renderMailSubject(template, previewValues);
  const previewBody = renderMailBody(template, previewValues);
  const preparePayload = async () => {
    const out: PreparedRoMailDraft[] = [];
    for (const item of rows) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const itemDraft = drafts[item.id]!;
      const itemName = fileNames[item.id]!;
      const blob = buildReleaseOrderPdf(roRowToDocument(item), company).output("blob");
      const itemValues = valuesFor(item, itemName, itemDraft.additionalText);
      out.push({
        ...itemDraft,
        roId: item.id,
        subject: renderMailSubject(template, itemValues),
        bodyText: renderMailBody(template, itemValues),
        signatureImageUrl: template.signatureImageUrl,
        pdf: { fileName: itemName, blob },
      });
    }
    return out;
  };

  return (
    <div
      className="ro-modal-backdrop mail-draft-backdrop"
      role="presentation"
      style={anchorTop == null ? undefined : { alignItems: "flex-start" }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="ro-modal mail-draft-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mail-draft-title"
        style={
          anchorTop == null
            ? undefined
            : {
                marginTop: Math.min(
                  Math.max(anchorTop - 90, 12),
                  Math.max(12, (typeof window === "undefined" ? 800 : window.innerHeight) - 420),
                ),
              }
        }
      >
        <header className="mail-draft-head">
          <div>
            <span className="eyebrow">Release orders</span>
            <h3 id="mail-draft-title">Draft mail</h3>
            <p>{rows.length} separate mail{rows.length === 1 ? "" : "s"} — same To, CC, text and attachments for Draft or Send.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close draft mail"><X /></Button>
        </header>

        {rows.length > 1 && (
          <div className="mail-draft-tabs" role="tablist" aria-label="Selected release orders">
            {rows.map((item, index) => (
              <Button key={item.id} variant={item.id === row.id ? "default" : "outline"} size="sm" onClick={() => setActiveId(item.id)}>
                {index + 1}. {item.ro_number}
              </Button>
            ))}
          </div>
        )}

        <div className="mail-draft-body">
        <div className="mail-draft-left">
        <div className="mail-draft-fields">
          <MultiValueField label="To" type="email" value={draft.to} onChange={(value) => setDraft({ to: value })} />
          <MultiValueField label="CC" type="email" value={draft.cc} onChange={(value) => setDraft({ cc: value })} />
          <label className="ro-field"><span>Subject</span><input value={previewSubject} readOnly /></label>
          <div className="ro-field">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <span>Additional text (optional)</span>
              {rows.length > 1 ? (
                <label title={`Use this text for all ${rows.length} ROs`} className="inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap text-xs">
                  <input className="h-4! w-4! shrink-0 p-0! accent-primary" type="checkbox" checked={applyAll} onChange={(event) => { setApplyAll(event.target.checked); if (event.target.checked) setAllText(draft.additionalText); }} />
                  <span>Same for all {rows.length} ROs</span>
                </label>
              ) : null}
            </div>
            <textarea rows={3} value={draft.additionalText} onChange={(event) => (applyAll ? setAllText(event.target.value) : setDraft({ additionalText: event.target.value }))} placeholder="Add a note before the campaign details" />
          </div>
        </div>

        <div className="mail-attachments">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <strong>Attachments</strong>
            {rows.length > 1 ? (
              <label title={`Attach the same files to all ${rows.length} ROs`} className="inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap text-xs">
                <input className="h-4! w-4! shrink-0 p-0! accent-primary" type="checkbox" checked={applyAllFiles} onChange={(event) => { setApplyAllFiles(event.target.checked); if (event.target.checked) setAllFiles(draft.files); }} />
                <span>Same for all {rows.length} ROs</span>
              </label>
            ) : null}
          </div>
          <div className="mail-attachment primary"><FileText /><span><b>{fileName}</b><small>RO PDF · attached automatically</small></span></div>
          {draft.files.map((file, index) => (
            <div className="mail-attachment" key={`${file.name}-${index}`}><Paperclip /><span><b>{file.name}</b><small>{Math.max(1, Math.round(file.size / 1024))} KB</small></span><Button variant="ghost" size="icon" onClick={() => { const next = draft.files.filter((_, itemIndex) => itemIndex !== index); setDraft({ files: next }); if (applyAllFiles) setAllFiles(next); }} aria-label={`Remove ${file.name}`}><Trash2 /></Button></div>
          ))}
          <label className="app-button secondary mail-file-picker"><Plus size={15} /> Add creative / file<input type="file" multiple onChange={(event) => { const next = [...draft.files, ...Array.from(event.target.files ?? [])]; setDraft({ files: next }); if (applyAllFiles) setAllFiles(next); }} /></label>
        </div>

        </div>
        <article className="mail-preview">
          <div className="mail-preview-subject"><b>Subject:</b> {previewSubject}</div>
          <pre className="mail-preview-text">{previewBody}</pre>
          {template.signatureImageUrl && <img src={template.signatureImageUrl} alt="Athene Advertising email signature" />}
        </article>
        </div>

        <div className="mail-placeholder"><Mail /> Draft and Send go through your mail gateway</div>
        <div className="ro-modal-actions">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" disabled={Boolean(preparing) || Object.values(drafts).some((item) => !item.to.replace(/[,;\s]/g, ""))} onClick={async () => { setPreparing("draft"); try { await onPrepare(await preparePayload(), "draft"); } finally { setPreparing(false); } }}><Mail />{preparing === "draft" ? "Preparing…" : `Draft ${rows.length} mail${rows.length === 1 ? "" : "s"}`}</Button>
          <Button disabled={Boolean(preparing) || Object.values(drafts).some((item) => !item.to.replace(/[,;\s]/g, ""))} onClick={async () => { setPreparing("send"); try { await onPrepare(await preparePayload(), "send"); } finally { setPreparing(false); } }}><Send />{preparing === "send" ? "Sending…" : `Send ${rows.length} mail${rows.length === 1 ? "" : "s"}`}</Button>
        </div>
      </section>
    </div>
  );
}