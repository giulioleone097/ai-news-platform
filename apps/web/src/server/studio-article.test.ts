import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/capabilities", () => ({ runEditorCapability: mocks.run }));

import { saveStudioArticle, type StudioArticleForm } from "./studio-article";

const form: StudioArticleForm = {
  locale: "it",
  title: "Una storia da salvare",
  slug: "una-storia",
  excerpt: "Un riassunto abbastanza lungo.",
  content: "Un corpo abbastanza lungo per essere valido.",
  categorySlug: "strumenti",
  status: "draft",
  featured: false,
  coverImage: "",
  coverAlt: "Descrizione",
  scheduledFor: null,
  distribution: [],
  claimStatus: "analysis",
  keyPoints: [],
  sources: [],
  entities: [],
};

const stored = (status: string, scheduledFor: string | null = null) => ({
  ok: true as const,
  result: { article: { id: "a1", slug: "una-storia", status, scheduledFor } },
});

/** The capability names the form ran, in order. */
const ran = () => mocks.run.mock.calls.map(([name]) => name);
const callOf = (name: string, nth = 0) => mocks.run.mock.calls.filter(([called]) => called === name)[nth];

beforeEach(() => {
  mocks.run.mockReset().mockResolvedValue(stored("draft"));
});

describe("a new article", () => {
  it("is created as a draft with the link to its translation, in the editor's language, without publishing", async () => {
    const outcome = await saveStudioArticle({ ...form, translationOf: "a-story" });

    expect(outcome).toEqual({ ok: true, article: expect.objectContaining({ id: "a1" }) });
    expect(ran()).toEqual(["admin_create_article"]);
    expect(callOf("admin_create_article")).toEqual([
      "admin_create_article",
      expect.objectContaining({ locale: "it", status: "draft", scheduledFor: null, translationOf: "a-story", slug: "una-storia" }),
      { locale: "it" },
    ]);
  });

  it("leaves out a blank slug, a blank cover and a blank link", async () => {
    await saveStudioArticle({ ...form, slug: "", coverImage: "", translationOf: "" });

    const [, input] = callOf("admin_create_article")!;
    expect(input).not.toHaveProperty("translationOf");
    expect(input.slug).toBeUndefined();
    expect(input.coverImage).toBeUndefined();
  });

  it("keeps the review and scheduled statuses, with the date only for scheduled", async () => {
    await saveStudioArticle({ ...form, status: "review", scheduledFor: "2026-12-01T09:00:00.000Z" });
    await saveStudioArticle({ ...form, status: "scheduled", scheduledFor: "2026-12-01T09:00:00.000Z" });

    expect(callOf("admin_create_article", 0)![1]).toMatchObject({ status: "review", scheduledFor: null });
    expect(callOf("admin_create_article", 1)![1]).toMatchObject({ status: "scheduled", scheduledFor: "2026-12-01T09:00:00.000Z" });
  });

  it("goes live in a second call that the Studio's submit confirms", async () => {
    await saveStudioArticle({ ...form, status: "published" });

    expect(ran()).toEqual(["admin_create_article", "admin_publish_article"]);
    expect(callOf("admin_create_article")![1]).toMatchObject({ status: "draft" });
    expect(callOf("admin_publish_article")).toEqual(["admin_publish_article", { id: "a1", locale: "it" }, { confirmed: true, locale: "it" }]);
  });

  it("names the created article when only going live failed, so a retry updates it instead of creating another", async () => {
    mocks.run
      .mockResolvedValueOnce(stored("draft"))
      .mockResolvedValueOnce({ ok: false, status: 403, error: "No permission." });

    expect(await saveStudioArticle({ ...form, status: "published" })).toEqual({ ok: false, error: "No permission.", articleId: "a1" });
  });

  it("returns the rule that refused it, with its code, and creates nothing more", async () => {
    mocks.run.mockResolvedValueOnce({ ok: false, status: 400, error: "Slug taken.", code: "article.slugTaken" });

    expect(await saveStudioArticle(form)).toEqual({ ok: false, error: "Slug taken.", code: "article.slugTaken" });
    expect(ran()).toEqual(["admin_create_article"]);
  });

  it("sends nobody signed out to the login page", async () => {
    mocks.run.mockResolvedValueOnce({ ok: false, status: 401, error: "Sign in." });

    await expect(saveStudioArticle(form)).rejects.toThrow("REDIRECT:/it/login");
  });
});

