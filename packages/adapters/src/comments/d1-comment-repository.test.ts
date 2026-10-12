import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CommentRepository } from "@atlasnews/core/comments/application/comment-repository";
import { CommentOperationError } from "@atlasnews/core/comments/application/errors";
import type { CommentActor, ModerationActor } from "@atlasnews/core/comments/domain/comment";
import { decodeAuditCursor, decodeCommentCursor } from "@atlasnews/core/comments/domain/cursor";
import type { D1Database } from "../sites/cloudflare";
import { createSitesTestStore, type SitesTestStore } from "../sites/testing";
import { createD1CommentRepository } from "./d1-comment-repository";
import { seedPublishedArticle } from "./d1-comment-test-support";

let store: SitesTestStore;
let database: D1Database;
let repository: CommentRepository;
let articleId: string;

const hex = (seed: string) => seed.repeat(64).slice(0, 64);
let counter = 0;
const unique = () => (counter += 1).toString(16).padStart(64, "0");

/** A guest with its own rate-limit identities, so tests never share a bucket by accident. */
function guest(seed = unique()): CommentActor {
  return {
    kind: "guest",
    userId: null,
    guestHash: seed,
    guestOwnerHash: seed,
    actorRateHash: unique(),
    networkRateHash: unique(),
  };
}

function member(userId = crypto.randomUUID()): CommentActor {
  return {
    kind: "authenticated",
    userId,
    guestHash: null,
    guestOwnerHash: null,
    actorRateHash: unique(),
    networkRateHash: unique(),
  };
}

const moderator: ModerationActor = { kind: "user", userId: crypto.randomUUID(), label: null };

async function createComment(actor: CommentActor, overrides: { parentId?: string | null; articleId?: string; body?: string } = {}) {
  return repository.create({
    articleId: overrides.articleId ?? articleId,
    locale: "en",
    parentId: overrides.parentId ?? null,
    body: overrides.body ?? "A thoughtful remark.",
    displayName: "Ada",
    actor,
    notifications: null,
  });
}

async function approve(id: string) {
  await repository.moderate({ id, status: "approved", reason: "Looks fine.", actor: moderator });
}

