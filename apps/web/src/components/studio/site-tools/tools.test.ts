import { describe, expect, it, vi } from "vitest";
import { studioPageSpecs, type ArticleFormPatch, type ArticleFormSnapshot } from "@atlasnews/contract/page";
import { checkFill, type OpenArticleForm } from "./article-form-bridge";
import { createStudioTools, type StudioToolsEnvironment } from "./tools";

const emptyFields: ArticleFormSnapshot["fields"] = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  categorySlug: "models",
  status: "draft",
  scheduledFor: null,
  translationOf: null,
  claimStatus: null,
  featured: false,
  coverImage: null,
  coverAlt: "",
  distribution: [],
  keyPoints: [],
  sources: [],
  entities: [],
};

const storedArticle = { id: "id-gpt-launch", slug: "gpt-launch", locale: "it", status: "published" } as const;

/** An article form that follows the rules the real one has: `fill` takes what `checkFill` accepts and `unsaved` tells a changed form. */
function fakeForm(options: { locale?: "en" | "it"; article?: ArticleFormSnapshot["article"]; fields?: Partial<ArticleFormSnapshot["fields"]> } = {}) {
  const shown = { ...emptyFields, ...options.fields };
  let fields = { ...shown };
  const form: OpenArticleForm = {
    read: () => ({
      locale: options.locale ?? "en",
      article: options.article ?? null,
      unsaved: JSON.stringify(fields) !== JSON.stringify(shown),
      fields,
      errors: { title: ["Use at least 8 characters."] },
    }),
    fill: (patch: ArticleFormPatch) => {
      const { accepted, filled, rejected } = checkFill(patch, { categories: ["models", "research"], translations: ["gpt-lancio"], entities: ["openai"] });
      fields = { ...fields, ...(accepted as Partial<ArticleFormSnapshot["fields"]>) };
      return { filled, rejected, saved: false };
    },
  };
  return form;
}

/**
 * A fake Studio: `navigate` records the path and shows the form that `pages` has for it (none for an
 * unknown address, as a not-found page has no form). A form appears `late` looks after the page opened.
 */
function setup(options: { form?: OpenArticleForm | null; pages?: Record<string, OpenArticleForm | null>; navigates?: boolean; late?: number } = {}) {
  const state = { form: options.form ?? null, path: "/en/studio", pending: null as OpenArticleForm | null, looks: 0 };
  const visited: string[] = [];
  const waits: number[] = [];
  const env: StudioToolsEnvironment = {
    navigate: async (path) => {
      visited.push(path);
      if (options.navigates === false) return false;
      state.path = path;
      state.pending = options.pages?.[path] ?? null;
      if (!options.late) {
        state.form = state.pending;
        state.pending = null;
      }
      return true;
    },
    articleForm: () => state.form,
    path: () => state.path,
    wait: async (ms) => {
      waits.push(ms);
      if (state.pending && ++state.looks >= (options.late ?? 0)) {
        state.form = state.pending;
        state.pending = null;
      }
    },
  };
  return { tools: createStudioTools(env), visited, waits, state };
}

