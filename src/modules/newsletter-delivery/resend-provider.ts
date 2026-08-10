import { z } from "zod";
import { NewsletterDeliveryProviderError } from "./domain";
import type {
  NewsletterDeliveryProvider,
  NewsletterProviderMessage,
} from "./ports";

const resendResponseSchema = z.object({ id: z.string().min(1).max(255) });
const resendErrorSchema = z.object({ message: z.string().max(500).optional() }).passthrough();

function retryAfterSeconds(response: Response) {
  const value = response.headers.get("retry-after");
  if (!value) return 60;
  const seconds = Number.parseInt(value, 10);
  if (Number.isSafeInteger(seconds) && seconds > 0) return Math.min(seconds, 86_400);
  const date = Date.parse(value);
  return Number.isNaN(date) ? 60 : Math.max(1, Math.min(86_400, Math.ceil((date - Date.now()) / 1000)));
}

function retryableStatus(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

export class ResendNewsletterProvider implements NewsletterDeliveryProvider {
  constructor(
    private readonly config: {
      apiKey: string;
      endpoint?: string;
      fetch?: typeof fetch;
    },
  ) {
    if (!config.apiKey.startsWith("re_")) {
      throw new NewsletterDeliveryProviderError("Resend is not configured.", { retryable: false });
    }
  }

  private async post(payload: Record<string, unknown>, idempotencyKey: string) {
    if (!idempotencyKey || idempotencyKey.length > 256) {
      throw new NewsletterDeliveryProviderError("Invalid Resend idempotency key.", { retryable: false });
    }

    const request = this.config.fetch ?? fetch;
    let response: Response;
    try {
      response = await request(this.config.endpoint ?? "https://api.resend.com/emails", {
        body: JSON.stringify(payload),
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        method: "POST",
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new NewsletterDeliveryProviderError(
        error instanceof Error ? `Resend network error: ${error.message}` : "Resend network error.",
        { retryable: true, retryAfterSeconds: 60 },
      );
    }

    const raw = await response.text();
    let json: unknown;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }

    if (!response.ok) {
      const providerMessage = resendErrorSchema.safeParse(json);
      throw new NewsletterDeliveryProviderError(
        providerMessage.success && providerMessage.data.message
          ? `Resend rejected delivery: ${providerMessage.data.message}`
          : `Resend rejected delivery with status ${response.status}.`,
        {
          retryable: retryableStatus(response.status),
          retryAfterSeconds: retryAfterSeconds(response),
        },
      );
    }

    const parsed = resendResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new NewsletterDeliveryProviderError("Resend returned an invalid response.", {
        retryable: true,
        retryAfterSeconds: 60,
      });
    }
    return { messageId: parsed.data.id };
  }

  send(message: NewsletterProviderMessage) {
    if (/[\r\n<>]/u.test(message.fromName)) {
      throw new NewsletterDeliveryProviderError("Invalid newsletter sender name.", { retryable: false });
    }
    return this.post({
      from: `${message.fromName} <${message.fromEmail}>`,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      headers: {
        "List-Unsubscribe": `<${message.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }, message.idempotencyKey);
  }

  sendConfirmation(message: {
    fromEmail: string;
    to: string;
    subject: string;
    html: string;
    replyTo: string | null;
    idempotencyKey: string;
  }) {
    return this.post({
      from: `NEURA <${message.fromEmail}>`,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
    }, message.idempotencyKey);
  }
}