async function expectCode(promise: Promise<unknown>, code: CommentOperationError["code"]) {
  const error = await promise.then(() => null, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(CommentOperationError);
  expect((error as CommentOperationError).code).toBe(code);
}

const count = async (sql: string, ...binds: unknown[]) =>
  (await database.prepare(sql).bind(...binds).first<{ n: number }>())!.n;

const backdate = (id: string, seconds: number) =>
  database
    .prepare("UPDATE comments SET created_at = ? WHERE id = ?")
    .bind(new Date(Date.now() - seconds * 1_000).toISOString(), id)
    .run();

function notificationPreference(overrides: Partial<{ onReplies: boolean; onModeration: boolean }> = {}) {
  return {
    email: "reader@example.com",
    emailHash: unique(),
    onReplies: overrides.onReplies ?? true,
    onModeration: overrides.onModeration ?? true,
    subscriptionId: crypto.randomUUID(),
    verificationTokenHash: unique(),
  };
}

beforeAll(async () => {
  store = await createSitesTestStore();
  database = store.database;
  repository = createD1CommentRepository(database);
  articleId = await seedPublishedArticle(database);
});

afterAll(async () => {
  await store.dispose();
});

describe("D1CommentRepository public reads", () => {
  it("hides pending comments, shows approved ones with reply counts, and pages with a keyset cursor", async () => {
    const article = await seedPublishedArticle(database);
    const first = await createComment(guest(), { articleId: article, body: "First root comment." });
    const second = await createComment(guest(), { articleId: article, body: "Second root comment." });
    const query = { articleId: article, locale: "en", parentId: null, cursor: null, limit: 1 } as const;

    expect((await repository.listApproved(query)).items).toEqual([]);
    await approve(first.id);
    await approve(second.id);
    const reply = await createComment(guest(), { articleId: article, parentId: first.id, body: "A reply to the first." });
    expect((await repository.listApproved({ ...query, limit: 5 })).items.find((item) => item.id === first.id)?.replyCount).toBe(0);
    await approve(reply.id);

    const page = await repository.listApproved(query);
    expect(page.items.map((item) => item.id)).toEqual([second.id]);
    expect(page.nextCursor).not.toBeNull();
    const next = await repository.listApproved({ ...query, cursor: decodeCommentCursor(page.nextCursor!) });
    expect(next.items.map((item) => item.id)).toEqual([first.id]);
    expect(next.items[0]).toMatchObject({ replyCount: 1, displayName: "Ada", editedAt: null, parentId: null });
    expect(next.nextCursor).toBeNull();
    expect(Object.keys(next.items[0]!)).not.toContain("status");

    const replies = await repository.listApproved({ ...query, parentId: first.id, limit: 5 });
    expect(replies.items.map((item) => item.id)).toEqual([reply.id]);
  });

  it("hides replies whose parent is no longer approved, and comments of an unpublished article", async () => {
    const article = await seedPublishedArticle(database);
    const root = await createComment(guest(), { articleId: article, body: "Root to be rejected." });
    await approve(root.id);
    const reply = await createComment(guest(), { articleId: article, parentId: root.id, body: "Reply that stays." });
    await approve(reply.id);
    await repository.moderate({ id: root.id, status: "rejected", reason: "Changed my mind.", actor: moderator });
    const replies = { articleId: article, locale: "en", parentId: root.id, cursor: null, limit: 5 } as const;
    expect((await repository.listApproved(replies)).items).toEqual([]);

    await approve(root.id);
    expect((await repository.listApproved(replies)).items).toHaveLength(1);
    await database.prepare("UPDATE articles SET status = 'draft', published_at = NULL WHERE id = ?").bind(article).run();
    expect((await repository.listApproved(replies)).items).toEqual([]);
  });
});

describe("D1CommentRepository create", () => {
  it("stores a trimmed pending comment with its edit and delete windows and a created audit event", async () => {
    const created = await createComment(guest(), { body: "  Padded remark.  " });
    expect(created).toMatchObject({ body: "Padded remark.", status: "pending", parentId: null, canEdit: true, canDelete: true });
    expect(Date.parse(created.editUntil) - Date.parse(created.createdAt)).toBe(15 * 60 * 1_000);
    expect(Date.parse(created.deleteUntil) - Date.parse(created.createdAt)).toBe(24 * 60 * 60 * 1_000);
    const audit = await repository.listAudit({ beforeId: null, limit: 50 });
    expect(audit.items.find((event) => event.commentId === created.id)).toMatchObject({
      action: "created",
      actorKind: "guest",
      previousStatus: null,
      nextStatus: "pending",
    });
  });

  it("rejects unpublished or other-locale articles and invalid parents", async () => {
    const draft = await seedPublishedArticle(database, { status: "draft" });
    await expectCode(createComment(guest(), { articleId: draft }), "not_found");
    await expectCode(createComment(guest(), { articleId: crypto.randomUUID() }), "not_found");
    await expectCode(
      repository.create({ articleId, locale: "it", parentId: null, body: "Wrong locale.", displayName: "Ada", actor: guest(), notifications: null }),
      "not_found",
    );

    const root = await createComment(guest());
    await expectCode(createComment(guest(), { parentId: root.id }), "invalid_request");
    await approve(root.id);
    const reply = await createComment(guest(), { parentId: root.id });
    await approve(reply.id);
    await expectCode(createComment(guest(), { parentId: reply.id }), "invalid_request");
    const otherArticle = await seedPublishedArticle(database);
    await expectCode(createComment(guest(), { articleId: otherArticle, parentId: root.id }), "invalid_request");
    await expectCode(createComment(guest(), { body: " x " }), "invalid_request");
    await expectCode(createComment({ ...guest(), guestHash: "not-a-hash" } as CommentActor), "invalid_request");
  });

  it("rejects a row that skips the repository: reply to a reply, locale that differs from the article", async () => {
    const root = await createComment(guest());
    const insert = (id: string, parentId: string | null, locale: string) =>
      database
        .prepare(
          `INSERT INTO comments (id, article_id, locale, parent_id, body, author_display_name, author_kind, author_user_id)
           VALUES (?, ?, ?, ?, 'Direct insert.', 'Ada', 'authenticated', 'user-1')`,
        )
        .bind(id, articleId, locale, parentId)
        .run();
    const reply = crypto.randomUUID();
    await insert(reply, root.id, "en");
    await expect(insert(crypto.randomUUID(), reply, "en")).rejects.toThrow(/comment_parent_invalid/);
    await expect(insert(crypto.randomUUID(), null, "it")).rejects.toThrow(/comment_article_invalid/);
  });

  it("limits an actor to 5 and a network to 30 creations per window, rolling back the rejected write", async () => {
    const actor = guest();
    for (let index = 0; index < 5; index += 1) await createComment(actor, { body: `Remark number ${index}.` });
    const before = await count("SELECT count(*) AS n FROM comments");
    await expectCode(createComment(actor, { body: "One too many." }), "rate_limited");
    expect(await count("SELECT count(*) AS n FROM comments")).toBe(before);
    expect(await count("SELECT hits AS n FROM comment_rate_limits WHERE identity_hash = ? AND action = 'create_actor'", actor.actorRateHash)).toBe(5);

    const networkHash = unique();
    for (let index = 0; index < 30; index += 1) await createComment({ ...guest(), networkRateHash: networkHash });
    await expectCode(createComment({ ...guest(), networkRateHash: networkHash }), "rate_limited");
  });

  it("creates the notification subscription and its verification email together with the comment", async () => {
    const preference = notificationPreference();
    const created = await repository.create({
      articleId, locale: "en", parentId: null, body: "Notify me please.", displayName: "Ada", actor: guest(), notifications: preference,
    });
    const subscription = await database
      .prepare("SELECT * FROM comment_notification_subscriptions WHERE id = ?")
      .bind(preference.subscriptionId)
      .first<Record<string, unknown>>();
    expect(subscription).toMatchObject({ comment_id: created.id, email: "reader@example.com", notify_on_replies: 1, verified_at: null });
    const notification = await database
      .prepare("SELECT kind, payload, dedupe_key, status FROM comment_notifications WHERE subscription_id = ?")
      .bind(preference.subscriptionId)
      .first<{ kind: string; payload: string; dedupe_key: string; status: string }>();
    expect(notification).toMatchObject({ kind: "verification", status: "pending", dedupe_key: `comment-verification:${preference.subscriptionId}` });
    expect(JSON.parse(notification!.payload)).toMatchObject({ subscriptionId: preference.subscriptionId, commentId: created.id, locale: "en" });
  });

  it("rolls back the comment and rate-limit hits when the notification part is invalid or duplicated", async () => {
    const actor = guest();
    const preference = notificationPreference();
    await repository.create({ articleId, locale: "en", parentId: null, body: "First with notices.", displayName: "Ada", actor, notifications: preference });
    const before = await count("SELECT count(*) AS n FROM comments");
    // The same subscription id again breaks its primary key in the middle of the batch.
    await expectCode(
      repository.create({ articleId, locale: "en", parentId: null, body: "Second with notices.", displayName: "Ada", actor, notifications: preference }),
      "storage_error",
    );
    expect(await count("SELECT count(*) AS n FROM comments")).toBe(before);
    expect(await count("SELECT hits AS n FROM comment_rate_limits WHERE identity_hash = ? AND action = 'create_actor'", actor.actorRateHash)).toBe(1);

    await expectCode(
      repository.create({ articleId, locale: "en", parentId: null, body: "Bad email here.", displayName: "Ada", actor: guest(), notifications: { ...notificationPreference(), email: "nope" } }),
      "invalid_request",
    );
  });
});

describe("D1CommentRepository own comments", () => {
  it("lists the guest's own pending and rejected comments with their windows, and nobody else's", async () => {
    const article = await seedPublishedArticle(database);
    const owner = guest();
    const mine = await createComment(owner, { articleId: article });
    await createComment(guest(), { articleId: article });
    const query = { articleId: article, locale: "en", parentId: null, cursor: null, limit: 12, actor: owner } as const;

    const own = await repository.listOwn(query);
    expect(own.items).toHaveLength(1);
    expect(own.items[0]).toMatchObject({ id: mine.id, status: "pending", canEdit: true, canDelete: true });
    await backdate(mine.id, 20 * 60);
    expect((await repository.listOwn(query)).items[0]).toMatchObject({ canEdit: false, canDelete: true });
    await repository.moderate({ id: mine.id, status: "rejected", reason: "Off topic.", actor: moderator });
    expect((await repository.listOwn(query)).items[0]).toMatchObject({ status: "rejected", canEdit: false, canDelete: false });
    await repository.moderate({ id: mine.id, status: "spam", reason: "Spam link.", actor: moderator });
    expect((await repository.listOwn(query)).items).toEqual([]);
  });

  it("matches an authenticated author by user id, and a migrated guest by the owner hash", async () => {
    const article = await seedPublishedArticle(database);
    const user = member();
    const mine = await createComment(user, { articleId: article });
    const query = { articleId: article, locale: "en", parentId: null, cursor: null, limit: 12 } as const;
    expect((await repository.listOwn({ ...query, actor: user })).items.map((item) => item.id)).toEqual([mine.id]);
    expect((await repository.listOwn({ ...query, actor: member() })).items).toEqual([]);

    const owner = guest();
    const guestComment = await createComment(owner, { articleId: article });
    const signedIn: CommentActor = { ...member(), guestOwnerHash: owner.guestOwnerHash } as CommentActor;
    expect((await repository.listOwn({ ...query, actor: signedIn })).items.map((item) => item.id)).toContain(guestComment.id);
    await expectCode(repository.listOwn({ ...query, actor: { ...owner, guestOwnerHash: hex("a") } as CommentActor }), "invalid_request");
  });

  it("edits inside the window: back to pending, edited_at set, audit appended, windows enforced", async () => {
    const owner = guest();
    const created = await createComment(owner, { body: "Original wording." });
    await approve(created.id);
    const edited = await repository.editOwn({ id: created.id, body: "Better wording.", displayName: "Ada L.", actor: owner });
    expect(edited).toMatchObject({ id: created.id, body: "Better wording.", displayName: "Ada L.", status: "pending" });
    const row = await database.prepare("SELECT status, edited_at FROM comments WHERE id = ?").bind(created.id).first<{ status: string; edited_at: string | null }>();
    expect(row).toMatchObject({ status: "pending" });
    expect(row!.edited_at).not.toBeNull();
    expect((await repository.listAudit({ beforeId: null, limit: 50 })).items.find((event) => event.commentId === created.id && event.action === "edited"))
      .toMatchObject({ previousStatus: "approved", nextStatus: "pending" });

    await expectCode(repository.editOwn({ id: created.id, body: "Not mine to edit.", displayName: "Eve", actor: guest() }), "operation_not_allowed");
    await expectCode(repository.editOwn({ id: crypto.randomUUID(), body: "Nothing here.", displayName: "Ada", actor: owner }), "not_found");
    await expectCode(repository.editOwn({ id: created.id, body: "x", displayName: "Ada", actor: owner }), "invalid_request");
    await backdate(created.id, 16 * 60);
    await expectCode(repository.editOwn({ id: created.id, body: "Too late now.", displayName: "Ada", actor: owner }), "operation_not_allowed");
  });

  it("limits edits to 10 per actor and hour", async () => {
    const owner = guest();
    const created = await createComment(owner);
    for (let index = 0; index < 10; index += 1) {
      await repository.editOwn({ id: created.id, body: `Revision ${index}.`, displayName: "Ada", actor: owner });
    }
    await expectCode(repository.editOwn({ id: created.id, body: "Revision eleven.", displayName: "Ada", actor: owner }), "rate_limited");
    expect((await database.prepare("SELECT body FROM comments WHERE id = ?").bind(created.id).first<{ body: string }>())!.body).toBe("Revision 9.");
  });

  it("deletes inside 24 hours: tombstone, subscription ended, queued notifications cancelled, audit appended", async () => {
    const owner = guest();
    const preference = notificationPreference();
    const created = await repository.create({
      articleId, locale: "en", parentId: null, body: "Soon to be gone.", displayName: "Ada", actor: owner, notifications: preference,
    });
    await repository.deleteOwn(created.id, owner);
    expect(await database.prepare("SELECT body, author_display_name, status, deleted_at FROM comments WHERE id = ?").bind(created.id).first())
      .toMatchObject({ body: "[deleted]", author_display_name: "Deleted user", status: "deleted" });
    expect((await database.prepare("SELECT unsubscribed_at FROM comment_notification_subscriptions WHERE id = ?").bind(preference.subscriptionId).first<{ unsubscribed_at: string | null }>())!.unsubscribed_at).not.toBeNull();
    expect((await database.prepare("SELECT status FROM comment_notifications WHERE subscription_id = ?").bind(preference.subscriptionId).first<{ status: string }>())!.status).toBe("cancelled");
    expect((await repository.listAudit({ beforeId: null, limit: 50 })).items.find((event) => event.commentId === created.id && event.action === "owner_deleted"))
      .toMatchObject({ previousStatus: "pending", nextStatus: "deleted" });

    await expectCode(repository.deleteOwn(created.id, owner), "operation_not_allowed");
    const old = await createComment(owner);
    await backdate(old.id, 25 * 60 * 60);
    await expectCode(repository.deleteOwn(old.id, owner), "operation_not_allowed");
    await expectCode(repository.deleteOwn(crypto.randomUUID(), owner), "not_found");
  });
});

describe("D1CommentRepository reports", () => {
  it("reports an approved comment once per reporter, counts it for moderation, and resolves it on moderation", async () => {
    const author = guest();
    const created = await createComment(author);
    await expectCode(repository.report({ commentId: created.id, reason: "spam", details: null, actor: guest() }), "not_found");
    await approve(created.id);
    const reporter = guest();
    await repository.report({ commentId: created.id, reason: "harassment", details: "  rude  ", actor: reporter });
    expect(await repository.listReports(created.id)).toMatchObject([{ commentId: created.id, reason: "harassment", details: "rude", status: "open" }]);

    const queue = await repository.listModeration({ status: "approved", locale: "en", cursor: null, limit: 60 });
    expect(queue.items.find((item) => item.id === created.id)).toMatchObject({ reportCount: 1, authorKind: "guest" });

    const before = await count("SELECT count(*) AS n FROM comment_moderation_audit WHERE comment_id = ? AND action = 'reported'", created.id);
    const hitsBefore = await count("SELECT hits AS n FROM comment_rate_limits WHERE identity_hash = ? AND action = 'report_actor'", reporter.actorRateHash);
    await expectCode(repository.report({ commentId: created.id, reason: "spam", details: null, actor: { ...reporter } }), "already_reported");
    expect(await count("SELECT count(*) AS n FROM comment_moderation_audit WHERE comment_id = ? AND action = 'reported'", created.id)).toBe(before);
    expect(await count("SELECT hits AS n FROM comment_rate_limits WHERE identity_hash = ? AND action = 'report_actor'", reporter.actorRateHash)).toBe(hitsBefore);

    await repository.report({ commentId: created.id, reason: "spam", details: null, actor: member() });
    await expectCode(repository.report({ commentId: created.id, reason: "spam", details: null, actor: author }), "operation_not_allowed");
    await expectCode(repository.report({ commentId: created.id, reason: "nonsense" as never, details: null, actor: guest() }), "invalid_request");

    await repository.moderate({ id: created.id, status: "rejected", reason: "Confirmed by reports.", actor: moderator });
    expect((await repository.listReports(created.id)).every((report) => report.status === "resolved")).toBe(true);
    expect((await repository.listModeration({ status: "rejected", locale: null, cursor: null, limit: 60 })).items.find((item) => item.id === created.id)?.reportCount).toBe(0);
  });

  it("limits a reporter to 10 reports per hour", async () => {
    const reporter = guest();
    for (let index = 0; index < 10; index += 1) {
      const created = await createComment(guest());
      await approve(created.id);
      await repository.report({ commentId: created.id, reason: "spam", details: null, actor: reporter });
    }
    const extra = await createComment(guest());
    await approve(extra.id);
    await expectCode(repository.report({ commentId: extra.id, reason: "spam", details: null, actor: reporter }), "rate_limited");
    expect(await repository.listReports(extra.id)).toEqual([]);
  });
});

describe("D1CommentRepository moderation", () => {
  it("applies statuses with an audit trail, blocks deleted comments and approving under an unapproved parent", async () => {
    const root = await createComment(guest());
    await approve(root.id);
    const reply = await createComment(guest(), { parentId: root.id });
    await repository.moderate({ id: root.id, status: "rejected", reason: "Rejected for now.", actor: moderator });
    await expectCode(repository.moderate({ id: reply.id, status: "approved", reason: "Parent is gone.", actor: moderator }), "operation_not_allowed");
    await approve(root.id);
    await approve(reply.id);

    await repository.moderate({ id: reply.id, status: "deleted", reason: "Removed by moderator.", actor: { kind: "system", userId: null, label: "auto-moderation" } });
    expect(await database.prepare("SELECT body, author_display_name, status, deleted_at FROM comments WHERE id = ?").bind(reply.id).first())
      .toMatchObject({ body: "[deleted]", author_display_name: "Deleted user", status: "deleted" });
    await expectCode(repository.moderate({ id: reply.id, status: "approved", reason: "Undo that please.", actor: moderator }), "operation_not_allowed");
    await expectCode(repository.moderate({ id: crypto.randomUUID(), status: "approved", reason: "Missing comment.", actor: moderator }), "not_found");
    await expectCode(repository.moderate({ id: root.id, status: "spam", reason: "x", actor: moderator }), "invalid_request");
    await expectCode(repository.moderate({ id: root.id, status: "spam", reason: "Bad system actor.", actor: { kind: "system", userId: null, label: "no spaces allowed" } }), "operation_not_allowed");

    const events = (await repository.listAudit({ beforeId: null, limit: 100 })).items.filter((event) => event.commentId === reply.id);
    expect(events.map((event) => event.action)).toEqual(["moderator_deleted", "approved", "created"]);
    expect(events[0]).toMatchObject({ actorKind: "system", actorLabel: "auto-moderation", previousStatus: "approved", nextStatus: "deleted", reason: "Removed by moderator." });
    expect(events[1]).toMatchObject({ actorKind: "moderator", actorLabel: null });
  });

  it("reads one comment as the queue shows it, with its open reports, and nothing for an unknown id", async () => {
    const created = await createComment(guest(), { body: "A remark that gets reported." });
    await approve(created.id);
    await repository.report({ commentId: created.id, reason: "spam", details: "Looks like an advert.", actor: guest() });

    expect(await repository.getModeration(created.id)).toMatchObject({
      id: created.id, articleId, locale: "en", parentId: null, body: "A remark that gets reported.", displayName: "Ada",
      authorKind: "guest", status: "approved", reportCount: 1, editedAt: null,
    });
    expect(await repository.getModeration(crypto.randomUUID())).toBeNull();
  });

  describe("several comments at once", () => {
    const statusOf = async (id: string) =>
      (await database.prepare("SELECT status FROM comments WHERE id = ?").bind(id).first<{ status: string }>())!.status;
    const auditOf = (id: string) => count("SELECT count(*) AS n FROM comment_moderation_audit WHERE comment_id = ?", id);

    it("gives every comment the status, with its own audit row and its reports resolved", async () => {
      const first = await createComment(guest(), { body: "First remark of the batch." });
      const second = await createComment(guest(), { body: "Second remark of the batch." });
      await approve(second.id);
      await repository.report({ commentId: second.id, reason: "spam", details: null, actor: guest() });
      const before = [await auditOf(first.id), await auditOf(second.id)];

      await repository.moderateMany({ ids: [first.id, second.id], status: "spam", reason: "Advertising.", actor: moderator });

      expect([await statusOf(first.id), await statusOf(second.id)]).toEqual(["spam", "spam"]);
      expect([await auditOf(first.id), await auditOf(second.id)]).toEqual([before[0] + 1, before[1] + 1]);
      const events = (await repository.listAudit({ beforeId: null, limit: 100 })).items.filter((event) => event.commentId === second.id);
      expect(events[0]).toMatchObject({ action: "marked_spam", previousStatus: "approved", nextStatus: "spam", reason: "Advertising.", actorKind: "moderator" });
      expect(await count("SELECT count(*) AS n FROM comment_reports WHERE comment_id = ? AND status = 'open'", second.id)).toBe(0);
      expect((await repository.getModeration(second.id))?.reportCount).toBe(0);
    });

    it("tombstones every deleted comment, like a single deletion", async () => {
      const ids = [(await createComment(guest())).id, (await createComment(guest())).id];
      await repository.moderateMany({ ids, status: "deleted", reason: "Removed by moderator.", actor: moderator });
      for (const id of ids) {
        expect(await database.prepare("SELECT body, author_display_name, status FROM comments WHERE id = ?").bind(id).first())
          .toMatchObject({ body: "[deleted]", author_display_name: "Deleted user", status: "deleted" });
      }
    });

    it("changes nothing when one comment cannot take the status any more: no status, no audit row", async () => {
      const kept = await createComment(guest(), { body: "Stays pending." });
      const gone = await createComment(guest(), { body: "Deleted meanwhile." });
      await repository.moderate({ id: gone.id, status: "deleted", reason: "Removed already.", actor: moderator });
      const audits = [await auditOf(kept.id), await auditOf(gone.id)];

      // The service checks first; this is the repository's own guard for a change that raced it.
      await expectCode(repository.moderateMany({ ids: [kept.id, gone.id], status: "spam", reason: "Advertising.", actor: moderator }), "operation_not_allowed");
      expect(await statusOf(kept.id)).toBe("pending");
      expect(await statusOf(gone.id)).toBe("deleted");
      expect([await auditOf(kept.id), await auditOf(gone.id)]).toEqual(audits);
    });

    it("approves a reply only under a parent that is approved before the batch, and leaves the parent alone otherwise", async () => {
      const parent = await createComment(guest(), { body: "A parent that is approved first." });
      await approve(parent.id);
      const reply = await createComment(guest(), { parentId: parent.id, body: "A reply to it." });
      await repository.moderate({ id: parent.id, status: "rejected", reason: "Changed my mind.", actor: moderator });
      await expectCode(repository.moderateMany({ ids: [reply.id], status: "approved", reason: "Fine.", actor: moderator }), "operation_not_allowed");
      await expectCode(repository.moderateMany({ ids: [parent.id, reply.id], status: "approved", reason: "Both fine.", actor: moderator }), "operation_not_allowed");
      expect([await statusOf(parent.id), await statusOf(reply.id)]).toEqual(["rejected", "pending"]);

      await approve(parent.id);
      await repository.moderateMany({ ids: [reply.id], status: "approved", reason: "Fine.", actor: moderator });
      expect(await statusOf(reply.id)).toBe("approved");
      // Rejecting the parent and the reply together does not depend on either.
      await repository.moderateMany({ ids: [parent.id, reply.id], status: "rejected", reason: "Off topic.", actor: moderator });
      expect([await statusOf(parent.id), await statusOf(reply.id)]).toEqual(["rejected", "rejected"]);
    });

    it("reports an unknown id before it writes anything, and checks the reason and the actor like a single change", async () => {
      const existing = await createComment(guest());
      await expectCode(repository.moderateMany({ ids: [existing.id, crypto.randomUUID()], status: "spam", reason: "Advertising.", actor: moderator }), "not_found");
      await expectCode(repository.moderateMany({ ids: [existing.id], status: "spam", reason: "x", actor: moderator }), "invalid_request");
      await expectCode(repository.moderateMany({ ids: [existing.id], status: "spam", reason: "Bad actor.", actor: { kind: "system", userId: null, label: "no spaces allowed" } }), "operation_not_allowed");
      expect(await statusOf(existing.id)).toBe("pending");
    });
  });

  it("queues moderation and reply notifications once for verified subscribers, never for the same author", async () => {
    const parentPreference = notificationPreference();
    const parentAuthor = guest();
    const parent = await repository.create({ articleId, locale: "en", parentId: null, body: "Parent with notices.", displayName: "Ada", actor: parentAuthor, notifications: parentPreference });
    await repository.moderate({ id: parent.id, status: "approved", reason: "Fine by me.", actor: moderator });
    expect(await count("SELECT count(*) AS n FROM comment_notifications WHERE comment_id = ? AND kind = 'moderation'", parent.id)).toBe(0);

    const token = parentPreference.verificationTokenHash;
    await repository.verifyNotificationSubscription(parentPreference.subscriptionId, token);
    await repository.moderate({ id: parent.id, status: "spam", reason: "Looked like spam.", actor: moderator });
    await repository.moderate({ id: parent.id, status: "approved", reason: "False alarm here.", actor: moderator });
    await repository.moderate({ id: parent.id, status: "approved", reason: "Approved again.", actor: moderator });
    const moderationRows = await database
      .prepare("SELECT dedupe_key, payload FROM comment_notifications WHERE comment_id = ? AND kind = 'moderation' ORDER BY created_at")
      .bind(parent.id)
      .all<{ dedupe_key: string; payload: string }>();
    expect(moderationRows.results.map((row) => JSON.parse(row.payload).status)).toEqual(["spam", "approved"]);
    expect(new Set(moderationRows.results.map((row) => row.dedupe_key)).size).toBe(2);

    const reply = await createComment(guest(), { parentId: parent.id });
    await approve(reply.id);
    await approve(reply.id);
    const replyNotices = await database
      .prepare("SELECT dedupe_key, payload, recipient_email FROM comment_notifications WHERE kind = 'reply' AND subscription_id = ?")
      .bind(parentPreference.subscriptionId)
      .all<{ dedupe_key: string; payload: string; recipient_email: string }>();
    expect(replyNotices.results).toHaveLength(1);
    expect(replyNotices.results[0]).toMatchObject({ dedupe_key: `comment-reply:${reply.id}:${parentPreference.subscriptionId}`, recipient_email: "reader@example.com" });
    expect(JSON.parse(replyNotices.results[0]!.payload)).toMatchObject({ commentId: reply.id, parentId: parent.id });

    const selfReply = await createComment(parentAuthor, { parentId: parent.id });
    await approve(selfReply.id);
    expect(await count("SELECT count(*) AS n FROM comment_notifications WHERE kind = 'reply' AND comment_id = ?", selfReply.id)).toBe(0);
  });

  it("keeps the audit trail append-only, but lets a deleted article cascade its comments", async () => {
    const article = await seedPublishedArticle(database);
    const created = await createComment(guest(), { articleId: article });
    await expect(database.prepare("UPDATE comment_moderation_audit SET action = 'approved' WHERE comment_id = ?").bind(created.id).run()).rejects.toThrow(/append_only/);
    await expect(database.prepare("DELETE FROM comment_moderation_audit WHERE comment_id = ?").bind(created.id).run()).rejects.toThrow(/append_only/);

    await database.prepare("DELETE FROM articles WHERE id = ?").bind(article).run();
    expect(await count("SELECT count(*) AS n FROM comments WHERE id = ?", created.id)).toBe(0);
    expect(await count("SELECT count(*) AS n FROM comment_moderation_audit WHERE comment_id IS NULL AND action = 'created'")).toBeGreaterThan(0);
  });

  it("pages the moderation queue and the audit newest first", async () => {
    const article = await seedPublishedArticle(database);
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) ids.push((await createComment(guest(), { articleId: article, body: `Queued remark ${index}.` })).id);
    expect(await repository.countByStatus("pending")).toBe(await count("SELECT count(*) AS n FROM comments WHERE status = 'pending'"));
    expect(await repository.countByStatus("pending")).toBeGreaterThanOrEqual(3);
    const first = await repository.listModeration({ status: "pending", locale: "en", cursor: null, limit: 2 });
    expect(first.items).toHaveLength(2);
    const second = await repository.listModeration({ status: "pending", locale: "en", cursor: decodeCommentCursor(first.nextCursor!), limit: 2 });
    const queued = [...first.items, ...second.items].filter((item) => item.articleId === article).map((item) => item.id);
    expect(queued).toEqual([...ids].reverse());

    const page = await repository.listAudit({ beforeId: null, limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.items[0]!.id).toBeGreaterThan(page.items[1]!.id);
    const older = await repository.listAudit({ beforeId: decodeAuditCursor(page.nextCursor!), limit: 2 });
    expect(older.items[0]!.id).toBeLessThan(page.items[1]!.id);
  });
});

describe("D1CommentRepository notification subscriptions", () => {
  it("verifies once with the right token before expiry, and unsubscribing cancels queued mail", async () => {
    const preference = notificationPreference();
    await repository.create({ articleId, locale: "en", parentId: null, body: "Subscribed remark.", displayName: "Ada", actor: guest(), notifications: preference });
    await expectCode(repository.verifyNotificationSubscription(preference.subscriptionId, unique()), "notification_token_invalid");
    await expectCode(repository.verifyNotificationSubscription(crypto.randomUUID(), preference.verificationTokenHash), "notification_token_invalid");
    await repository.verifyNotificationSubscription(preference.subscriptionId, preference.verificationTokenHash);
    await repository.verifyNotificationSubscription(preference.subscriptionId, preference.verificationTokenHash);

    await expectCode(repository.unsubscribeNotificationSubscription(preference.subscriptionId, unique()), "notification_token_invalid");
    expect((await database.prepare("SELECT status FROM comment_notifications WHERE subscription_id = ?").bind(preference.subscriptionId).first<{ status: string }>())!.status).toBe("pending");
    await repository.unsubscribeNotificationSubscription(preference.subscriptionId, preference.verificationTokenHash);
    await repository.unsubscribeNotificationSubscription(preference.subscriptionId, preference.verificationTokenHash);
    expect((await database.prepare("SELECT status FROM comment_notifications WHERE subscription_id = ?").bind(preference.subscriptionId).first<{ status: string }>())!.status).toBe("cancelled");
    await expectCode(repository.verifyNotificationSubscription(preference.subscriptionId, preference.verificationTokenHash), "notification_token_invalid");
  });

  it("refuses an expired verification link", async () => {
    const preference = notificationPreference();
    await repository.create({ articleId, locale: "en", parentId: null, body: "Slow to verify.", displayName: "Ada", actor: guest(), notifications: preference });
    await database
      .prepare("UPDATE comment_notification_subscriptions SET verification_expires_at = ? WHERE id = ?")
      .bind(new Date(Date.now() - 1_000).toISOString(), preference.subscriptionId)
      .run();
    await expectCode(repository.verifyNotificationSubscription(preference.subscriptionId, preference.verificationTokenHash), "notification_token_invalid");
  });
});
