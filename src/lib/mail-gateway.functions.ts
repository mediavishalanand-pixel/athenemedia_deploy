import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Mail gateway hand-off. The app does not talk to Gmail itself: it POSTs each
 * prepared mail to the external endpoint configured in MAIL_GATEWAY_URL
 * (optional bearer token in MAIL_GATEWAY_TOKEN).
 *
 * Request body sent to the gateway:
 * {
 *   "mode": "draft" | "send",
 *   "messages": [{
 *     "roId": string, "to": string[], "cc": string[],
 *     "subject": string, "bodyText": string, "signatureImageUrl": string,
 *     "attachments": [{ "fileName": string, "mimeType": string, "base64": string }]
 *   }]
 * }
 * Expected reply: any 2xx. Non-2xx status and body are shown to the user.
 */
export type MailGatewayAttachment = { fileName: string; mimeType: string; base64: string };
export type MailGatewayMessage = {
  roId: string;
  to: string[];
  cc: string[];
  subject: string;
  bodyText: string;
  signatureImageUrl: string;
  attachments: MailGatewayAttachment[];
};
export type MailGatewayInput = { mode: "draft" | "send"; messages: MailGatewayMessage[] };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const dispatchRoMail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: MailGatewayInput) => {
    if (input?.mode !== "draft" && input?.mode !== "send") throw new Error("Invalid mail mode");
    if (!Array.isArray(input.messages) || input.messages.length === 0 || input.messages.length > 50) {
      throw new Error("Between 1 and 50 mails are required");
    }
    let size = 0;
    for (const m of input.messages) {
      if (!m.to?.length || ![...m.to, ...(m.cc ?? [])].every((a) => EMAIL.test(a))) {
        throw new Error(`Invalid email address for ${m.subject || "a release order"}`);
      }
      for (const a of m.attachments ?? []) size += a.base64.length;
    }
    if (size > 40_000_000) throw new Error("Attachments are too large (limit about 30 MB in total)");
    return input;
  })
  .handler(async ({ data, context }) => {
    const url = process.env["MAIL_GATEWAY_URL"];
    if (!url) {
      throw new Error("Mail gateway is not connected yet. Add MAIL_GATEWAY_URL to enable draft and send.");
    }
    const token = process.env["MAIL_GATEWAY_TOKEN"];
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ ...data, requestedBy: context.userId }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`Mail gateway failed [${res.status}]: ${text}`);
      throw new Error(`Mail gateway error [${res.status}]: ${text.slice(0, 300)}`);
    }
    return { ok: true, count: data.messages.length };
  });
