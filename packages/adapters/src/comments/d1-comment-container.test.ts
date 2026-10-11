import { afterEach, describe, expect, it, vi } from "vitest";
import { createSitesTestStore, type SitesTestStore } from "../sites/testing";
import {
  createCommentNotificationOutbox,
  createMutationCommentService,
  createPublicCommentService,
  getCommentCapability,
} from "./container";
import { D1CommentNotificationOutbox } from "./d1-comment-notification-outbox";

let store: SitesTestStore | null = null;

afterEach(async () => {
  vi.unstubAllEnvs();
  await store?.dispose();
  store = null;
});

describe("comments container on Sites", () => {
  it("is readable from D1 alone, and gains mutations once the guest secret is configured", async () => {
    store = await createSitesTestStore({ register: true });
    vi.stubEnv("ATLASNEWS_CONTENT_MODE", "sites");
    vi.stubEnv("ATLASNEWS_COMMENT_GUEST_SECRET", "");
    expect(getCommentCapability()).toMatchObject({ readable: true, mutations: false, moderation: false, reason: "mutation_configuration_missing" });
    expect(createPublicCommentService()).not.toBeNull();
    expect(createMutationCommentService()).toBeNull();
    expect(createCommentNotificationOutbox()).toBeNull();

    vi.stubEnv("ATLASNEWS_COMMENT_GUEST_SECRET", "s".repeat(40));
    expect(getCommentCapability()).toMatchObject({ readable: true, mutations: true, guestIdentity: true, moderation: true, reason: null });
    expect(createMutationCommentService()).not.toBeNull();
    expect(createCommentNotificationOutbox()).toBeInstanceOf(D1CommentNotificationOutbox);
  });

  it("gives the public service approved comments only, as Supabase does without a service client", async () => {
    store = await createSitesTestStore({ register: true });
    vi.stubEnv("ATLASNEWS_CONTENT_MODE", "sites");
    vi.stubEnv("ATLASNEWS_COMMENT_GUEST_SECRET", "s".repeat(40));
    const service = createPublicCommentService()!;
    await expect(service.listModeration({ status: "pending", limit: 10 } as never)).rejects.toMatchObject({ code: "configuration_unavailable" });
    await expect(service.moderate({ commentId: crypto.randomUUID() } as never)).rejects.toMatchObject({ code: "configuration_unavailable" });
  });
});
