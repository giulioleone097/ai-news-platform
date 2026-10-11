import { describe, expect, it } from "vitest";

import { MemoryEditorDirectory } from "@atlasnews/adapters/team/memory-editor-directory";
import { scopesForRole } from "@atlasnews/contract";
import { teamMessages, type TeamMember } from "@atlasnews/core/team/domain/team";

import type { AccessTokenVerifier } from "./auth";
import { confirmationKey } from "./confirmation";
import { memoryPorts, modernParams, sendRpc } from "./mcp-test-client";

const tokens: Record<string, { subject: string; role: string }> = {
  "admin-token": { subject: "user-admin", role: "admin" },
  "editor-token": { subject: "user-editor", role: "editor" },
};
const verifier: AccessTokenVerifier = {
  async verify(token) {
    const account = tokens[token];
    return account ? { subject: account.subject, scopes: scopesForRole(account.role) } : null;
  },
};

const member = (id: string, role: TeamMember["role"], userId: string | null = `user-${id}`): TeamMember => ({
  id, email: `${id}@example.com`, role, authorId: `author-${id}`, authorName: id, status: userId ? "active" : "invited", userId,
});

function setup() {
  const directory = new MemoryEditorDirectory([member("admin", "admin"), member("editor", "editor")]);
  const ports = memoryPorts(undefined, undefined, directory);
  const call = async (token: string, name: string, args: Record<string, unknown> = {}, capabilities: Record<string, unknown> = {}) => {
    const { payload } = await sendRpc(
      { jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/call", params: modernParams({ name, arguments: args }, capabilities) },
      undefined,
      { authorization: `Bearer ${token}`, ports, verifier },
    );
    return payload.result;
  };
  return { directory, call };
}

describe("team tools", () => {
  it("are refused to an editor, who lacks newsroom.admin, and change nothing", async () => {
    const { directory, call } = setup();
    for (const [name, args] of [
      ["admin_list_editors", {}],
      ["admin_invite_editor", { email: "new@example.com" }],
      ["admin_update_editor", { id: "editor", role: "admin" }],
      ["admin_remove_editor", { id: "editor", confirm: true }],
    ] as const) {
      const result = await call("editor-token", name, args);
      expect(result.isError, name).toBe(true);
      expect(result.content[0].text, name).toContain("newsroom.admin");
    }
    expect((await directory.list()).map((item) => [item.id, item.role])).toEqual([["admin", "admin"], ["editor", "editor"]]);
  });

  it("let an admin list, invite, change a role and remove, without exposing the sign-in account id", async () => {
    const { directory, call } = setup();

    const listed = await call("admin-token", "admin_list_editors");
    expect(listed.structuredContent.members).toHaveLength(2);
    expect(JSON.stringify(listed.structuredContent)).not.toContain("user-admin");

    const invited = await call("admin-token", "admin_invite_editor", { email: " New.Person@Example.com ", role: "editor", name: "New Person" });
    expect(invited.structuredContent).toMatchObject({
      emailSent: false,
      member: { email: "new.person@example.com", role: "editor", status: "invited", authorName: "New Person" },
    });
    const id = invited.structuredContent.member.id as string;

    const updated = await call("admin-token", "admin_update_editor", { id, role: "admin" });
    expect(updated.structuredContent.member.role).toBe("admin");

    const removed = await call("admin-token", "admin_remove_editor", { id, confirm: true });
    expect(removed.structuredContent).toEqual({ removedId: id, email: "new.person@example.com" });
    expect(await directory.list()).toHaveLength(2);
  });

  it("refuse a rule-breaking call with the rule's message", async () => {
    const { call } = setup();
    expect((await call("admin-token", "admin_invite_editor", { email: "EDITOR@example.com" })).content[0].text).toContain(teamMessages.alreadyMember);
    expect((await call("admin-token", "admin_invite_editor", { email: "nope" })).content[0].text).toContain(teamMessages.invalidEmail);
    expect((await call("admin-token", "admin_update_editor", { id: "admin", role: "editor" })).content[0].text).toContain(teamMessages.lastAdmin);
    expect((await call("admin-token", "admin_remove_editor", { id: "admin", confirm: true })).content[0].text).toContain(teamMessages.removeSelf);
  });

  it("ask before removing, naming the person, and remove nothing without the confirmation", async () => {
    const { directory, call } = setup();
    const withoutConfirm = await call("admin-token", "admin_remove_editor", { id: "editor" });
    expect(withoutConfirm.isError).toBe(true);
    expect(withoutConfirm.content[0].text).toContain("confirm: true");

    const asked = await call("admin-token", "admin_remove_editor", { id: "editor" }, { elicitation: { form: {} } });
    expect(asked.resultType).toBe("input_required");
    expect(asked.inputRequests[confirmationKey].params.message).toContain("editor@example.com");
    expect(await directory.list()).toHaveLength(2);
  });

  it("declare the destructive hint on removal and need only newsroom.admin", async () => {
    const { payload } = await sendRpc({ jsonrpc: "2.0", id: 1, method: "tools/list", params: modernParams() }, undefined, {
      authorization: "Bearer admin-token", verifier,
    });
    const tools = new Map((payload.result.tools as Array<{ name: string; annotations: Record<string, boolean> }>).map((tool) => [tool.name, tool]));
    expect(tools.get("admin_remove_editor")!.annotations.destructiveHint).toBe(true);
    expect(tools.get("admin_list_editors")!.annotations.readOnlyHint).toBe(true);
    expect([...tools.keys()]).toEqual(expect.arrayContaining(["admin_list_editors", "admin_invite_editor", "admin_update_editor", "admin_remove_editor"]));
  });
});
