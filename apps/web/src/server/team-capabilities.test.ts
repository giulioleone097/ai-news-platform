import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ editor: vi.fn(), signedIn: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/editor-auth", () => ({ getEditorIdentity: mocks.editor, isSignedIn: mocks.signedIn }));
vi.mock("@/lib/editorial-cache", () => ({ invalidatePublicEditorialCache: vi.fn() }));

// The real catalogue, scopes and composition root run, over the demo team (one admin, "demo-editor").
import { getStudioEditorDirectory } from "./composition";
import { runEditorCapability } from "./capabilities";

const identity = (role: string, userId = "demo-editor") => ({ userId, role, author: { id: "author-elena-riva" }, isDemo: true });
const teamTools = [
  ["admin_list_editors", {}],
  ["admin_invite_editor", { email: "someone@example.com" }],
  ["admin_update_editor", { id: "demo-editor", role: "editor" }],
  ["admin_remove_editor", { id: "demo-editor" }],
] as const;

beforeEach(() => {
  vi.stubEnv("ATLASNEWS_CONTENT_MODE", "demo");
  mocks.editor.mockReset().mockResolvedValue(identity("admin"));
  mocks.signedIn.mockReset().mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("team capabilities in the Studio", () => {
  it("answer 403 to an editor, run no handler and hand the editor no directory", async () => {
    mocks.editor.mockResolvedValue(identity("editor", "u-editor"));
    for (const [name, input] of teamTools) {
      const result = await runEditorCapability(name, input, { confirmed: true });
      expect(result, name).toMatchObject({ ok: false, status: 403 });
      expect(result.ok ? "" : result.error, name).toContain("newsroom.admin");
    }
    await expect(getStudioEditorDirectory()).rejects.toThrow("admin");
    // The editor's refused calls changed nothing: the admin still sees one member.
    mocks.editor.mockResolvedValue(identity("admin"));
    const listed = await runEditorCapability("admin_list_editors", {});
    expect(listed).toMatchObject({ ok: true });
    expect(listed.ok && (listed.result.members as Array<{ email: string }>).map((member) => member.email)).toEqual(["demo@atlasnews.example"]);
  });

  it("answer 401 when nobody is signed in and 403 to an account that is not an editor", async () => {
    mocks.editor.mockResolvedValue(null);
    mocks.signedIn.mockResolvedValue(false);
    expect(await runEditorCapability("admin_list_editors", {})).toMatchObject({ ok: false, status: 401 });
    mocks.signedIn.mockResolvedValue(true);
    expect(await runEditorCapability("admin_list_editors", {})).toMatchObject({ ok: false, status: 403 });
  });

  it("let an admin invite, change a role and remove, and keep the team's rules", async () => {
    const invited = await runEditorCapability("admin_invite_editor", { email: "New.Editor@Example.com", name: "New Editor" });
    expect(invited).toMatchObject({ ok: true, result: { emailSent: false, member: { email: "new.editor@example.com", status: "invited" } } });
    const id = invited.ok ? (invited.result.member as { id: string }).id : "";

    expect(await runEditorCapability("admin_invite_editor", { email: "new.editor@example.com" })).toMatchObject({ ok: false, status: 400 });
    expect(await runEditorCapability("admin_update_editor", { id, role: "admin" })).toMatchObject({ ok: true, result: { member: { role: "admin" } } });

    // The signed-in admin ("demo-editor") can neither remove themselves nor leave the team without an admin.
    expect(await runEditorCapability("admin_remove_editor", { id: "demo-editor" }, { confirmed: true })).toMatchObject({ ok: false, status: 400 });
    // Asking first: nothing is removed until the call is confirmed.
    expect(await runEditorCapability("admin_remove_editor", { id })).toMatchObject({ ok: false, status: 409 });
    expect(await runEditorCapability("admin_remove_editor", { id }, { confirmed: true })).toMatchObject({ ok: true, result: { removedId: id } });
  });
});
