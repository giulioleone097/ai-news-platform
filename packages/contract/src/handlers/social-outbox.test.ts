import { describe, expect, it, vi } from "vitest";

import type { SocialOutboxProcessor } from "@atlasnews/core/social-publishing/application/outbox-processor";
import { SocialPublishingService } from "@atlasnews/core/social-publishing/application/social-publishing-service";
import type { SocialOutboxRepository, SocialProviderRegistry } from "@atlasnews/core/social-publishing/domain/ports";
import type { SocialOutboxJob } from "@atlasnews/core/social-publishing/domain/social-publication";
import { SocialPublishingError } from "@atlasnews/core/social-publishing/domain/errors";

import { capabilities } from "../catalogue";
import type { CapabilityPorts } from "../ports";
import { CapabilityFailure } from "../capability";
import { createSocialPublishingMcpHandlers } from "./social-outbox";

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
    updatePending: vi.fn(async (input: { payload: SocialOutboxJob["payload"]; maxAttempts: number }) => ({
      ...job, payload: input.payload, maxAttempts: input.maxAttempts, revision: job.revision + 1,
    })),
    cancelPendingMany: vi.fn(async (ids: string[]) => ids.map((id) => ({ ...job, id, status: "cancelled" as const }))),
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
    providers,
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

  it("edits a pending job: confirmation, then the stored payload merged with the change", async () => {
    const { handlers, repository } = setup();
    const change = { id: job.id, expectedRevision: job.revision, payload: { text: "Corrected briefing" } };
    await expect(handlers.social_outbox_update({ ...change, confirm: false })).rejects.toThrow("confirmation");
    expect(repository.updatePending).not.toHaveBeenCalled();

    const updated = await handlers.social_outbox_update({ ...change, scheduledFor: "2026-08-11T09:00:00.000Z", confirm: true });
    expect(repository.updatePending).toHaveBeenCalledWith({
      id: job.id,
      expectedRevision: job.revision,
      provider: "whatsapp",
      // The recipient stays, because only the text changed.
      payload: { text: "Corrected briefing", articleUrl: undefined, recipient: "15551234567" },
      availableAt: "2026-08-11T09:00:00.000Z",
      maxAttempts: 5,
    });
    expect(updated).toMatchObject({ id: job.id, revision: 1 });
    expect(updated).not.toHaveProperty("payload");
  });

  it("refuses to edit a job that is not waiting, changed since it was read, or has nothing to change", async () => {
    const { handlers, repository } = setup();
    const change = { id: job.id, expectedRevision: job.revision, payload: { text: "Corrected" }, confirm: true };
    await expect(handlers.social_outbox_update({ ...change, expectedRevision: 3 })).rejects.toMatchObject({ code: "conflict" });
    await expect(handlers.social_outbox_update({ id: job.id, expectedRevision: 0, confirm: true })).rejects.toMatchObject({ code: "invalid_input" });
    vi.mocked(repository.getById).mockResolvedValueOnce({ ...job, status: "sent" });
    await expect(handlers.social_outbox_update(change)).rejects.toThrow("pending and was never dispatched");
    vi.mocked(repository.getById).mockResolvedValueOnce({ ...job, dispatchStartedAt: "2026-08-10T10:01:00.000Z" });
    await expect(handlers.social_outbox_update(change)).rejects.toThrow("never dispatched");
    vi.mocked(repository.getById).mockResolvedValueOnce(null);
    await expect(handlers.social_outbox_update(change)).rejects.toMatchObject({ code: "not_found" });
    expect(repository.updatePending).not.toHaveBeenCalled();
  });

  it("cancels several jobs only when every one can be cancelled", async () => {
    const { handlers, repository } = setup();
    const other = "0c7c6331-56a3-42dc-8932-6b4394bc4c9f";
    await expect(handlers.social_outbox_cancel_many({ ids: [job.id], confirm: false })).rejects.toThrow("confirmation");
    const cancelled = await handlers.social_outbox_cancel_many({ ids: [job.id, other], confirm: true });
    expect(repository.cancelPendingMany).toHaveBeenCalledWith([job.id, other]);
    expect(cancelled.map((item) => item.status)).toEqual(["cancelled", "cancelled"]);

    vi.mocked(repository.cancelPendingMany).mockClear();
    vi.mocked(repository.getById).mockImplementation(async (id) => (id === other ? { ...job, id, status: "sent" } : job));
    await expect(handlers.social_outbox_cancel_many({ ids: [job.id, other], confirm: true }))
      .rejects.toThrow(`#1 (${other}): Only a pending job can be cancelled; this one is sent.`);
    await expect(handlers.social_outbox_cancel_many({ ids: [job.id, job.id], confirm: true })).rejects.toThrow("also item #0");
    expect(repository.cancelPendingMany).not.toHaveBeenCalled();
  });
});

