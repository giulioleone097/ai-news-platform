import { describe, expect, it, vi } from "vitest";

import { SocialProviderError, SocialPublishingConfigurationError } from "../domain/errors";
import type { SocialOutboxRepository, SocialProviderRegistry } from "../domain/ports";
import type { SocialOutboxJob, SocialProviderAdapter } from "../domain/social-publication";
import { SocialOutboxProcessor } from "./outbox-processor";

function job(overrides: Partial<SocialOutboxJob> = {}): SocialOutboxJob {
  return {
    id: "fc7c6331-56a3-42dc-8932-6b4394bc4c9f",
    publicationId: "9b984e7b-1aa8-4f2a-bd9b-f799f4b7529e",
    provider: "x",
    idempotencyKey: "social:x:5e9f62b40cc1470cb41e67d9e77c2565",
    payload: { text: "AI briefing" },
    status: "processing",
    attempts: 1,
    maxAttempts: 5,
    availableAt: "2026-08-10T10:00:00.000Z",
    leaseToken: "c086d129-b13f-47df-8393-e6e4c836ed57",
    leaseExpiresAt: "2026-08-10T10:02:00.000Z",
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
    ...overrides,
  };
}

function harness(adapterOrError: SocialProviderAdapter | Error) {
  const claimed = job();
  const repository = {
    claim: vi.fn().mockResolvedValue([claimed]),
    markDispatchStarted: vi.fn().mockResolvedValue({
      ...claimed,
      dispatchStartedAt: "2026-08-10T10:00:01.000Z",
    }),
    markSent: vi.fn().mockImplementation(async (
      _id: string,
      _token: string,
      receipt: { messageId: string; url: string | null; status: string },
    ) => job({
      status: "sent",
      providerMessageId: receipt.messageId,
      providerUrl: receipt.url,
      providerStatus: receipt.status,
    })),
    markRetry: vi.fn().mockResolvedValue(job({ status: "pending" })),
    markFailed: vi.fn().mockResolvedValue(job({ status: "failed" })),
  } as unknown as SocialOutboxRepository;
  const providers: SocialProviderRegistry = {
    get: vi.fn(() => {
      if (adapterOrError instanceof Error) throw adapterOrError;
      return adapterOrError;
    }),
  };
  return { claimed, repository, providers };
}

function adapter(publish: SocialProviderAdapter["publish"]): SocialProviderAdapter {
  return { provider: "x", validate: vi.fn(), publish };
}

describe("SocialOutboxProcessor", () => {
  it("persists provider acceptance before counting a job as sent", async () => {
    const context = harness(adapter(vi.fn().mockResolvedValue({
      messageId: "1445880548472328192",
      url: "https://x.com/i/web/status/1445880548472328192",
      status: "published",
    })));
    const result = await new SocialOutboxProcessor(
      context.repository,
      context.providers,
    ).processBatch();
    expect(result).toEqual({ claimed: 1, sent: 1, retried: 0, failed: 0, unresolved: 0 });
    expect(context.repository.markDispatchStarted).toHaveBeenCalledOnce();
    expect(context.repository.markSent).toHaveBeenCalledOnce();
  });

  it("backs off an explicit 429 without marking an ambiguous dispatch", async () => {
    const context = harness(adapter(vi.fn().mockRejectedValue(new SocialProviderError(
      "x",
      "rate_limit",
      "Rate limited",
      true,
      false,
      120,
    ))));
    const result = await new SocialOutboxProcessor(context.repository, context.providers).processBatch();
    expect(result.retried).toBe(1);
    expect(context.repository.markRetry).toHaveBeenCalledOnce();
    expect(context.repository.markFailed).not.toHaveBeenCalled();
  });

  it("terminally fails an unknown transport outcome and blocks unsafe retry", async () => {
    const context = harness(adapter(vi.fn().mockRejectedValue(new SocialProviderError(
      "x",
      "x_transport_unknown",
      "Transport failed",
      false,
      true,
    ))));
    const result = await new SocialOutboxProcessor(context.repository, context.providers).processBatch();
    expect(result.failed).toBe(1);
    expect(context.repository.markFailed).toHaveBeenCalledWith(expect.objectContaining({
      retrySafe: false,
      errorCode: "x_transport_unknown",
    }));
  });

  it("does not mark failed or redeliver when provider acceptance cannot be persisted", async () => {
    const context = harness(adapter(vi.fn().mockResolvedValue({
      messageId: "1445880548472328192",
      url: "https://x.com/i/web/status/1445880548472328192",
      status: "published",
    })));
    vi.mocked(context.repository.markSent).mockRejectedValueOnce(new Error("database unavailable"));
    const result = await new SocialOutboxProcessor(context.repository, context.providers).processBatch();
    expect(result.unresolved).toBe(1);
    expect(context.repository.markFailed).not.toHaveBeenCalled();
    expect(context.repository.markRetry).not.toHaveBeenCalled();
  });

  it("fails closed before dispatch when provider configuration is missing", async () => {
    const context = harness(new SocialPublishingConfigurationError("X is not configured."));
    const result = await new SocialOutboxProcessor(context.repository, context.providers).processBatch();
    expect(result.failed).toBe(1);
    expect(context.repository.markDispatchStarted).not.toHaveBeenCalled();
    expect(context.repository.markFailed).toHaveBeenCalledWith(expect.objectContaining({ retrySafe: true }));
  });
});
