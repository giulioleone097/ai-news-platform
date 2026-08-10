import { z } from "zod";
import type { NewsletterProviderEvent } from "./domain";

const resendWebhookSchema = z.object({
  type: z.string().min(1).max(100),
  created_at: z.iso.datetime({ offset: true }).optional(),
  data: z.object({
    email_id: z.string().min(1).max(255),
    created_at: z.iso.datetime({ offset: true }).optional(),
    to: z.array(z.email().max(254)).max(50).optional(),
  }).passthrough(),
}).passthrough();

export function parseResendWebhook(body: string, webhookId: string): {
  event: NewsletterProviderEvent;
  recipientEmail: string | null;
} {
  const json: unknown = JSON.parse(body);
  const parsed = resendWebhookSchema.parse(json);
  const occurredAt = parsed.data.created_at ?? parsed.created_at ?? new Date().toISOString();

  return {
    event: {
      webhookId,
      providerMessageId: parsed.data.email_id,
      type: parsed.type,
      occurredAt,
      payload: {
        email_id: parsed.data.email_id,
        event_type: parsed.type,
        occurred_at: occurredAt,
      },
    },
    recipientEmail: parsed.data.to?.[0]?.toLowerCase() ?? null,
  };
}