describe("social capabilities", () => {
  const find = (name: string) => capabilities.find((capability) => capability.name === name)!;
  const editor = { kind: "editor", subject: "tester", scopes: ["newsroom.read", "newsroom.write"] } as const;

  function portsOver(repository: SocialOutboxRepository) {
    const { providers } = setup();
    return {
      social: async () => ({
        service: new SocialPublishingService(repository),
        processor: {} as SocialOutboxProcessor,
        providers,
      }),
    } as unknown as CapabilityPorts;
  }

  it("answers an edit with the redacted job and a batch cancel with what happened to each job", async () => {
    const { repository } = setup();
    const ports = portsOver(repository);
    const update = find("admin_social_update");
    const edited = update.output.parse(await update.run(
      ports,
      update.input.parse({ id: job.id, expectedRevision: 0, payload: { text: "Corrected" }, maxAttempts: 3 }),
      editor,
    ));
    expect(edited).toMatchObject({ job: { id: job.id, maxAttempts: 3, revision: 1 } });

    const cancel = find("admin_social_cancel_jobs");
    expect(cancel.output.parse(await cancel.run(ports, cancel.input.parse({ ids: [job.id] }), editor))).toEqual({
      count: 1,
      items: [{ index: 0, action: "cancelled", id: job.id, provider: "whatsapp" }],
    });
    expect(await cancel.confirmation!.question(cancel.input.parse({ ids: [job.id] }), ports)).toBe("Cancel 1 queued social job?");
  });

  it("tells the caller what is wrong with a job or a field, and keeps storage failures to itself", async () => {
    const { repository } = setup();
    const ports = portsOver(repository);
    const update = find("admin_social_update");
    await expect(update.run(ports, update.input.parse({ id: job.id, expectedRevision: 9, payload: { text: "x" } }), editor))
      .rejects.toEqual(new CapabilityFailure("The job changed since it was read: read it again and retry."));
    await expect(update.run(ports, update.input.parse({ id: job.id, expectedRevision: 0 }), editor))
      .rejects.toBeInstanceOf(CapabilityFailure);
    const enqueue = find("admin_social_enqueue");
    await expect(enqueue.run(ports, enqueue.input.parse({
      publicationId: job.publicationId, provider: "x", payload: { text: "Hi", recipient: "15551234567" },
    }), editor)).rejects.toThrow("Recipient is only valid for WhatsApp jobs.");

    vi.mocked(repository.updatePending).mockRejectedValueOnce(new SocialPublishingError("Social outbox persistence failed.", "persistence_error"));
    await expect(update.run(ports, update.input.parse({ id: job.id, expectedRevision: 0, payload: { text: "x" } }), editor))
      .rejects.not.toBeInstanceOf(CapabilityFailure);
  });

  it("offers the edit and the batch cancel on the page, behind newsroom.write and a confirmation", () => {
    for (const name of ["admin_social_update", "admin_social_cancel_jobs"]) {
      expect(find(name).surfaces, name).toEqual(["mcp", "page"]);
      expect(find(name).scopes, name).toEqual(["newsroom.write"]);
      expect(find(name).confirmation, name).toBeDefined();
    }
    const update = find("admin_social_update");
    expect(update.input.safeParse({ id: job.id, expectedRevision: 0, scheduledFor: null }).success).toBe(true);
    expect(update.input.safeParse({ id: job.id, expectedRevision: 0, payload: { text: "" } }).success).toBe(false);
  });
});
