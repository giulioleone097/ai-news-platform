import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CommentOperationError } from "@atlasnews/core/comments/application/errors";
import type { D1Database } from "../sites/cloudflare";
import { createSitesTestStore, type SitesTestStore } from "../sites/testing";
import { D1CommentNotificationOutbox } from "./d1-comment-notification-outbox";
import { D1CommentRepository } from "./d1-comment-repository";
import { seedPublishedArticle } from "./d1-comment-test-support";

let store: SitesTestStore;
let database: D1Database;
let outbox: D1CommentNotificationOutbox;
let repository: D1CommentRepository;
let articleId: string;
let counter = 0;
const unique = () => (counter += 1).toString(16).padStart(64, "0");

type Queued = { subscriptionId: string; tokenHash: string; notificationId: string; commentId: string };

/** A comment with a notification preference: its verification email is the queued notification. */
async function queueVerification(): Promise<Queued> {
  const subscriptionId = crypto.randomUUID();
  const tokenHash = unique();
  const comment = await repository.create({
    articleId,
    locale: "en",
    parentId: null,
    body: "Please tell me.",
    displayName: "Ada",
    actor: { kind: "guest", userId: null, guestHash: unique(), guestOwnerHash: unique(), actorRateHash: unique(), networkRateHash: unique() },
    notifications: { email: "reader@example.com", emailHash: unique(), onReplies: true, onModeration: true, subscriptionId, verificationTokenHash: tokenHash },
  });
  const row = (await database.prepare("SELECT id FROM comment_notifications WHERE subscription_id = ?").bind(subscriptionId).first<{ id: string }>())!;
  return { subscriptionId, tokenHash, notificationId: row.id, commentId: comment.id };
}

const rowOf = (id: string) =>
  database.prepare("SELECT * FROM comment_notifications WHERE id = ?").bind(id).first<Record<string, unknown>>();

async function drainQueue() {
  await database.prepare("UPDATE comment_notifications SET status = 'cancelled' WHERE status IN ('pending', 'failed', 'processing')").run();
}

async function expectStorageError(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(CommentOperationError);
  expect((error as CommentOperationError).code).toBe("storage_error");
}

beforeAll(async () => {
  store = await createSitesTestStore();
  database = store.database;
  outbox = new D1CommentNotificationOutbox(database);
  repository = new D1CommentRepository(database);
  articleId = await seedPublishedArticle(database);
});

afterAll(async () => {
  await store.dispose();
});

