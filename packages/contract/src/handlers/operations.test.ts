import { describe, expect, it, vi } from "vitest";

import { capabilities } from "../catalogue";
import { anonymous, type Principal } from "../capability";
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
