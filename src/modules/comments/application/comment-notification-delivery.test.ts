import { describe, expect, it, vi } from "vitest";
import type { CommentNotificationEvent } from "../domain/comment";
import { CommentNotificationDeliveryService } from "./comment-notification-delivery";
import type {
  CommentNotificationOutbox,
  CommentNotificationProvider,
} from "./notification-outbox";

const events: CommentNotificationEvent[] = [
  {
    id: "d4f99c40-35dd-48af-b06c-513d0b77aee1",
    subscriptionId: "4a72e86b-c7bc-48da-85a5-279736b82990",
    commentId: "a71fabf1-2a75-4d08-8b5c-241b48b591b2",
    kind: "verification",
    recipientEmail: "reader@example.com",
    locale: "en",
    payload: {},
    attempts: 1,
  },
  {
    id: "b9d81025-ddc9-434e-b9a9-ac7d5a66baca",
    subscriptionId: "68e2a9e3-bd36-46e5-88ed-d4a3d05d7ee8",
    commentId: "352d3894-c126-4d51-8a30-f53ff3d1b3d6",
    kind: "reply",
    recipientEmail: "author@example.com",
    locale: "it",
    payload: { articleSlug: "agenti-ai-al-lavoro" },
    attempts: 1,
  },
];

describe("CommentNotificationDeliveryService", () => {
  it("leases, delivers and records every real-provider outcome", async () => {
    const complete = vi.fn<CommentNotificationOutbox["complete"]>(async () => undefined);
    const outbox: CommentNotificationOutbox = {
      claim: vi.fn(async () => events),
      start: vi.fn(async () => true),
      complete,
    };
    const provider: CommentNotificationProvider = {
      send: vi.fn(async (event) => {
        if (event.kind === "reply") throw new Error("provider unavailable");
        return { messageId: "email-123" };
      }),
    };

    const result = await new CommentNotificationDeliveryService(outbox, provider)
      .processBatch({ limit: 10 });

    expect(result).toEqual({ claimed: 2, sent: 1, failed: 1, skipped: 0 });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[0]?.[0]).toMatchObject({
      id: events[0].id,
      succeeded: true,
      providerMessageId: "email-123",
    });
    expect(complete.mock.calls[1]?.[0]).toMatchObject({
      id: events[1].id,
      succeeded: false,
      error: "provider unavailable",
    });
  });

  it("never calls the provider when the atomic dispatch boundary rejects a revoked lease", async () => {
    const provider: CommentNotificationProvider = { send: vi.fn() };
    const complete = vi.fn<CommentNotificationOutbox["complete"]>(async () => undefined);
    const outbox: CommentNotificationOutbox = {
      claim: vi.fn(async () => [events[0]]),
      start: vi.fn(async () => false),
      complete,
    };

    const result = await new CommentNotificationDeliveryService(outbox, provider).processBatch();

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 0, skipped: 1 });
    expect(provider.send).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });
});
