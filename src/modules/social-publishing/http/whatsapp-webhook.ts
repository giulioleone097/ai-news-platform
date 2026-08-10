import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { SocialOutboxRepository } from "../domain/ports";
import type { WhatsAppProviderStatus } from "../domain/social-publication";
import { redactProviderError, safeProviderCode } from "../application/error-redaction";

const maximumWebhookBytes = 256 * 1_024;
const whatsappStatusPattern = /^(?:sent|delivered|read|failed)$/;
const messageIdPattern = /^[A-Za-z0-9._:+/=-]{8,512}$/;

export interface WhatsAppWebhookConfig {
  appSecret: string;
  verifyToken: string;
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

function constantTimeTextEqual(left: string, right: string) {
  return timingSafeEqual(digest(left), digest(right));
}

export function handleWhatsAppWebhookVerification(
  request: Request,
  config: WhatsAppWebhookConfig,
) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode") ?? "";
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  if (mode !== "subscribe" || !challenge || challenge.length > 512
    || !constantTimeTextEqual(token, config.verifyToken)) {
    return new Response("Forbidden", {
      status: 403,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return new Response(challenge, {
    status: 200,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function readBoundedBody(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maximumWebhookBytes) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumWebhookBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function signatureIsValid(body: Uint8Array, header: string, appSecret: string) {
  const match = /^sha256=([a-f0-9]{64})$/i.exec(header);
  if (!match) return false;
  const expected = createHmac("sha256", appSecret).update(body).digest();
  const received = Buffer.from(match[1], "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function eventError(status: Record<string, unknown>) {
  const errors = Array.isArray(status.errors) ? status.errors : [];
  const first = asRecord(errors[0]);
  const data = asRecord(first?.error_data);
  const message = first?.message ?? first?.title ?? data?.details;
  return {
    code: safeProviderCode(first?.code, "whatsapp_delivery_failed"),
    message: redactProviderError(message, "WhatsApp delivery failed."),
  };
}

function extractStatuses(payload: unknown) {
  const root = asRecord(payload);
  if (root?.object !== "whatsapp_business_account" || !Array.isArray(root.entry)) return [];
  const statuses: Array<{
    providerMessageId: string;
    status: WhatsAppProviderStatus;
    occurredAt: string;
    errorCode: string | null;
    errorMessage: string | null;
  }> = [];
  for (const entryValue of root.entry.slice(0, 25)) {
    const entry = asRecord(entryValue);
    if (!Array.isArray(entry?.changes)) continue;
    for (const changeValue of entry.changes.slice(0, 25)) {
      const change = asRecord(changeValue);
      const value = asRecord(change?.value);
      if (change?.field !== "messages" || !Array.isArray(value?.statuses)) continue;
      for (const statusValue of value.statuses.slice(0, 100 - statuses.length)) {
        const status = asRecord(statusValue);
        if (!status) continue;
        const id = typeof status?.id === "string" ? status.id : "";
        const state = typeof status?.status === "string" ? status.status : "";
        const seconds = typeof status?.timestamp === "string" ? Number(status.timestamp) : NaN;
        if (!messageIdPattern.test(id) || !whatsappStatusPattern.test(state)
          || !Number.isSafeInteger(seconds) || seconds <= 0) continue;
        const error = state === "failed" ? eventError(status) : null;
        statuses.push({
          providerMessageId: id,
          status: state as WhatsAppProviderStatus,
          occurredAt: new Date(seconds * 1_000).toISOString(),
          errorCode: error?.code ?? null,
          errorMessage: error?.message ?? null,
        });
        if (statuses.length >= 100) return statuses;
      }
    }
  }
  return statuses;
}

export async function handleWhatsAppWebhook(
  request: Request,
  repository: SocialOutboxRepository,
  config: WhatsAppWebhookConfig,
) {
  const body = await readBoundedBody(request);
  if (!body) return Response.json({ error: "payload_too_large" }, {
    status: 413,
    headers: { "Cache-Control": "no-store" },
  });
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  if (!signatureIsValid(body, signature, config.appSecret)) {
    return Response.json({ error: "invalid_signature" }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    return Response.json({ error: "invalid_payload" }, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const statuses = extractStatuses(payload);
  let applied = 0;
  for (const status of statuses) {
    const updated = await repository.applyProviderStatus({ provider: "whatsapp", ...status });
    if (updated) applied += 1;
  }
  return Response.json({ received: statuses.length, applied }, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
