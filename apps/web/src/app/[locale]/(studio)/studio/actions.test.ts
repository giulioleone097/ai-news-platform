import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  requireEditor: vi.fn(async () => ({ userId: "editor-1" })),
  save: vi.fn(),
  remove: vi.fn(),
  findById: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/editor-auth", () => ({ requireEditor: mocks.requireEditor }));
vi.mock("@/lib/editorial-cache", () => ({
  articlesCacheTag: "articles",
  invalidatePublicEditorialCache: mocks.invalidate,
}));
vi.mock("@/server/composition", () => ({
  getStudioEditorialRepositories: async () => ({ articles: { findById: mocks.findById } }),
}));
vi.mock("@/server/capabilities", () => ({ runEditorCapability: vi.fn() }));
vi.mock("@atlasnews/core/editorial/application/article-commands", () => ({
  ArticleCommandService: class {
    save = mocks.save;
    delete = mocks.remove;
  },
}));

import { idleStudioActionState } from "@/components/studio/action-state";
import { deleteArticleAction, saveArticleAction } from "./actions";

function articleForm(fields: Record<string, string> = {}) {
  const form = new FormData();
  const values: Record<string, string> = {
    locale: "en",
    title: "A valid story title",
    slug: "a-valid-story",
    excerpt: "An excerpt of more than twenty characters.",
    content: "Body text that is long enough to pass validation.",
    categorySlug: "business",
    status: "published",
    coverAlt: "Cover alt text",
    claimStatus: "analysis",
    ...fields,
  };
  for (const [name, value] of Object.entries(values)) form.set(name, value);
  return form;
}

describe("Studio article actions refresh the public outputs through the shared owner", () => {
  beforeEach(() => {
    mocks.invalidate.mockClear();
    mocks.revalidatePath.mockClear();
    mocks.save.mockReset().mockResolvedValue({ id: "article-1", slug: "a-valid-story" });
    mocks.remove.mockReset().mockResolvedValue(undefined);
    mocks.findById.mockReset().mockResolvedValue({ id: "article-1", slug: "a-valid-story" });
  });

  it("publishes a new story and invalidates its slug", async () => {
    await expect(saveArticleAction(idleStudioActionState, articleForm())).rejects.toThrow(
      "REDIRECT:/en/studio/articles/article-1?saved=1",
    );

    expect(mocks.invalidate).toHaveBeenCalledWith({ locale: "en", slugs: ["a-valid-story"] });
    expect(mocks.revalidatePath.mock.calls).toEqual([["/en/studio"], ["/en/studio/articles"]]);
  });

  it("updates an existing story and invalidates its slug", async () => {
    await expect(
      saveArticleAction(idleStudioActionState, articleForm({ id: "article-1", status: "draft" })),
    ).rejects.toThrow("REDIRECT:/en/studio/articles/article-1?saved=1");

    expect(mocks.invalidate).toHaveBeenCalledWith({ locale: "en", slugs: ["a-valid-story"] });
  });

  it("deletes a story and invalidates its slug", async () => {
    const form = new FormData();
    form.set("id", "article-1");
    form.set("locale", "it");

    await expect(deleteArticleAction(form)).rejects.toThrow("REDIRECT:/it/studio/articles?deleted=1");

    expect(mocks.invalidate).toHaveBeenCalledWith({ locale: "it", slugs: ["a-valid-story"] });
  });
});
