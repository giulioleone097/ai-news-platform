import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseCommentRepository } from "./supabase-comment-repository";

vi.mock("server-only", () => ({}));

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
