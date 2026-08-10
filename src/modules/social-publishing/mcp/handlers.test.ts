import { describe, expect, it, vi } from "vitest";

import type { SocialOutboxProcessor } from "../application/outbox-processor";
import { SocialPublishingService } from "../application/social-publishing-service";
import type { SocialOutboxRepository, SocialProviderRegistry } from "../domain/ports";
import type { SocialOutboxJob } from "../domain/social-publication";
import { createSocialPublishingMcpHandlers } from "./handlers";

const job: SocialOutboxJob = {
  id: "fc7c6331-56a3-42dc-8932-6b4394bc4c9f",
  publicationId: "9b984e7b-1aa8-4f2a-bd9b-f799f4b7529e",
  provider: "whatsapp",
  idempotencyKey: "social:whatsapp:5e9f62b40cc1470cb41e67d9e77c2565",
  payload: { text: "Private briefing", recipient: "15551234567" },
  status: "pending",
  attempts: 0,
  maxAttempts: 5,
  availableAt: "2026-08-10T10:00:00.000Z",
  leaseToken: null,
  leaseExpiresAt: null,
  dispatchStartedAt: null,
  providerMessageId: null,
  providerUrl: null,
  providerStatus: null,
  providerStatusAt: null,
  revision: 0,
  retrySafe: true,
  lastErrorCode: null,
  lastErrorMessage: null,
  sentAt: null,
  failedAt: null,
  deliveredAt: null,
  readAt: null,
  createdAt: "2026-08-10T10:00:00.000Z",
  updatedAt: "2026-08-10T10:00:00.000Z",
};

function setup() {
  const repository = {
    enqueue: vi.fn().mockResolvedValue(job),
    getById: vi.fn().mockResolvedValue(job),
    getByIdempotencyKey: vi.fn().mockResolvedValue(job),
    list: vi.fn().mockResolvedValue({ items: [job], total: 1, limit: 50, offset: 0, hasMore: false }),
    cancelPending: vi.fn().mockResolvedValue({ ...job, status: "cancelled" }),
    retryFailed: vi.fn().mockResolvedValue(job),
    requeue: vi.fn().mockResolvedValue(job),
  } as unknown as SocialOutboxRepository;
  const providers: SocialProviderRegistry = {
    get: vi.fn(() => ({
      provider: "whatsapp" as const,
      validate: vi.fn(),
      publish: vi.fn().mockResolvedValue({ messageId: "wamid.test", url: null, status: "accepted" }),
    })),
  };
  const processor = {
    processBatch: vi.fn().mockResolvedValue({
      claimed: 0,
      sent: 0,
      retried: 0,
      failed: 0,
      unresolved: 0,
    }),
  } as unknown as SocialOutboxProcessor;
  return {
    repository,
    handlers: createSocialPublishingMcpHandlers({
      service: new SocialPublishingService(repository),
      processor,
      providers,
    }),
  };
}

describe("social publishing MCP handlers", () => {
  it("previews WhatsApp with a redacted explicit recipient", async () => {
    const { handlers } = setup();
    await expect(handlers.social_outbox_preview({
      publicationId: job.publicationId,
      provider: "whatsapp",
      payload: { text: "Private briefing", recipient: "+15551234567" },
    })).resolves.toMatchObject({
      provider: "whatsapp",
      recipient: "[redacted]",
      valid: true,
    });
  });

  it("requires confirmation before enqueueing or processing", async () => {
    const { handlers, repository } = setup();
    await expect(handlers.social_outbox_enqueue({
      publicationId: job.publicationId,
      provider: "whatsapp",
      payload: { text: "Private briefing", recipient: "+15551234567" },
      confirm: false,
    })).rejects.toThrow("confirmation");
    expect(repository.enqueue).not.toHaveBeenCalled();
    await expect(handlers.social_outbox_process({ confirm: false })).rejects.toThrow("confirmation");
  });

  it("never exposes queued payload or WhatsApp recipient in list/get/enqueue output", async () => {
    const { handlers } = setup();
    const enqueued = await handlers.social_outbox_enqueue({
      publicationId: job.publicationId,
      provider: "whatsapp",
      payload: { text: "Private briefing", recipient: "+15551234567" },
      confirm: true,
    });
    const listed = await handlers.social_outbox_list({});
    const fetched = await handlers.social_outbox_get({ id: job.id });
    for (const value of [enqueued, listed.items[0], fetched]) {
      expect(value).not.toHaveProperty("payload");
      expect(JSON.stringify(value)).not.toContain("15551234567");
      expect(value).toHaveProperty("providerStatusAt", null);
    }
  });

  it("exposes confirmed cancel and duplicate-safe retry as separate operations", async () => {
    const { handlers, repository } = setup();
    await handlers.social_outbox_cancel({ id: job.id, confirm: true });
    await handlers.social_outbox_retry({ id: job.id, confirm: true });
    expect(repository.cancelPending).toHaveBeenCalledWith(job.id);
    expect(repository.retryFailed).toHaveBeenCalledWith(job.id);
  });

  it("requires confirmation and forwards the current version for corrected requeue", async () => {
    const { handlers, repository } = setup();
    const input = {
      id: job.id,
      expectedRevision: job.revision,
      publicationId: job.publicationId,
      provider: job.provider,
      payload: job.payload,
    };
    await expect(handlers.social_outbox_requeue({ ...input, confirm: false })).rejects.toThrow("confirmation");
    await handlers.social_outbox_requeue({ ...input, confirm: true });
    expect(repository.requeue).toHaveBeenCalledWith(expect.objectContaining({
      id: job.id,
      expectedRevision: job.revision,
      publicationId: job.publicationId,
    }));
  });
});
