import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Reads the text of a vendor bill image so bills can be found by search. */
export const readBillImageText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { dataUrl: string }) => {
    if (typeof input?.dataUrl !== "string" || !input.dataUrl.startsWith("data:image/")) {
      throw new Error("An image is required");
    }
    if (input.dataUrl.length > 14_000_000) throw new Error("Image too large");
    return input;
  })
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { text: "" };
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Transcribe all text visible in this vendor bill/invoice exactly as plain text (names, numbers, dates, amounts, GSTIN). Keep each table row on its own line, and keep telecast/broadcast dates, times and durations exactly as printed (e.g. 10-Apr-2026 07:24:26 50). Output only the text.",
              },
              { type: "image_url", image_url: { url: data.dataUrl } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error("Bill OCR failed", res.status, await res.text());
      return { text: "" };
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { text: json.choices?.[0]?.message?.content?.trim() ?? "" };
  });

export type BillDetails = { billNumber: string; roNumber: string; referenceNumber: string; subTotal: string; totalPayable: string };

/** Pulls the vendor's bill number, RO / reference number and amounts out of the bill text. */
export const readBillDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { text: string; roNumber?: string }) => {
    if (typeof input?.text !== "string") throw new Error("Bill text is required");
    return { text: input.text.slice(0, 12000), roNumber: typeof input?.roNumber === "string" ? input.roNumber : "" };
  })
  .handler(async ({ data }): Promise<BillDetails | null> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key || !data.text.trim()) return null;
    const field = { type: "string" };
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You read Indian TV/radio vendor invoices sent to an advertising agency. The text may have labels and values out of order. Return the vendor's invoice/bill number, the agency's RO number quoted on the bill (e.g. 'Ro No', 'Release Order No'), any other reference number ('Ref No', 'PO No', 'Your Ref'), the sub total / taxable amount before GST, and the final amount payable. Use empty strings when absent. Amounts as printed, e.g. 1,04,040.00.",
          },
          { role: "user", content: data.text },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "bill_details",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["billNumber", "roNumber", "referenceNumber", "subTotal", "totalPayable"],
              properties: { billNumber: field, roNumber: field, referenceNumber: field, subTotal: field, totalPayable: field },
            },
          },
        },
      }),
    });
    if (!res.ok) {
      console.error("Bill details failed", res.status, await res.text());
      return null;
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    try {
      const d = JSON.parse(json.choices?.[0]?.message?.content ?? "") as BillDetails;
      if (d.referenceNumber.trim() === d.roNumber.trim()) d.referenceNumber = "";
      // The reader sometimes swaps the vendor's bill number and the agency's RO
      // number. When we know the RO's own number, whichever field matches it is
      // the RO number — swap them back if they landed the wrong way round.
      const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const expected = norm(data.roNumber ?? "");
      if (expected) {
        const bn = norm(d.billNumber);
        const rn = norm(d.roNumber);
        const billIsRo = bn.length > 0 && (bn.includes(expected) || expected.includes(bn));
        const roIsRo = rn.length > 0 && (rn.includes(expected) || expected.includes(rn));
        if (billIsRo && !roIsRo) {
          const tmp = d.billNumber;
          d.billNumber = d.roNumber;
          d.roNumber = tmp;
        }
      }
      return d;
    } catch {
      return null;
    }
  });
