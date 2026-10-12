import { describe, expect, it, vi } from "vitest";

import { BatchValidationError, EditorialRuleError } from "../../editorial/domain/errors";
import type { ModerationActor, ModerationComment } from "../domain/comment";
import type { CommentRepository } from "./comment-repository";
import { CommentService } from "./comment-service";

const actor: ModerationActor = { kind: "system", userId: null, label: "tester" };
const article = "7f1c2c1e-6a2b-4f7e-9d3e-1a2b3c4d5e6f";
const id = (n: number) => `6f1c2c1e-6a2b-4f7e-9d3e-1a2b3c4d5e${String(n).padStart(2, "0")}`;

function comment(n: number, overrides: Partial<ModerationComment> = {}): ModerationComment {
  return {
    id: id(n), articleId: article, locale: "en", parentId: null, body: "Text", displayName: "Eve", authorKind: "guest",
    status: "pending", reportCount: 0, createdAt: "2026-10-11T10:00:00.000Z", updatedAt: "2026-10-11T10:00:00.000Z", editedAt: null,
    ...overrides,
  };
}

function serviceOver(comments: ModerationComment[]) {
  const moderateMany = vi.fn(async () => undefined);
  const repository = {
    getModeration: async (wanted: string) => comments.find((item) => item.id === wanted) ?? null,
    moderateMany,
  } as unknown as CommentRepository;
  return { service: new CommentService(repository), moderateMany };
}

describe("CommentService.moderateMany", () => {
  it("hands every comment to the repository together", async () => {
    const { service, moderateMany } = serviceOver([comment(1), comment(2, { status: "approved" })]);
    const input = { ids: [id(1), id(2)], status: "spam", reason: "Advertising.", actor } as const;
    await service.moderateMany({ ...input, ids: [...input.ids] });
    expect(moderateMany).toHaveBeenCalledTimes(1);
    expect(moderateMany).toHaveBeenCalledWith(expect.objectContaining({ ids: [id(1), id(2)], status: "spam", reason: "Advertising." }));
  });

  it("writes nothing and names each comment that cannot take the status", async () => {
    const { service, moderateMany } = serviceOver([comment(1), comment(2, { status: "deleted" })]);
    const failure = await service.moderateMany({ ids: [id(1), id(2), id(3)], status: "rejected", reason: "Off topic.", actor }).catch((error) => error);
    expect(failure).toBeInstanceOf(BatchValidationError);
    expect((failure as BatchValidationError).issues).toEqual([
      { index: 1, label: id(2), message: "The comment is deleted and cannot be moderated." },
      { index: 2, label: id(3), message: "Comment not found." },
    ]);
    expect(moderateMany).not.toHaveBeenCalled();
  });

  it("approves a reply only under a parent that is already approved", async () => {
    const parent = comment(1);
    const reply = comment(2, { parentId: parent.id });
    const pending = serviceOver([parent, reply]);
    await expect(pending.service.moderateMany({ ids: [reply.id], status: "approved", reason: "Fine.", actor }))
      .rejects.toThrow("A reply can only be approved under a comment that is approved.");
    expect(pending.moderateMany).not.toHaveBeenCalled();

    const approved = serviceOver([{ ...parent, status: "approved" }, reply]);
    await approved.service.moderateMany({ ids: [reply.id], status: "approved", reason: "Fine.", actor });
    expect(approved.moderateMany).toHaveBeenCalledTimes(1);
    // Rejecting a reply does not depend on its parent.
    await pending.service.moderateMany({ ids: [reply.id], status: "rejected", reason: "No.", actor });
    expect(pending.moderateMany).toHaveBeenCalledTimes(1);
  });

  it("refuses an empty batch, one over the cap and a repeated id", async () => {
    const { service, moderateMany } = serviceOver([comment(1)]);
    const base = { status: "spam", reason: "Advertising.", actor } as const;
    await expect(service.moderateMany({ ...base, ids: [] })).rejects.toBeInstanceOf(EditorialRuleError);
    await expect(service.moderateMany({ ...base, ids: Array.from({ length: 26 }, (_, n) => id(n)) })).rejects.toThrow("at most 25");
    await expect(service.moderateMany({ ...base, ids: [id(1), id(1)] })).rejects.toThrow("also item #0");
    expect(moderateMany).not.toHaveBeenCalled();
  });
});
