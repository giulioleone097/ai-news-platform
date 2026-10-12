import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseCommentRepository } from "./supabase-comment-repository";

const articleId = "f0d16765-a03d-4c55-9e1c-fd6c6c87557f";
const parentId = "ff768f56-2ac3-4f40-9132-0cb0b86772bd";

describe("SupabaseCommentRepository owner feed", () => {
  it("passes the actor, parent and keyset boundary only to the protected RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        id: "014fb7a4-97db-4566-9200-13bf795c78fd",
        article_id: articleId,
        locale: "en",
        parent_id: parentId,
        body: "Still awaiting review.",
        author_display_name: "Ada",
        created_at: "2026-08-10T09:00:00.000Z",
        edited_at: null,
        reply_count: 0,
        status: "pending",
        edit_until: "2026-08-10T09:15:00.000Z",
        delete_until: "2026-08-11T09:00:00.000Z",
        can_edit: true,
        can_delete: true,
      }],
      error: null,
    });
    const client = { rpc } as unknown as SupabaseClient;
    const repository = new SupabaseCommentRepository(client, client);

    const page = await repository.listOwn({
      articleId,
      locale: "en",
      parentId,
      cursor: { createdAt: "2026-08-10T10:00:00.000Z", id: parentId },
      limit: 12,
      actor: {
        kind: "authenticated",
        userId: "c1bc5fb2-1e4a-447d-b0a6-5481bacf2d35",
        guestHash: null,
        guestOwnerHash: "a".repeat(64),
        actorRateHash: "b".repeat(64),
        networkRateHash: "c".repeat(64),
      },
    });

    expect(rpc).toHaveBeenCalledWith("list_own_comments", {
      p_article_id: articleId,
      p_locale: "en",
      p_parent_id: parentId,
      p_actor_kind: "authenticated",
      p_actor_user_id: "c1bc5fb2-1e4a-447d-b0a6-5481bacf2d35",
      p_guest_identity_hash: null,
      p_owner_guest_identity_hash: "a".repeat(64),
      p_cursor_created_at: "2026-08-10T10:00:00.000Z",
      p_cursor_id: parentId,
      p_limit: 13,
    });
    expect(page).toEqual({
      items: [expect.objectContaining({
        id: "014fb7a4-97db-4566-9200-13bf795c78fd",
        parentId,
        status: "pending",
        canEdit: true,
        canDelete: true,
      })],
      nextCursor: null,
    });
  });
});

describe("SupabaseCommentRepository guest edits", () => {
  it("sends the guest owner hash that edit_own_comment requires", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        id: parentId,
        parent_id: null,
        body: "Edited.",
        author_display_name: "Ada",
        status: "pending",
        created_at: "2026-08-10T09:00:00.000Z",
      }],
      error: null,
    });
    const client = { rpc } as unknown as SupabaseClient;
    const guestHash = "a".repeat(64);

    await new SupabaseCommentRepository(client, client).editOwn({
      id: parentId,
      body: "Edited.",
      displayName: "Ada",
      actor: {
        kind: "guest",
        userId: null,
        guestHash,
        guestOwnerHash: guestHash,
        actorRateHash: "b".repeat(64),
        networkRateHash: "c".repeat(64),
      },
    });

    expect(rpc).toHaveBeenCalledWith("edit_own_comment", expect.objectContaining({
      p_guest_identity_hash: guestHash,
      p_owner_guest_identity_hash: guestHash,
    }));
  });
});

describe("SupabaseCommentRepository moderation reads and batches", () => {
  const row = {
    id: parentId,
    article_id: articleId,
    locale: "en",
    parent_id: null,
    body: "Awaiting review.",
    author_display_name: "Ada",
    author_kind: "guest",
    status: "pending",
    created_at: "2026-08-10T09:00:00.000Z",
    updated_at: "2026-08-10T09:00:00.000Z",
    edited_at: null,
  };

  function clientWith(comment: unknown, openReports: number) {
    const comments = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: comment, error: null }) };
    const reports = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    reports.eq.mockReturnValueOnce(reports).mockResolvedValueOnce({ count: openReports, error: null });
    const from = vi.fn((table: string) => (table === "comments" ? comments : reports));
    return { client: { from } as unknown as SupabaseClient, comments, reports };
  }

  it("reads one comment with the number of its open reports", async () => {
    const { client, comments, reports } = clientWith(row, 2);
    expect(await new SupabaseCommentRepository(client, client).getModeration(parentId)).toEqual({
      id: parentId, articleId, locale: "en", parentId: null, body: "Awaiting review.", displayName: "Ada", authorKind: "guest",
      status: "pending", reportCount: 2, createdAt: row.created_at, updatedAt: row.updated_at, editedAt: null,
    });
    expect(comments.eq).toHaveBeenCalledWith("id", parentId);
    expect(reports.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(reports.eq).toHaveBeenNthCalledWith(1, "comment_id", parentId);
    expect(reports.eq).toHaveBeenNthCalledWith(2, "status", "open");
  });

  it("returns null for an unknown id without asking for reports", async () => {
    const { client, reports } = clientWith(null, 0);
    expect(await new SupabaseCommentRepository(client, client).getModeration(parentId)).toBeNull();
    expect(reports.select).not.toHaveBeenCalled();
  });

  it("moderates several comments with one RPC, so Postgres does it in one transaction", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = { rpc } as unknown as SupabaseClient;
    const moderator = crypto.randomUUID();
    await new SupabaseCommentRepository(client, client).moderateMany({
      ids: [articleId, parentId],
      status: "spam",
      reason: "Advertising.",
      actor: { kind: "user", userId: moderator, label: null },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("moderate_comments_batch", {
      p_comment_ids: [articleId, parentId],
      p_status: "spam",
      p_reason: "Advertising.",
      p_actor_kind: "user",
      p_actor_user_id: moderator,
      p_actor_label: null,
    });
  });

  it("raises the repository error when the batch function refuses", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "comment_not_found", code: "P0002" } });
    const client = { rpc } as unknown as SupabaseClient;
    await expect(new SupabaseCommentRepository(client, client).moderateMany({
      ids: [parentId], status: "spam", reason: "Advertising.", actor: { kind: "system", userId: null, label: "mcp-admin" },
    })).rejects.toBeInstanceOf(Error);
  });
});
