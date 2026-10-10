import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  requireEditor: vi.fn(async () => ({ userId: "editor-1" })),
  runEditorCapability: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/editor-auth", () => ({ requireEditor: mocks.requireEditor }));
vi.mock("@/server/capabilities", () => ({ runEditorCapability: mocks.runEditorCapability }));

import { deleteEntityAction, saveEntityAction, type EntityFormState } from "./actions";

const idle: EntityFormState = { status: "idle" };

const stored = {
  id: "entity-1",
  kind: "model",
  slug: "claude-haiku",
  name: "Claude Haiku",
  officialUrl: "https://www.anthropic.com/claude",
  parent: { slug: "anthropic", name: "Anthropic" },
  descriptions: { en: "Small and fast.", it: "Piccolo e veloce." },
};

function entityForm(fields: Record<string, string> = {}) {
  const form = new FormData();
  const values: Record<string, string> = {
    locale: "en",
    name: "Claude Haiku",
    kind: "model",
    parentSlug: "anthropic",
    officialUrl: "https://www.anthropic.com/claude",
    descriptionEn: "Small and fast.",
    descriptionIt: "Piccolo e veloce.",
    ...fields,
  };
  for (const [name, value] of Object.entries(values)) form.set(name, value);
  return form;
}

describe("Studio entity actions use the editor capabilities", () => {
  beforeEach(() => {
    mocks.revalidatePath.mockClear();
    mocks.redirect.mockClear();
    mocks.requireEditor.mockClear();
    mocks.runEditorCapability.mockReset();
  });

  it("creates an entity with only the fields that have a value", async () => {
    mocks.runEditorCapability.mockResolvedValue({ ok: true, result: { entity: stored } });

    await expect(
      saveEntityAction(idle, entityForm({ name: "  Claude Haiku  ", descriptionIt: "" })),
    ).rejects.toThrow("REDIRECT:/en/studio/entities?saved=created");

    expect(mocks.runEditorCapability).toHaveBeenCalledWith("admin_create_entity", {
      kind: "model",
      name: "Claude Haiku",
      officialUrl: "https://www.anthropic.com/claude",
      parentSlug: "anthropic",
      descriptions: { en: "Small and fast." },
    });
  });

  it("drops the parent when the new entity is a company", async () => {
    mocks.runEditorCapability.mockResolvedValue({ ok: true, result: { entity: stored } });

    await expect(
      saveEntityAction(idle, entityForm({ kind: "company", name: "Anthropic", officialUrl: "", descriptionEn: "", descriptionIt: "" })),
    ).rejects.toThrow("REDIRECT:/en/studio/entities?saved=created");

    expect(mocks.runEditorCapability).toHaveBeenCalledWith("admin_create_entity", {
      kind: "company",
      name: "Anthropic",
    });
  });

  it("updates only the changed fields and sends null for the cleared ones", async () => {
    mocks.runEditorCapability.mockResolvedValue({ ok: true, result: { entity: stored } });

    await expect(
      saveEntityAction(idle, entityForm({
        slug: "claude-haiku",
        officialUrl: "",
        descriptionEn: "Small and fast, now.",
        descriptionIt: "",
      })),
    ).rejects.toThrow("REDIRECT:/en/studio/entities?saved=updated");

    expect(mocks.runEditorCapability).toHaveBeenCalledWith("admin_update_entity", {
      slug: "claude-haiku",
      officialUrl: null,
      descriptions: { en: "Small and fast, now.", it: null },
    });
  });

  it("does not call the update when nothing changed", async () => {
    mocks.runEditorCapability.mockResolvedValue({ ok: true, result: { entity: stored } });

    await expect(
      saveEntityAction(idle, entityForm({ slug: "claude-haiku" })),
    ).rejects.toThrow("REDIRECT:/en/studio/entities?saved=updated");

    expect(mocks.runEditorCapability).not.toHaveBeenCalledWith("admin_update_entity", expect.anything());
  });

  it("returns a refusal to the form with the typed values kept", async () => {
    const typedName = "x".repeat(130);
    mocks.runEditorCapability.mockResolvedValue({ ok: false, status: 400, error: "Name is too long." });

    const state = await saveEntityAction(idle, entityForm({ name: typedName, officialUrl: "", parentSlug: "" }));

    expect(state).toEqual({
      status: "error",
      message: "Name is too long.",
      values: {
        name: typedName,
        kind: "model",
        parentSlug: "",
        officialUrl: "",
        descriptionEn: "Small and fast.",
        descriptionIt: "Piccolo e veloce.",
      },
      attempt: 1,
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects to login when nobody is signed in", async () => {
    mocks.runEditorCapability.mockResolvedValue({ ok: false, status: 401, error: "Sign in first." });

    await expect(saveEntityAction(idle, entityForm({ locale: "it" }))).rejects.toThrow("REDIRECT:/it/login");
  });

  it("deletes with the person's confirmation recorded", async () => {
    mocks.runEditorCapability.mockResolvedValue({ ok: true, result: { deletedSlug: "claude-haiku" } });
    const form = new FormData();
    form.set("locale", "en");
    form.set("slug", "claude-haiku");

    await expect(deleteEntityAction(idle, form)).rejects.toThrow("REDIRECT:/en/studio/entities?deleted=1");

    expect(mocks.runEditorCapability).toHaveBeenCalledWith(
      "admin_delete_entity",
      { slug: "claude-haiku" },
      { confirmed: true },
    );
  });

  it("returns the capability's refusal to a delete", async () => {
    mocks.runEditorCapability.mockResolvedValue({
      ok: false,
      status: 400,
      error: "Stories still link this entity.",
    });
    const form = new FormData();
    form.set("locale", "en");
    form.set("slug", "claude-haiku");

    await expect(deleteEntityAction(idle, form)).resolves.toEqual({
      status: "error",
      message: "Stories still link this entity.",
    });
  });
});
