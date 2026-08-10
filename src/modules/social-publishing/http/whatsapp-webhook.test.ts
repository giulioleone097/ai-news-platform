import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type { SocialOutboxRepository } from "../domain/ports";
import {
  handleWhatsAppWebhook,
  handleWhatsAppWebhookVerification,
} from "./whatsapp-webhook";

const config = {
  appSecret: "whatsapp-app-secret-1234567890",
  verifyToken: "whatsapp-verify-token-123456",
};

function repository() {
  return {
    applyProviderStatus: vi.fn().mockResolvedValue({ id: "job-1" }),
  } as unknown as SocialOutboxRepository;
}

function signedRequest(payload: unknown, secret = config.appSecret) {
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  return new Request("https://neura.example/api/webhooks/social/whatsapp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": `sha256=${signature}`,
    },
    body,
  });
}

describe("WhatsApp webhook", () => {
  it("answers Meta verification only for the configured token", async () => {
    const success = handleWhatsAppWebhookVerification(new Request(
      "https://neura.example/api/webhooks/social/whatsapp?hub.mode=subscribe&hub.verify_token=whatsapp-verify-token-123456&hub.challenge=123456",
    ), config);
    expect(success.status).toBe(200);
    await expect(success.text()).resolves.toBe("123456");

    const rejected = handleWhatsAppWebhookVerification(new Request(
      "https://neura.example/api/webhooks/social/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123456",
    ), config);
    expect(rejected.status).toBe(403);
  });

  it("verifies HMAC over raw bytes and applies delivery receipts", async () => {
    const outbox = repository();
    const response = await handleWhatsAppWebhook(signedRequest({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          field: "messages",
          value: {
            statuses: [{
              id: "wamid.HBgMNTU1MTIzNDU2NzgVAgARGBI5",
              status: "delivered",
              timestamp: "1786348800",
            }],
          },
        }],
      }],
    }), outbox, config);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: 1, applied: 1 });
    expect(outbox.applyProviderStatus).toHaveBeenCalledWith({
      provider: "whatsapp",
      providerMessageId: "wamid.HBgMNTU1MTIzNDU2NzgVAgARGBI5",
      status: "delivered",
      occurredAt: "2026-08-10T08:00:00.000Z",
      errorCode: null,
      errorMessage: null,
    });
  });

  it("rejects invalid signatures before parsing or touching persistence", async () => {
    const outbox = repository();
    const response = await handleWhatsAppWebhook(signedRequest({ object: "invalid" }, "wrong-secret"), outbox, config);
    expect(response.status).toBe(401);
    expect(outbox.applyProviderStatus).not.toHaveBeenCalled();
  });

  it("redacts delivery-error credentials and recipients before persistence", async () => {
    const outbox = repository();
    await handleWhatsAppWebhook(signedRequest({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: { statuses: [{
        id: "wamid.HBgMNTU1MTIzNDU2NzgVAgARGBI5",
        status: "failed",
        timestamp: "1786348800",
        errors: [{
          code: 131026,
          message: "Bearer secret-access-token-1234567890 failed for +15551234567",
        }],
      }] } }] }],
    }), outbox, config);
    const call = vi.mocked(outbox.applyProviderStatus).mock.calls[0][0];
    expect(call.errorMessage).not.toContain("secret-access-token");
    expect(call.errorMessage).not.toContain("15551234567");
    expect(call.errorCode).toBe("131026");
  });

  it("bounds webhook bodies before JSON parsing", async () => {
    const outbox = repository();
    const response = await handleWhatsAppWebhook(new Request(
      "https://neura.example/api/webhooks/social/whatsapp",
      {
        method: "POST",
        headers: { "content-length": "999999" },
        body: "{}",
      },
    ), outbox, config);
    expect(response.status).toBe(413);
    expect(outbox.applyProviderStatus).not.toHaveBeenCalled();
  });
});
