import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireEditor: vi.fn(),
  run: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/editor-auth", () => ({ requireEditor: mocks.requireEditor }));
vi.mock("@/server/capabilities", () => ({ runEditorCapability: mocks.run }));

import { idleStudioActionState } from "@/components/studio/action-state";
import { deleteContactMessageAction, setContactStatusAction } from "./actions";

const id = "6f1c2c1e-6a2b-4f7e-9d3e-1a2b3c4d5e6f";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries({ locale: "en", id, ...fields })) data.set(name, value);
  return data;
}

beforeEach(() => {
  mocks.run.mockReset().mockResolvedValue({ ok: true, result: {} });
  mocks.requireEditor.mockReset().mockResolvedValue({ userId: "u1" });
  mocks.redirect.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("Studio inbox actions", () => {
  it("changes the status for a signed-in editor and returns to the filter they were looking at", async () => {
    await expect(setContactStatusAction(form({ status: "handled", filter: "new" }))).rejects.toThrow(
      "REDIRECT:/en/studio/inbox?status=new&updated=1",
    );
    expect(mocks.requireEditor).toHaveBeenCalledWith("en");
    expect(mocks.run).toHaveBeenCalledWith("admin_update_contact_message", { id, status: "handled" }, { confirmed: true, locale: "en" });
  });

  it("says so when the capability refuses (invalid input, missing scope) or fails", async () => {
    mocks.run.mockResolvedValue({ ok: false, status: 400, error: "Invalid arguments for admin_update_contact_message." });
    await expect(setContactStatusAction(form({ status: "deleted" }))).rejects.toThrow("REDIRECT:/en/studio/inbox?error=1");
    mocks.run.mockResolvedValue({ ok: false, status: 403, error: "This account lacks the newsroom.write permission." });
    await expect(setContactStatusAction(form({ status: "handled" }))).rejects.toThrow("error=1");
    mocks.run.mockRejectedValue(new Error("unknown id"));
    await expect(setContactStatusAction(form({ status: "archived", locale: "it" }))).rejects.toThrow(
      "REDIRECT:/it/studio/inbox?error=1",
    );
  });

  it("does not touch the inbox when nobody is signed in", async () => {
    mocks.requireEditor.mockRejectedValue(new Error("REDIRECT:/en/login"));
    await expect(setContactStatusAction(form({ status: "handled" }))).rejects.toThrow("/en/login");
    await expect(deleteContactMessageAction(idleStudioActionState, form({}))).rejects.toThrow("/en/login");
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("deletes and returns to the list, or reports the failure in the editor's language", async () => {
    await expect(deleteContactMessageAction(idleStudioActionState, form({ filter: "archived" }))).rejects.toThrow(
      "REDIRECT:/en/studio/inbox?status=archived&deleted=1",
    );
    expect(mocks.run).toHaveBeenCalledWith("admin_delete_contact_message", { id }, { confirmed: true, locale: "en" });

    mocks.run.mockResolvedValue({ ok: false, status: 503, error: "The contact inbox is not configured." });
    expect(await deleteContactMessageAction(idleStudioActionState, form({ locale: "it" }))).toEqual({
      status: "error",
      message: "Non è stato possibile modificare il messaggio. Riprova.",
    });
  });
});
