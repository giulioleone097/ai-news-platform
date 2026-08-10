import { z } from "zod";
import { getRequestNetworkAddress } from "@/lib/request-network";
import type { NewsletterDeliveryService } from "./service";
import { parseResendWebhook } from "./webhook";
import { verifySvixWebhook } from "./security";

const maxWebhookBytes = 1_000_000;
const maxSubscriptionBytes = 16_384;

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function htmlPage(input: {
  action?: string;
  actionLabel?: string;
  body: string;
  lang?: "en" | "it";
  title: string;
}) {
  const action = input.action
    ? `<form method="post" action="${escapeHtml(input.action)}"><button type="submit">${escapeHtml(input.actionLabel ?? "Continue")}</button></form>`
    : "";
  const html = `<!doctype html><html lang="${input.lang ?? "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title><style>body{margin:0;background:#f1efe8;color:#151515;font:16px/1.55 system-ui,sans-serif}main{width:min(100% - 2rem,38rem);margin:12vh auto;background:#fff;border:1px solid #d8d5cd;padding:clamp(1.5rem,6vw,3rem)}h1{font-size:clamp(2rem,8vw,3.5rem);line-height:.95;letter-spacing:-.045em}p{color:#55545a}button{min-height:48px;border:0;background:#151515;color:#fff;padding:.8rem 1.1rem;font:inherit;font-weight:750;cursor:pointer}button:focus-visible{outline:3px solid #e45c42;outline-offset:3px}</style></head><body><main><strong>NEURA</strong><h1>${escapeHtml(input.title)}</h1><p>${escapeHtml(input.body)}</p>${action}</main></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function readLimitedBody(request: Request, maximum: number) {
  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(contentLength) && contentLength > maximum) {
    await request.body?.cancel();
    throw new Error("Request body too large.");
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let received = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return body + decoder.decode();
      received += chunk.value.byteLength;
      if (received > maximum) {
        await reader.cancel("Request body too large.");
        throw new Error("Request body too large.");
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

export async function processNewsletterOutbox(
  service: NewsletterDeliveryService,
  input: { limit?: number; leaseSeconds?: number } = {},
) {
  return service.processOutboxBatch(input);
}

export async function handleNewsletterWebhookRequest(input: {
  request: Request;
  secret: string;
  service: NewsletterDeliveryService;
}) {
  let body: string;
  try {
    body = await readLimitedBody(input.request, maxWebhookBytes);
  } catch {
    return json({ error: "invalid_request" }, 413);
  }
  const id = input.request.headers.get("svix-id");
  const timestamp = input.request.headers.get("svix-timestamp");
  const signature = input.request.headers.get("svix-signature");
  if (!verifySvixWebhook({ body, id, signature, timestamp, secret: input.secret })) {
    return json({ error: "invalid_signature" }, 401);
  }

  try {
    const parsed = parseResendWebhook(body, id as string);
    const result = await input.service.recordProviderEvent(parsed);
    return json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      return json({ error: "invalid_payload" }, 400);
    }
    throw error;
  }
}

export async function handleNewsletterSubscriptionRequest(input: {
  request: Request;
  service: NewsletterDeliveryService;
}) {
  let body: string;
  try {
    body = await readLimitedBody(input.request, maxSubscriptionBytes);
  } catch {
    return json({ error: "invalid_request" }, 413);
  }

  let data: unknown;
  try {
    if (input.request.headers.get("content-type")?.includes("application/json")) {
      data = JSON.parse(body);
    } else {
      data = Object.fromEntries(new URLSearchParams(body));
    }
    await input.service.requestSubscription(data, {
      requester: getRequestNetworkAddress(input.request.headers),
    });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      return json({ error: "invalid_request" }, 400);
    }
    throw error;
  }

  return json({ accepted: true }, 202);
}

export function newsletterConfirmationPage(request: Request, locale: "en" | "it") {
  const copy = locale === "it"
    ? {
        title: "Conferma iscrizione",
        body: "Conferma che vuoi ricevere il briefing NEURA. Il token verrà usato una sola volta.",
        action: "Conferma",
      }
    : {
        title: "Confirm subscription",
        body: "Confirm that you want to receive the NEURA briefing. The token will be used once.",
        action: "Confirm",
      };
  return htmlPage({
    ...copy,
    actionLabel: copy.action,
    action: new URL(request.url).pathname,
    lang: locale,
  });
}

export async function handleNewsletterConfirmation(
  service: NewsletterDeliveryService,
  token: string,
  locale: "en" | "it",
) {
  const confirmed = await service.confirmSubscription(token);
  const copy = locale === "it"
    ? confirmed
      ? { title: "Iscrizione confermata", body: "Riceverai il prossimo briefing NEURA." }
      : { title: "Link non valido", body: "Il link è scaduto o è già stato utilizzato." }
    : confirmed
      ? { title: "Subscription confirmed", body: "You will receive the next NEURA briefing." }
      : { title: "Invalid link", body: "This link expired or has already been used." };
  return htmlPage({ ...copy, lang: locale });
}

export function newsletterUnsubscribePage(request: Request, locale: "en" | "it") {
  const copy = locale === "it"
    ? {
        title: "Annulla iscrizione",
        body: "Conferma per non ricevere più il briefing NEURA.",
        action: "Annulla iscrizione",
      }
    : {
        title: "Unsubscribe",
        body: "Confirm that you no longer want to receive the NEURA briefing.",
        action: "Unsubscribe",
      };
  return htmlPage({
    ...copy,
    actionLabel: copy.action,
    action: new URL(request.url).pathname,
    lang: locale,
  });
}

export async function handleNewsletterUnsubscribe(
  service: NewsletterDeliveryService,
  token: string,
  locale: "en" | "it",
) {
  const unsubscribed = await service.unsubscribe(token);
  const copy = locale === "it"
    ? unsubscribed
      ? { title: "Iscrizione annullata", body: "Non riceverai più il briefing NEURA." }
      : { title: "Richiesta non valida", body: "Il link non è valido o l’iscrizione non esiste più." }
    : unsubscribed
      ? { title: "Unsubscribed", body: "You will no longer receive the NEURA briefing." }
      : { title: "Invalid request", body: "This link is invalid or the subscription no longer exists." };
  return htmlPage({ ...copy, lang: locale });
}