describe("D1CommentNotificationOutbox", () => {
  it("claims queued notifications once, with their payload and attempt count", async () => {
    await drainQueue();
    const queued = await queueVerification();
    const claimed = await outbox.claim("worker-one", 10);
    expect(claimed).toEqual([
      expect.objectContaining({
        id: queued.notificationId,
        subscriptionId: queued.subscriptionId,
        commentId: queued.commentId,
        kind: "verification",
        recipientEmail: "reader@example.com",
        locale: "en",
        attempts: 1,
        payload: expect.objectContaining({ subscriptionId: queued.subscriptionId, commentId: queued.commentId }),
      }),
    ]);
    expect(await rowOf(queued.notificationId)).toMatchObject({ status: "processing", worker_id: "worker-one" });
    expect(await outbox.claim("worker-two", 10)).toEqual([]);
  });

  it("never hands one notification to two concurrent claims, and honours the limit", async () => {
    await drainQueue();
    const queued = await Promise.all(Array.from({ length: 6 }, queueVerification));
    const [first, second] = await Promise.all([outbox.claim("worker-one", 3), outbox.claim("worker-two", 3)]);
    const ids = [...first, ...second].map((event) => event.id);
    expect(first).toHaveLength(3);
    expect(second).toHaveLength(3);
    expect(new Set(ids).size).toBe(6);
    expect(new Set(ids)).toEqual(new Set(queued.map((item) => item.notificationId)));
    await expectStorageError(outbox.claim("worker-one", 0));
    await expectStorageError(outbox.claim("x", 5));
  });

  it("re-leases a claim that nobody finished within 15 minutes", async () => {
    await drainQueue();
    const queued = await queueVerification();
    await outbox.claim("worker-one", 1);
    expect(await outbox.claim("worker-two", 1)).toEqual([]);
    await database
      .prepare("UPDATE comment_notifications SET locked_at = ? WHERE id = ?")
      .bind(new Date(Date.now() - 16 * 60 * 1_000).toISOString(), queued.notificationId)
      .run();
    const [again] = await outbox.claim("worker-two", 1);
    expect(again).toMatchObject({ id: queued.notificationId, attempts: 2 });
    expect(await rowOf(queued.notificationId)).toMatchObject({ worker_id: "worker-two" });
  });

  it("starts delivery once for the lease holder and sends a verification mail only while it is still wanted", async () => {
    await drainQueue();
    const queued = await queueVerification();
    await outbox.claim("worker-one", 1);
    expect(await outbox.start({ id: queued.notificationId, workerId: "worker-two" })).toBe(false);
    expect(await outbox.start({ id: queued.notificationId, workerId: "worker-one" })).toBe(true);
    expect(await outbox.start({ id: queued.notificationId, workerId: "worker-one" })).toBe(false);
    expect(await rowOf(queued.notificationId)).toMatchObject({ status: "processing", worker_id: "worker-one" });

    await drainQueue();
    const unsubscribed = await queueVerification();
    await outbox.claim("worker-one", 1);
    await repository.unsubscribeNotificationSubscription(unsubscribed.subscriptionId, unsubscribed.tokenHash);
    expect(await outbox.start({ id: unsubscribed.notificationId, workerId: "worker-one" })).toBe(false);
    expect(await rowOf(unsubscribed.notificationId)).toMatchObject({ status: "cancelled", worker_id: null });

    await drainQueue();
    const verified = await queueVerification();
    await outbox.claim("worker-one", 1);
    await repository.verifyNotificationSubscription(verified.subscriptionId, verified.tokenHash);
    expect(await outbox.start({ id: verified.notificationId, workerId: "worker-one" })).toBe(false);
    expect(await rowOf(verified.notificationId)).toMatchObject({ status: "cancelled" });
  });

  it("completes a started delivery as sent, and refuses completion outside the lease", async () => {
    await drainQueue();
    const queued = await queueVerification();
    await outbox.claim("worker-one", 1);
    await expectStorageError(outbox.complete({ id: queued.notificationId, workerId: "worker-one", succeeded: true }));
    await outbox.start({ id: queued.notificationId, workerId: "worker-one" });
    await expectStorageError(outbox.complete({ id: queued.notificationId, workerId: "worker-two", succeeded: true }));
    await outbox.complete({ id: queued.notificationId, workerId: "worker-one", succeeded: true, providerMessageId: " msg_123 " });
    expect(await rowOf(queued.notificationId)).toMatchObject({
      status: "sent",
      provider_message_id: "msg_123",
      last_error: null,
      worker_id: null,
      locked_at: null,
    });
    expect((await rowOf(queued.notificationId))!.processed_at).not.toBeNull();
    await expectStorageError(outbox.complete({ id: queued.notificationId, workerId: "worker-one", succeeded: true }));
    expect(await outbox.claim("worker-one", 10)).toEqual([]);
  });

  it("completes a failed delivery with exponential backoff, and retries it when due", async () => {
    await drainQueue();
    const queued = await queueVerification();
    await outbox.claim("worker-one", 1);
    await outbox.start({ id: queued.notificationId, workerId: "worker-one" });
    const before = Date.now();
    await outbox.complete({ id: queued.notificationId, workerId: "worker-one", succeeded: false, error: "provider said no" });
    const failed = await rowOf(queued.notificationId);
    expect(failed).toMatchObject({ status: "failed", last_error: "provider said no", attempts: 1, dispatch_started_at: null, worker_id: null });
    // attempts = 1, so the delay is 30 * 2 seconds.
    expect(Date.parse(failed!.available_at as string) - before).toBeGreaterThanOrEqual(59_000);
    expect(Date.parse(failed!.available_at as string) - before).toBeLessThan(62_000);
    expect(await outbox.claim("worker-one", 10)).toEqual([]);

    await database.prepare("UPDATE comment_notifications SET available_at = ? WHERE id = ?").bind(new Date(Date.now() - 1_000).toISOString(), queued.notificationId).run();
    expect(await outbox.claim("worker-one", 10)).toEqual([expect.objectContaining({ id: queued.notificationId, attempts: 2 })]);
  });

  it("stops claiming a notification after 20 attempts", async () => {
    await drainQueue();
    const queued = await queueVerification();
    await database.prepare("UPDATE comment_notifications SET attempts = 20 WHERE id = ?").bind(queued.notificationId).run();
    expect(await outbox.claim("worker-one", 10)).toEqual([]);
  });
});
