import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/capabilities", () => ({ runEditorCapability: mocks.run }));

import { idleStudioActionState } from "@/components/studio/action-state";
import { idleInviteFormState } from "@/components/studio/team/team-state";
import { changeRoleAction, inviteMemberAction, removeMemberAction } from "./actions";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries({ locale: "en", ...fields })) data.set(name, value);
  return data;
}

const refused = (status: 400 | 401 | 403 | 503, error: string) => ({ ok: false, status, error });

beforeEach(() => {
  mocks.run.mockReset().mockResolvedValue({ ok: true, result: { emailSent: false } });
  mocks.redirect.mockClear();
});

describe("Studio team actions", () => {
  it("invites through the capability, leaving out a blank name, and says whether an email went out", async () => {
    await expect(
      inviteMemberAction(idleInviteFormState, form({ email: "mario@example.com", name: "  ", role: "admin" })),
    ).rejects.toThrow("REDIRECT:/en/studio/team?invited=saved");
    expect(mocks.run).toHaveBeenCalledWith("admin_invite_editor", { email: "mario@example.com", role: "admin" }, {});

    mocks.run.mockResolvedValueOnce({ ok: true, result: { emailSent: true } });
    await expect(
      inviteMemberAction(idleInviteFormState, form({ locale: "it", email: "a@b.co", name: "Ada Lovelace", role: "editor" })),
    ).rejects.toThrow("REDIRECT:/it/studio/team?invited=sent");
    expect(mocks.run).toHaveBeenLastCalledWith("admin_invite_editor", { email: "a@b.co", role: "editor", name: "Ada Lovelace" }, {});
  });

  it("treats an unknown role as the editor role, never as admin", async () => {
    await expect(inviteMemberAction(idleInviteFormState, form({ email: "a@b.co", role: "owner" }))).rejects.toThrow("REDIRECT");
    expect(mocks.run).toHaveBeenCalledWith("admin_invite_editor", { email: "a@b.co", role: "editor" }, {});
  });

  it("returns the rule's message to the form with the typed values kept", async () => {
    mocks.run.mockResolvedValueOnce(refused(400, "This email address already belongs to a team member."));
    const state = await inviteMemberAction(idleInviteFormState, form({ email: "a@b.co", name: "Ada", role: "editor" }));
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(state).toEqual({
      status: "error",
      message: "This email address already belongs to a team member.",
      values: { email: "a@b.co", name: "Ada", role: "editor" },
    });
  });

  it("shows an editor who posts the form anyway a plain admins-only message, in their language", async () => {
    for (const [locale, message] of [["en", "Only admins can manage the team."], ["it", "Solo gli admin possono gestire il team."]]) {
      mocks.run.mockResolvedValue(refused(403, "This account lacks the newsroom.admin permission that admin_invite_editor needs."));
      expect(await inviteMemberAction(idleInviteFormState, form({ locale, email: "a@b.co" }))).toMatchObject({ status: "error", message });
      expect(await changeRoleAction(idleStudioActionState, form({ locale, id: "m1", role: "admin" }))).toEqual({ status: "error", message });
      expect(await removeMemberAction(idleStudioActionState, form({ locale, id: "m1" }))).toEqual({ status: "error", message });
    }
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("hides an unexpected failure behind the generic message", async () => {
    mocks.run.mockResolvedValue(refused(503, "The editorial operation could not be completed."));
    expect(await changeRoleAction(idleStudioActionState, form({ id: "m1", role: "admin" }))).toEqual({
      status: "error",
      message: "The role could not be changed. Try again.",
    });
  });

  it("changes a role through admin_update_editor", async () => {
    await expect(changeRoleAction(idleStudioActionState, form({ id: "m1", role: "admin" }))).rejects.toThrow(
      "REDIRECT:/en/studio/team?updated=1",
    );
    expect(mocks.run).toHaveBeenCalledWith("admin_update_editor", { id: "m1", role: "admin" }, {});
  });

  it("removes only with the confirmation flag the page set after asking the person", async () => {
    await expect(removeMemberAction(idleStudioActionState, form({ id: "m1" }))).rejects.toThrow(
      "REDIRECT:/en/studio/team?removed=1",
    );
    expect(mocks.run).toHaveBeenCalledWith("admin_remove_editor", { id: "m1" }, { confirmed: true });
  });

  it("returns a refused removal (self, last admin) to the row", async () => {
    mocks.run.mockResolvedValueOnce(refused(400, "You cannot remove yourself from the team. Ask another admin."));
    expect(await removeMemberAction(idleStudioActionState, form({ id: "m1" }))).toEqual({
      status: "error",
      message: "You cannot remove yourself from the team. Ask another admin.",
    });
  });

  it("sends a signed-out admin to the login page", async () => {
    mocks.run.mockResolvedValueOnce(refused(401, "Sign in to the Studio with an editor account."));
    await expect(removeMemberAction(idleStudioActionState, form({ id: "m1" }))).rejects.toThrow("REDIRECT:/en/login");
  });
});
