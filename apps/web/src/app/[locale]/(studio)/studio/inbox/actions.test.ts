import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireEditor: vi.fn(),
  service: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/editor-auth", () => ({ requireEditor: mocks.requireEditor }));
vi.mock("@/server/composition", () => ({ getStudioContactMessageService: mocks.service }));

import { idleStudioActionState } from "@/components/studio/action-state";
import { deleteContactMessageAction, setContactStatusAction } from "./actions";

const id = "6f1c2c1e-6a2b-4f7e-9d3e-1a2b3c4d5e6f";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries({ locale: "en", id, ...fields })) data.set(name, value);
  return data;
}

const service = { setStatus: vi.fn(), delete: vi.fn() };

beforeEach(() => {
  service.setStatus.mockReset().mockResolvedValue(undefined);
  service.delete.mockReset().mockResolvedValue(undefined);
  mocks.service.mockReset().mockResolvedValue(service);
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
    expect(service.setStatus).toHaveBeenCalledWith(id, "handled");
  });

  it("changes nothing and says so when the status or the id is not valid, or the service fails", async () => {
    await expect(setContactStatusAction(form({ status: "deleted" }))).rejects.toThrow("REDIRECT:/en/studio/inbox?error=1");
    await expect(setContactStatusAction(form({ status: "handled", id: "nope" }))).rejects.toThrow("error=1");
    service.setStatus.mockRejectedValue(new Error("unknown id"));
    await expect(setContactStatusAction(form({ status: "archived", locale: "it" }))).rejects.toThrow(
      "REDIRECT:/it/studio/inbox?error=1",
    );
    expect(service.setStatus).toHaveBeenCalledTimes(1);
  });

  it("does not touch the inbox when nobody is signed in", async () => {
    mocks.requireEditor.mockRejectedValue(new Error("REDIRECT:/en/login"));
    await expect(setContactStatusAction(form({ status: "handled" }))).rejects.toThrow("/en/login");
    await expect(deleteContactMessageAction(idleStudioActionState, form({}))).rejects.toThrow("/en/login");
    expect(service.setStatus).not.toHaveBeenCalled();
    expect(service.delete).not.toHaveBeenCalled();
  });

  it("deletes and returns to the list, or reports the failure in the editor's language", async () => {
    await expect(deleteContactMessageAction(idleStudioActionState, form({ filter: "archived" }))).rejects.toThrow(
      "REDIRECT:/en/studio/inbox?status=archived&deleted=1",
    );
    expect(service.delete).toHaveBeenCalledWith(id);

    service.delete.mockRejectedValue(new Error("down"));
    expect(await deleteContactMessageAction(idleStudioActionState, form({ locale: "it" }))).toEqual({
      status: "error",
      message: "Non è stato possibile modificare il messaggio. Riprova.",
    });
  });
});