describe("open_article_editor", () => {
  it("opens a blank form for a new article in a locale", async () => {
    const blank = fakeForm({ locale: "it" });
    const { tools, visited } = setup({ pages: { "/it/studio/articles/new": blank } });
    await expect(tools.open_article_editor({ locale: "it" })).resolves.toEqual({ opened: true, path: "/it/studio/articles/new", article: null });
    expect(visited).toEqual(["/it/studio/articles/new"]);
  });

  it("opens an article by its locale and slug and says which one it is", async () => {
    const { tools, visited } = setup({ pages: { "/it/studio/articles/gpt-launch": fakeForm({ locale: "it", article: storedArticle }) } });
    await expect(tools.open_article_editor({ locale: "it", slug: "gpt-launch" })).resolves.toEqual({
      opened: true,
      path: "/it/studio/articles/gpt-launch",
      article: storedArticle,
    });
    expect(visited).toEqual(["/it/studio/articles/gpt-launch"]);
  });

  it("does not leave the editor that is already open for the same article, nor reload a blank one", async () => {
    const open = setup({ form: fakeForm({ locale: "it", article: storedArticle }) });
    await expect(open.tools.open_article_editor({ locale: "it", slug: "gpt-launch" })).resolves.toMatchObject({ opened: true, article: storedArticle });
    const blank = setup({ form: fakeForm({ locale: "en" }) });
    await expect(blank.tools.open_article_editor({ locale: "en" })).resolves.toMatchObject({ opened: true, article: null });
    expect(open.visited).toEqual([]);
    expect(blank.visited).toEqual([]);
  });

  it("will not leave a form that has unsaved changes for another article, and says what to ask", async () => {
    const typed = fakeForm({ locale: "en" });
    typed.fill({ title: "A headline in progress" });
    const { tools, visited } = setup({ form: typed, pages: { "/en/studio/articles/other": fakeForm({ article: { ...storedArticle, slug: "other", locale: "en" } }) } });
    await expect(tools.open_article_editor({ locale: "en", slug: "other" })).resolves.toEqual({
      error: expect.stringMatching(/unsaved changes.*save or discard.*Nothing was changed/),
    });
    expect(visited).toEqual([]);
    // The same request for the form that holds the unsaved work is not a way out of it either: it is that form.
    await expect(tools.open_article_editor({ locale: "en" })).resolves.toMatchObject({ opened: true, article: null });
  });

  it("moves on from a form that has nothing unsaved, and waits for the editor that was asked for, not the one it left", async () => {
    const old = fakeForm({ locale: "en" });
    const { tools, visited, waits } = setup({
      form: old,
      late: 3,
      pages: { "/en/studio/articles/other": fakeForm({ article: { ...storedArticle, slug: "other", locale: "en" } }) },
    });
    await expect(tools.open_article_editor({ locale: "en", slug: "other" })).resolves.toMatchObject({
      opened: true,
      path: "/en/studio/articles/other",
      article: { slug: "other" },
    });
    expect(visited).toEqual(["/en/studio/articles/other"]);
    expect(waits).toEqual([50, 50, 50]);
  });

  it("reports an article that does not exist after a short wait, and a page that did not open", async () => {
    const missing = setup({ pages: {} });
    await expect(missing.tools.open_article_editor({ locale: "en", slug: "gone" })).resolves.toEqual({
      error: 'No article "gone" in locale en, or its editor did not open.',
    });
    expect(missing.waits).toHaveLength(60);

    const stuck = setup({ navigates: false });
    await expect(stuck.tools.open_article_editor({ locale: "en" })).resolves.toEqual({
      error: "The page did not finish opening /en/studio/articles/new.",
    });
  });

  it("checks its arguments before it moves the page", async () => {
    const { tools, visited } = setup();
    await expect(tools.open_article_editor({ slug: "Not A Slug" })).resolves.toEqual({
      error: expect.stringContaining("Invalid arguments for open_article_editor"),
    });
    await expect(tools.open_article_editor({ locale: "fr" })).resolves.toHaveProperty("error");
    await expect(tools.open_article_editor({ slug: "../../api/health" })).resolves.toHaveProperty("error");
    expect(visited).toEqual([]);
  });

  it("answers a cancelled call as cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const { tools } = setup({ pages: {} });
    await expect(tools.open_article_editor({ locale: "en", slug: "gone" }, controller.signal)).resolves.toEqual({
      error: "open_article_editor was cancelled.",
    });
  });
});

describe("read_article_form", () => {
  it("returns the form on screen: its fields, the translation link, the status and the errors shown", async () => {
    const form = fakeForm({
      locale: "it",
      article: storedArticle,
      fields: { title: "Il lancio", translationOf: "gpt-launch", status: "review", claimStatus: "rollout" },
    });
    const { tools } = setup({ form });
    await expect(tools.read_article_form({})).resolves.toMatchObject({
      locale: "it",
      article: storedArticle,
      unsaved: false,
      fields: { title: "Il lancio", translationOf: "gpt-launch", status: "review", claimStatus: "rollout" },
      errors: { title: ["Use at least 8 characters."] },
    });
  });

  it("says so when no form is open, and does not mistake a stale closure for a form", async () => {
    const { tools } = setup();
    await expect(tools.read_article_form({})).resolves.toEqual({ error: "No article form is open. Open one with open_article_editor first." });
  });
});