describe("an existing article", () => {
  const existing = { ...form, id: "a1" };

  /** What the article is when the form reaches the server; every call answers with it. */
  function currently(status: string, scheduledFor: string | null = null) {
    mocks.run.mockResolvedValue(stored(status, scheduledFor));
  }

  it("is read first, then updated with every field, and nothing else when its status stays", async () => {
    await saveStudioArticle({ ...existing, featured: true });

    expect(ran()).toEqual(["admin_get_article", "admin_update_article"]);
    expect(callOf("admin_update_article")![1]).toMatchObject({ id: "a1", locale: "it", status: "draft", featured: true, scheduledFor: null });
  });

  it("makes a blank slug from the title, as the form promises, and keeps a blank cover", async () => {
    await saveStudioArticle({ ...existing, slug: "", coverImage: "" });

    const [, input] = callOf("admin_update_article")!;
    expect(input.slug).toBe("una-storia-da-salvare");
    expect(input.coverImage).toBeUndefined();
  });

  it("unlinks the translation for a blank link and leaves it alone when the form has no such field", async () => {
    await saveStudioArticle({ ...existing, translationOf: "" });
    await saveStudioArticle({ ...existing });
    await saveStudioArticle({ ...existing, translationOf: "a-story" });

    expect(callOf("admin_update_article", 0)![1]).toMatchObject({ translationOf: null });
    expect(callOf("admin_update_article", 1)![1]).not.toHaveProperty("translationOf");
    expect(callOf("admin_update_article", 2)![1]).toMatchObject({ translationOf: "a-story" });
  });

  it("publishes a draft after saving it, without sending a status that an update cannot take", async () => {
    await saveStudioArticle({ ...existing, status: "published" });

    expect(ran()).toEqual(["admin_get_article", "admin_update_article", "admin_publish_article"]);
    expect(callOf("admin_update_article")![1]).not.toHaveProperty("status");
    expect(callOf("admin_publish_article")![2]).toEqual({ confirmed: true, locale: "it" });
  });

  it("keeps the date of a scheduled article that is published now", async () => {
    currently("scheduled", "2026-12-01T09:00:00.000Z");
    await saveStudioArticle({ ...existing, status: "published" });

    expect(callOf("admin_update_article")![1]).toMatchObject({ scheduledFor: "2026-12-01T09:00:00.000Z" });
    expect(callOf("admin_update_article")![1]).not.toHaveProperty("status");
  });

  it("moves a draft to scheduled with the date of the form", async () => {
    await saveStudioArticle({ ...existing, status: "scheduled", scheduledFor: "2026-12-05T10:00:00.000Z" });

    expect(ran()).toEqual(["admin_get_article", "admin_update_article"]);
    expect(callOf("admin_update_article")![1]).toMatchObject({ status: "scheduled", scheduledFor: "2026-12-05T10:00:00.000Z" });
  });

  it("only saves a published article that stays published", async () => {
    currently("published");
    await saveStudioArticle({ ...existing, status: "published" });

    expect(ran()).toEqual(["admin_get_article", "admin_update_article"]);
    expect(callOf("admin_update_article")![1]).not.toHaveProperty("status");
  });

  it("takes a published article off the site to draft after saving it", async () => {
    currently("published");
    await saveStudioArticle({ ...existing, status: "draft" });

    expect(ran()).toEqual(["admin_get_article", "admin_update_article", "admin_unpublish_article"]);
    expect(callOf("admin_unpublish_article")).toEqual(["admin_unpublish_article", { id: "a1", locale: "it" }, { confirmed: true, locale: "it" }]);
  });

  it("takes a published article off the site and then moves it to the status asked for", async () => {
    currently("published");
    await saveStudioArticle({ ...existing, status: "scheduled", scheduledFor: "2026-12-05T10:00:00.000Z" });

    expect(ran()).toEqual(["admin_get_article", "admin_update_article", "admin_unpublish_article", "admin_update_article"]);
    expect(callOf("admin_update_article", 1)![1]).toEqual({
      id: "a1",
      locale: "it",
      status: "scheduled",
      scheduledFor: "2026-12-05T10:00:00.000Z",
    });
  });

  it("stops at the first refusal and reports it", async () => {
    mocks.run.mockResolvedValueOnce({ ok: false, status: 400, error: "Article not found.", code: "article.notFound" });

    expect(await saveStudioArticle(existing)).toEqual({ ok: false, error: "Article not found.", code: "article.notFound" });
    expect(ran()).toEqual(["admin_get_article"]);
  });
});
