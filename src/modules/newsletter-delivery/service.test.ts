import { describe, expect, it, vi } from "vitest";
import {
  NewsletterDeliveryProviderError,
  type NewsletterOutboxDelivery,
} from "./domain";
import type {
  NewsletterDeliveryProvider,
  NewsletterDeliveryRepository,
} from "./ports";
import { NewsletterDeliveryService } from "./service";
import { parseConfirmationToken, verifyUnsubscribeToken } from "./security";

const campaignId = "33333333-3333-4333-8333-333333333333";
const recipientId = "11111111-1111-4111-8111-111111111111";
const subscriptionId = "22222222-2222-4222-8222-222222222222";
const secret = "newsletter-test-secret-with-32-characters";

const delivery: NewsletterOutboxDelivery = {
  outboxId: 7,
  campaignId,
  recipientId,
  subscriptionId,
  recipientEmail: "reader@example.com",
  idempotencyKey: `newsletter:${campaignId}:${recipientId}`,
  attempt: 1,
  locale: "en",
  subject: "AI briefing",
  preheader: "What changed",
  fromName: "NEURA",
  fromEmail: "briefing@example.com",
  replyTo: null,
  contentMarkdown: "## This week\n\nA sufficiently complete campaign body.",
};

function repository(
  overrides: Partial<NewsletterDeliveryRepository> = {},
): NewsletterDeliveryRepository {
  return {
    async listCampaigns() { return { items: [], total: 0 }; },
    async getCampaign() { return null; },
    async listRecipients() { return []; },
    async saveDraft() { throw new Error("Not used in delivery tests."); },
    async queueCampaign() { throw new Error("Not used in delivery tests."); },
    async cancelCampaign() { throw new Error("Not used in delivery tests."); },
    async claimOutbox() { return []; },
    async startOutboxDelivery() { return true; },
    async completeOutbox() { return true; },
    async failOutbox() { return true; },
    async recordProviderEvent() { return true; },
    async registerSuppression() { return true; },
    async requestSubscription() {
      return { subscriptionId: null, status: "active", shouldSend: false };
    },
    async completeSubscriptionConfirmation() { return true; },
    async releaseSubscriptionConfirmation() { return true; },
    async confirmSubscription() { return false; },
    async unsubscribe() { return false; },
    async getSubscriptionEmail() { return null; },
    async eraseSubscription() { return false; },
    ...overrides,
  };
}

function provider(
  overrides: Partial<NewsletterDeliveryProvider> = {},
): NewsletterDeliveryProvider {
  return {
    async send() { return { messageId: "email_default" }; },
    async sendConfirmation() { return { messageId: "email_confirmation" }; },
    ...overrides,
  };
}

function service(
  deliveryRepository: NewsletterDeliveryRepository,
  deliveryProvider: NewsletterDeliveryProvider,
) {
  return new NewsletterDeliveryService(deliveryRepository, deliveryProvider, {
    baseUrl: new URL("https://news.example.com"),
    fromEmail: "briefing@example.com",
    replyTo: "editor@example.com",
    unsubscribeSecret: secret,
  });
}

describe("NewsletterDeliveryService", () => {
  it("delivers one personalized message and completes the leased outbox item", async () => {
    const completeOutbox = vi.fn(async () => true);
    const send = vi.fn<NewsletterDeliveryProvider["send"]>(async () => ({ messageId: "email_123" }));
    const result = await service(
      repository({ claimOutbox: async () => [delivery], completeOutbox }),
      provider({ send }),
    ).processOutboxBatch();

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0, skipped: 0 });
    expect(completeOutbox).toHaveBeenCalledWith(expect.objectContaining({
      outboxId: 7,
      providerMessageId: "email_123",
    }));
    const message = send.mock.calls[0][0];
    expect(message.to).toBe("reader@example.com");
    expect(message.html).toContain('<html lang="en">');
    const token = new URL(message.unsubscribeUrl).pathname.split("/").at(-1);
    expect(verifyUnsubscribeToken(decodeURIComponent(token ?? ""), secret)).toEqual({
      recipientId,
      subscriptionId,
      version: 1,
    });
  });

  it("records a terminal provider failure without retrying", async () => {
    const failOutbox = vi.fn(async () => true);
    const result = await service(
      repository({ claimOutbox: async () => [delivery], failOutbox }),
      provider({
        async send() {
          throw new NewsletterDeliveryProviderError("Rejected sender.", { retryable: false });
        },
      }),
    ).processOutboxBatch();

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1, skipped: 0 });
    expect(failOutbox).toHaveBeenCalledWith(expect.objectContaining({
      outboxId: 7,
      retryable: false,
    }));
  });

  it("skips a delivery revoked at the atomic provider-dispatch boundary", async () => {
    const send = vi.fn<NewsletterDeliveryProvider["send"]>();
    const failOutbox = vi.fn(async () => true);
    const result = await service(
      repository({
        claimOutbox: async () => [delivery],
        startOutboxDelivery: async () => false,
        failOutbox,
      }),
      provider({ send }),
    ).processOutboxBatch();

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 0, skipped: 1 });
    expect(send).not.toHaveBeenCalled();
    expect(failOutbox).not.toHaveBeenCalled();
  });

  it("sends a hashed one-time confirmation challenge before activation", async () => {
    let requestedHash = "";
    let requestFingerprint = "";
    const complete = vi.fn(async () => true);
    const sendConfirmation = vi.fn<NewsletterDeliveryProvider["sendConfirmation"]>(
      async () => ({ messageId: "email_confirm" }),
    );
    await service(
      repository({
        async requestSubscription(input) {
          requestedHash = input.tokenHash;
          requestFingerprint = input.requestFingerprint;
          return { subscriptionId, status: "pending", shouldSend: true };
        },
        completeSubscriptionConfirmation: complete,
      }),
      provider({ sendConfirmation }),
    ).requestSubscription(
      { email: "Reader@Example.com", locale: "en", source: "site" },
      { requester: "203.0.113.8" },
    );

    const confirmationMessage = sendConfirmation.mock.calls[0][0];
    const href = confirmationMessage.html.match(/href="([^"]+)"/u)?.[1].replaceAll("&amp;", "&");
    if (!href) throw new Error("Confirmation URL was not rendered.");
    const token = new URL(href).pathname.split("/").at(-1);
    expect(parseConfirmationToken(decodeURIComponent(token ?? ""))).toEqual({
      subscriptionId,
      tokenHash: requestedHash,
    });
    expect(complete).toHaveBeenCalledWith({
      subscriptionId,
      tokenHash: requestedHash,
      providerMessageId: "email_confirm",
    });
    expect(requestFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(requestFingerprint).not.toContain("203.0.113.8");
  });

  it("reconciles suppression even when the webhook delivery is a duplicate", async () => {
    const registerSuppression = vi.fn(async () => true);
    const result = await service(
      repository({
        recordProviderEvent: async () => false,
        registerSuppression,
      }),
      provider(),
    ).recordProviderEvent({
      event: {
        webhookId: "msg_123",
        providerMessageId: "email_123",
        type: "email.complained",
        occurredAt: "2026-08-10T12:00:00.000Z",
        payload: {},
      },
      recipientEmail: "reader@example.com",
    });

    expect(result).toEqual({ duplicate: true });
    expect(registerSuppression).toHaveBeenCalledWith(expect.objectContaining({
      providerMessageId: "email_123",
      reason: "complaint",
    }));
  });
});
