import { describe, expect, it, vi } from "vitest";

import { capabilities } from "../catalogue";
import { anonymous, CapabilityFailure, type Principal } from "../capability";
import type { CapabilityPorts } from "../ports";

const moderate = capabilities.find((capability) => capability.name === "admin_moderate_comment")!;
const input = { id: "6f1c2c1e-6a2b-4f7e-9d3e-1a2b3c4d5e6f", status: "spam", reason: "Advertising." } as const;
const scopes = ["newsroom.read", "newsroom.write", "newsroom.publish"] as const;

/** The audit trail names whoever moderated: this is what the comment service is handed. */
async function actorOf(principal: Principal) {
  const service = { moderate: vi.fn(async () => undefined) };
  const ports = { moderation: async () => service } as unknown as CapabilityPorts;
  await moderate.run(ports, moderate.input.parse(input), principal);
  return (service.moderate.mock.calls[0] as unknown as [{ actor: unknown }])[0].actor;
}

describe("comment moderation audit actor", () => {
  it("is the signed-in editor as a user, the same on the Studio, MCP and the page", async () => {
    const editor: Principal = { kind: "editor", subject: "11111111-1111-4111-8111-111111111111", scopes, authorId: "author-1" };
    expect(await actorOf(editor)).toEqual({ kind: "user", userId: editor.subject, label: null });
  });

  it("stays a system actor with its label for the shared API key, which names no person", async () => {
    expect(await actorOf({ kind: "editor", subject: "mcp-admin", scopes })).toEqual({
      kind: "system",
      userId: null,
      label: "mcp-admin",
    });
    expect(await actorOf(anonymous)).toEqual({ kind: "system", userId: null, label: "anonymous" });
  });
});

describe("comment moderation capabilities", () => {
  const find = (name: string) => capabilities.find((capability) => capability.name === name)!;
  const editor: Principal = { kind: "editor", subject: "11111111-1111-4111-8111-111111111111", scopes, authorId: "author-1" };
  const other = "7f1c2c1e-6a2b-4f7e-9d3e-1a2b3c4d5e6f";
  const queued = {
    id: input.id, articleId: other, locale: "en", parentId: null, body: "Buy now", displayName: "Eve", authorKind: "guest",
    status: "pending", reportCount: 2, createdAt: "2026-10-11T10:00:00.000Z", updatedAt: "2026-10-11T10:00:00.000Z", editedAt: null,
  } as const;

  it("reads one comment as the queue shows it, or says it does not exist", async () => {
    const get = find("admin_get_comment");
    const found = { getModeration: vi.fn(async () => queued) };
    const result = get.output.parse(await get.run({ moderation: async () => found } as unknown as CapabilityPorts, get.input.parse({ id: input.id }), editor));
    expect(result).toMatchObject({ comment: { id: input.id, reportCount: 2 }, contentTrust: { source: "anonymous-visitors" } });
    expect(found.getModeration).toHaveBeenCalledWith(input.id);

    const empty = { getModeration: async () => null };
    await expect(get.run({ moderation: async () => empty } as unknown as CapabilityPorts, get.input.parse({ id: input.id }), editor))
      .rejects.toEqual(new CapabilityFailure("Comment not found."));
  });

  it("moderates several comments with one status and one reason, as the signed-in editor", async () => {
    const batch = find("admin_moderate_comments");
    const service = { moderateMany: vi.fn(async () => undefined) };
    const ports = { moderation: async () => service } as unknown as CapabilityPorts;
    const parsed = batch.input.parse({ ids: [input.id, other], status: "spam", reason: "Advertising." });
    const result = batch.output.parse(await batch.run(ports, parsed, editor));
    expect(result).toEqual({
      count: 2,
      items: [
        { index: 0, action: "moderated", id: input.id, status: "spam" },
        { index: 1, action: "moderated", id: other, status: "spam" },
      ],
    });
    expect(service.moderateMany).toHaveBeenCalledWith({
      ids: [input.id, other], status: "spam", reason: "Advertising.", actor: { kind: "user", userId: editor.subject, label: null },
    });
    expect(await batch.confirmation!.question(parsed, ports)).toBe("Mark 2 comments as spam?");
    expect(batch.description).toContain("All or nothing");
  });
});
