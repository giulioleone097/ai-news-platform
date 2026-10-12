import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  requireEditor: vi.fn(async () => ({ userId: "editor-1" })),
  run: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/editor-auth", () => ({ requireEditor: mocks.requireEditor }));
// The article and media actions reach the repositories only through the catalogue's capabilities.
vi.mock("@/server/capabilities", () => ({ runEditorCapability: mocks.run, authorizeEditorCapability: vi.fn() }));
vi.mock("@/server/composition", () => ({}));

import { idleStudioActionState } from "@/components/studio/action-state";
import { deleteArticleAction, deleteMediaAction, saveArticleAction, updateNewsletterSubscriptionAction } from "./actions";

function articleForm(fields: Record<string, string> = {}) {
  const form = new FormData();
  const values: Record<string, string> = {
    locale: "en",
    title: "A valid story title",
    slug: "a-valid-story",
    excerpt: "An excerpt of more than twenty characters.",
    content: "Body text that is long enough to pass validation.",
    categorySlug: "business",
    status: "draft",
    coverAlt: "Cover alt text",
    claimStatus: "analysis",
    ...fields,
  };
  for (const [name, value] of Object.entries(values)) form.set(name, value);
  return form;
}

const saved = (status = "draft") => ({
  ok: true as const,
  result: { article: { id: "article-1", slug: "a-valid-story", status, scheduledFor: null } },
});

const names = () => mocks.run.mock.calls.map(([name]) => name);

beforeEach(() => {
  mocks.revalidatePath.mockClear();
  mocks.redirect.mockClear();
  mocks.requireEditor.mockClear();
  mocks.run.mockReset().mockResolvedValue(saved());
});

describe("saveArticleAction", () => {
  it("creates a story through the capability and opens it, leaving the cache refresh to the capability runner", async () => {
    await expect(saveArticleAction(idleStudioActionState, articleForm())).rejects.toThrow(
      "REDIRECT:/en/studio/articles/article-1?saved=1",
    );

    expect(names()).toEqual(["admin_create_article"]);
    expect(mocks.run.mock.calls[0]?.[2]).toEqual({ locale: "en" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("publishes a new story with a second capability call", async () => {
    await expect(saveArticleAction(idleStudioActionState, articleForm({ status: "published" }))).rejects.toThrow(
      "REDIRECT:/en/studio/articles/article-1?saved=1",
    );

    expect(names()).toEqual(["admin_create_article", "admin_publish_article"]);
    expect(mocks.run.mock.calls[1]).toEqual(["admin_publish_article", { id: "article-1", locale: "en" }, { confirmed: true, locale: "en" }]);
  });

  it("updates an existing story and links it to its translation", async () => {
    await expect(
      saveArticleAction(idleStudioActionState, articleForm({ id: "article-1", translationOf: "una-storia" })),
    ).rejects.toThrow("REDIRECT:/en/studio/articles/article-1?saved=1");

    expect(names()).toEqual(["admin_get_article", "admin_update_article"]);
    expect(mocks.run.mock.calls[1]?.[1]).toMatchObject({ id: "article-1", translationOf: "una-storia" });
  });

  it("checks the form before it runs any capability, with the fields in the editor's language", async () => {
    const state = await saveArticleAction(idleStudioActionState, articleForm({ locale: "it", title: "Corto" }));

    expect(state).toMatchObject({ status: "error", message: "Controlla i campi evidenziati e riprova." });
    expect(state.fieldErrors?.title).toEqual(["Usa almeno 8 caratteri."]);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("shows a refusal that is about one field under that field, in the editor's language", async () => {
    mocks.run.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: "Lo slug “a-valid-story” è già usato da un altro articolo in inglese.",
      code: "article.slugTaken",
    });

    const state = await saveArticleAction(idleStudioActionState, articleForm());

    expect(state).toEqual({
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: { slug: ["Lo slug “a-valid-story” è già usato da un altro articolo in inglese."] },
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("shows any other refusal on top, and keeps the id of a story that was created but not published", async () => {
    mocks.run
      .mockResolvedValueOnce(saved())
      .mockResolvedValueOnce({ ok: false, status: 403, error: "No permission to publish." });

    const state = await saveArticleAction(idleStudioActionState, articleForm({ status: "published" }));

    expect(state).toEqual({ status: "error", message: "No permission to publish.", articleId: "article-1" });
  });
});

describe("deleteArticleAction", () => {
  function deleteForm(locale = "it") {
    const form = new FormData();
    form.set("id", "article-1");
    form.set("locale", locale);
    return form;
  }

  it("deletes through the capability with the person's confirmation and returns to the list", async () => {
    mocks.run.mockResolvedValue({ ok: true, result: { deletedId: "article-1" } });

    await expect(deleteArticleAction(deleteForm())).rejects.toThrow("REDIRECT:/it/studio/articles?deleted=1");

    expect(mocks.run).toHaveBeenCalledWith("admin_delete_article", { id: "article-1", locale: "it" }, { confirmed: true, locale: "it" });
  });

  it("returns to the list when the story is gone already, and raises any other refusal", async () => {
    mocks.run.mockResolvedValueOnce({ ok: false, status: 400, error: "Articolo non trovato.", code: "article.notFound" });
    await expect(deleteArticleAction(deleteForm())).rejects.toThrow("REDIRECT:/it/studio/articles");

    mocks.run.mockResolvedValueOnce({ ok: false, status: 403, error: "No permission." });
    await expect(deleteArticleAction(deleteForm())).rejects.toThrow("No permission.");
  });
});

describe("deleteMediaAction", () => {
  function mediaForm() {
    const form = new FormData();
    form.set("locale", "en");
    form.set("path", "cover.png");
    return form;
  }

  it("deletes through the capability, confirmed, and refreshes the media page", async () => {
    mocks.run.mockResolvedValue({ ok: true, result: { deletedPath: "cover.png" } });

    await expect(deleteMediaAction(mediaForm())).rejects.toThrow("REDIRECT:/en/studio/media?deleted=1");

    expect(mocks.run).toHaveBeenCalledWith("admin_delete_media", { path: "cover.png" }, { confirmed: true, locale: "en" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/en/studio/media");
  });

  it("tells an image an article still uses apart from any other refusal", async () => {
    mocks.run.mockResolvedValueOnce({ ok: false, status: 400, error: "In use.", code: "media.referenced" });
    await expect(deleteMediaAction(mediaForm())).rejects.toThrow("REDIRECT:/en/studio/media?error=in-use");

    mocks.run.mockResolvedValueOnce({ ok: false, status: 503, error: "Unavailable." });
    await expect(deleteMediaAction(mediaForm())).rejects.toThrow("REDIRECT:/en/studio/media?error=delete");
  });
});

describe("updateNewsletterSubscriptionAction", () => {
  it("unsubscribes through the capability and returns to the newsletter screen", async () => {
    mocks.run.mockResolvedValue({ ok: true, result: {} });
    const form = new FormData();
    form.set("id", "subscription-1");
    form.set("locale", "it");
    form.set("status", "unsubscribed");

    await expect(updateNewsletterSubscriptionAction(form)).rejects.toThrow("REDIRECT:/it/studio/newsletter?updated=1");

    expect(mocks.run).toHaveBeenCalledWith(
      "admin_update_newsletter_subscription",
      { id: "subscription-1", status: "unsubscribed" },
      { locale: "it" },
    );
  });
});