describe("fill_article_form", () => {
  it("sets the fields it is given, leaves the others, and states that nothing was saved", async () => {
    const form = fakeForm({ fields: { title: "Kept title as typed" } });
    const { tools } = setup({ form });
    const result = await tools.fill_article_form({
      excerpt: "A short summary of the story for the list.",
      categorySlug: "research",
      status: "review",
      keyPoints: ["One", "Two", "Three"],
    });
    expect(result).toEqual({ filled: ["excerpt", "categorySlug", "status", "keyPoints"], rejected: [], saved: false });
    expect(form.read().fields).toMatchObject({
      title: "Kept title as typed",
      excerpt: "A short summary of the story for the list.",
      categorySlug: "research",
      status: "review",
    });
    expect(form.read().unsaved).toBe(true);
  });

  it("fills what the form offers and reports the rest with the reason", async () => {
    const form = fakeForm();
    const { tools } = setup({ form });
    await expect(tools.fill_article_form({ title: "A usable title", categorySlug: "cooking", translationOf: "nowhere" })).resolves.toMatchObject({
      filled: ["title"],
      rejected: [
        { field: "categorySlug", reason: expect.stringContaining("Categories: models, research") },
        { field: "translationOf", reason: expect.stringContaining("not offered") },
      ],
      saved: false,
    });
    expect(form.read().fields).toMatchObject({ title: "A usable title", categorySlug: "models" });
  });

  it("never publishes and never confirms: the arguments are checked first and unknown ones are dropped", async () => {
    const form = fakeForm();
    const fill = vi.spyOn(form, "fill");
    const { tools } = setup({ form });
    await expect(tools.fill_article_form({ status: "published" })).resolves.toEqual({ error: expect.stringMatching(/fill_article_form.*status/) });
    await expect(tools.fill_article_form({ title: "x".repeat(200) })).resolves.toHaveProperty("error");
    expect(fill).not.toHaveBeenCalled();
    await tools.fill_article_form({ title: "A usable title", confirmed: true, save: true });
    expect(fill).toHaveBeenCalledWith({ title: "A usable title" });
  });

  it("says so when no form is open", async () => {
    const { tools } = setup();
    await expect(tools.fill_article_form({ title: "A usable title" })).resolves.toEqual({
      error: "No article form is open. Open one with open_article_editor first.",
    });
  });
});

describe("failures", () => {
  it("never throws: an unexpected error becomes a result", async () => {
    const broken: OpenArticleForm = {
      read: () => {
        throw new Error("secret internals");
      },
      fill: () => {
        throw new Error("secret internals");
      },
    };
    const { tools } = setup({ form: broken });
    await expect(tools.read_article_form({})).resolves.toEqual({ error: "read_article_form failed unexpectedly." });
    await expect(tools.fill_article_form({ title: "A usable title" })).resolves.toEqual({ error: "fill_article_form failed unexpectedly." });
  });
});

describe("the catalogue's outputs", () => {
  it("are what the handlers return", async () => {
    const { tools } = setup({
      pages: { "/it/studio/articles/gpt-launch": fakeForm({ locale: "it", article: storedArticle, fields: { claimStatus: "test", translationOf: "x" } }) },
    });
    const results = {
      open_article_editor: await tools.open_article_editor({ locale: "it", slug: "gpt-launch" }),
      read_article_form: await tools.read_article_form({}),
      fill_article_form: await tools.fill_article_form({ title: "A usable title", categorySlug: "cooking" }),
    };
    expect(Object.keys(results)).toEqual(studioPageSpecs.map((spec) => spec.name));
    for (const [name, result] of Object.entries(results)) {
      const spec = studioPageSpecs.find((candidate) => candidate.name === name)!;
      expect(() => spec.output.parse(result), name).not.toThrow();
    }
    const blank = setup({ pages: { "/en/studio/articles/new": fakeForm() } });
    // A new article has no stored article behind it.
    expect(studioPageSpecs[0].output.parse(await blank.tools.open_article_editor({ locale: "en" }))).toMatchObject({ article: null });
  });
});
