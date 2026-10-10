import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/capabilities", () => ({ runEditorCapability: mocks.run }));

import { idleCategoryActionState } from "@/components/studio/categories/category-form-state";
import { deleteCategoryAction, saveCategoryAction } from "./actions";

const politics = {
  translationKey: "politics",
  position: 2,
  translations: {
    en: { id: "category-en", slug: "politics", name: "Politics", description: "" },
    it: { id: "category-it", slug: "politica", name: "Politica", description: "Notizie" },
  },
};

function categoryForm(fields: Record<string, string> = {}) {
  const form = new FormData();
  const values: Record<string, string> = {
    locale: "en",
    position: "",
    "en.name": "Politics",
    "en.slug": "",
    "en.description": "",
    "it.name": "Politica",
    "it.slug": "",
    "it.description": "",
    ...fields,
  };
  for (const [name, value] of Object.entries(values)) form.set(name, value);
  return form;
}

describe("Studio category actions", () => {
  beforeEach(() => {
    mocks.run.mockReset().mockResolvedValue({ ok: true, result: { category: politics } });
    mocks.revalidatePath.mockClear();
    mocks.redirect.mockClear();
  });

  it("creates a category with both locales, leaving out blank slugs and descriptions", async () => {
    await expect(
      saveCategoryAction(
        idleCategoryActionState,
        categoryForm({ "it.slug": "politica", "it.description": "Notizie" }),
      ),
    ).rejects.toThrow("REDIRECT:/en/studio/categories?saved=1");

    expect(mocks.run).toHaveBeenCalledWith(
      "admin_create_category",
      {
        translations: {
          en: { name: "Politics" },
          it: { name: "Politica", slug: "politica", description: "Notizie" },
        },
      },
      {},
    );
  });

  it("updates only the locales and fields that changed, and the position when it changed", async () => {
    mocks.run
      .mockResolvedValueOnce({ ok: true, result: { category: politics } })
      .mockResolvedValueOnce({ ok: true, result: { category: politics } });

    await expect(
      saveCategoryAction(
        idleCategoryActionState,
        categoryForm({
          translationKey: "politics",
          locale: "en",
          position: "3",
          "en.slug": "politics",
          "en.description": "Stories",
          "it.slug": "politica-italia",
          "it.description": "",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/en/studio/categories?saved=1");

    expect(mocks.run).toHaveBeenNthCalledWith(1, "admin_get_category", { translationKey: "politics" }, {});
    expect(mocks.run).toHaveBeenNthCalledWith(
      2,
      "admin_update_category",
      {
        translationKey: "politics",
        position: 3,
        translations: {
          en: { description: "Stories" },
          it: { slug: "politica-italia", description: "" },
        },
      },
      {},
    );
  });

  it("writes nothing when no field changed", async () => {
    await expect(
      saveCategoryAction(
        idleCategoryActionState,
        categoryForm({
          translationKey: "politics",
          position: "2",
          "en.slug": "politics",
          "it.slug": "politica",
          "it.description": "Notizie",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/en/studio/categories?saved=1");

    expect(mocks.run.mock.calls.map(([name]) => name)).toEqual(["admin_get_category"]);
  });

  it("returns a refused save to the form with the typed values kept", async () => {
    mocks.run.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: "Category name (en) must be 2-80 characters.",
    });
    const form = categoryForm({ "en.name": "P", position: "7" });

    const state = await saveCategoryAction(idleCategoryActionState, form);

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(state).toEqual({
      status: "error",
      message: "Category name (en) must be 2-80 characters.",
      values: {
        position: "7",
        en: { name: "P", slug: "", description: "" },
        it: { name: "Politica", slug: "", description: "" },
      },
    });
  });

  it("sends a signed-out editor to the login page", async () => {
    mocks.run.mockResolvedValueOnce({ ok: false, status: 401, error: "Sign in to continue." });

    await expect(saveCategoryAction(idleCategoryActionState, categoryForm())).rejects.toThrow(
      "REDIRECT:/en/login",
    );
  });

  it("deletes a category only with the confirmation flag and returns to the list", async () => {
    const form = new FormData();
    form.set("locale", "it");
    form.set("translationKey", "politics");

    await expect(deleteCategoryAction(idleCategoryActionState, form)).rejects.toThrow(
      "REDIRECT:/it/studio/categories?deleted=1",
    );

    expect(mocks.run).toHaveBeenCalledWith(
      "admin_delete_category",
      { translationKey: "politics" },
      { confirmed: true },
    );
  });

  it("returns the capability's refusal when a category still has articles", async () => {
    mocks.run.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: "Articles still use this category. Move them first.",
    });
    const form = new FormData();
    form.set("locale", "en");
    form.set("translationKey", "politics");

    const state = await deleteCategoryAction(idleCategoryActionState, form);

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(state).toEqual({
      status: "error",
      message: "Articles still use this category. Move them first.",
    });
  });
});
