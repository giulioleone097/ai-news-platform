import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { ArticleCommandService } from "@atlasnews/core/editorial/application/article-commands";
import type { ArticleDraftInput } from "@atlasnews/core/editorial/domain/article";
import { seedArticles, seedEntities } from "./seed";
import { createEditorialBackends } from "./testing";

// The story field cases run against the in-memory repository and against D1.
const backends = createEditorialBackends();

const base = {
  locale: "en",
  excerpt: "A sufficiently descriptive summary of the story.",
  content: "A complete body for the story used in this test.",
  categorySlug: "tools",
} as const;

function story(title: string, rest: Partial<ArticleDraftInput> = {}): ArticleDraftInput {
  return { ...base, title, status: "published", ...rest };
}

afterEach(() => {
  vi.useRealTimers();
});

describe.each(backends)("story fields in the $name repository", (backend) => {
  afterAll(() => backend.dispose());

  it("reads back exactly what was saved: status, key points, sources and entities", async () => {
    const repository = await backend.create();
    const saved = await repository.save(story("A story with every field", {
      claimStatus: "rollout",
      keyPoints: ["First point", "Second point", "Third point"],
      sources: [
        { title: "Company blog post", url: "https://example.com/blog", supports: "The rollout started." },
        { title: "Documentation", url: "https://example.com/docs", supports: "The feature exists." },
      ],
      entities: [{ slug: "claude" }, { slug: "anthropic", isPrimary: true }, { slug: "chatgpt" }],
    }));
    const read = await repository.findById(saved.id, "en");

    expect(read).toEqual(saved);
    expect(read).toMatchObject({
      claimStatus: "rollout",
      keyPoints: ["First point", "Second point", "Third point"],
      sources: [
        { title: "Company blog post", url: "https://example.com/blog", supports: "The rollout started." },
        { title: "Documentation", url: "https://example.com/docs", supports: "The feature exists." },
      ],
    });
    expect(read?.entities).toEqual([
      { kind: "company", slug: "anthropic", name: "Anthropic", isPrimary: true },
      { kind: "product", slug: "chatgpt", name: "ChatGPT", isPrimary: false },
      { kind: "product", slug: "claude", name: "Claude", isPrimary: false },
    ]);
  });

  it("keeps the story fields when a later save omits them, and replaces them when given", async () => {
    const repository = await backend.create();
    const created = await repository.save(story("A story that changes later", {
      claimStatus: "test",
      keyPoints: ["One point"],
      entities: [{ slug: "gemini" }],
    }));
    const renamed = await repository.save({ ...story("A story that changes later, renamed"), id: created.id });
    expect(renamed).toMatchObject({ claimStatus: "test", keyPoints: ["One point"] });
    expect(renamed.entities.map((entity) => entity.slug)).toEqual(["gemini"]);

    const cleared = await repository.save({
      ...story("A story that changes later, renamed"),
      id: created.id,
      claimStatus: "confirmed",
      keyPoints: [],
      entities: [],
    });
    expect(cleared).toMatchObject({ claimStatus: "confirmed", keyPoints: [], entities: [] });
  });

  it("starts a story as analysis and refuses an unknown entity", async () => {
    const repository = await backend.create();
    expect(await repository.save(story("A story without a status"))).toMatchObject({
      claimStatus: "analysis",
      keyPoints: [],
      sources: [],
      entities: [],
    });
    await expect(repository.save(story("A story with a missing entity", {
      entities: [{ slug: "no-such-entity" }],
    }))).rejects.toThrow("Unknown entity no-such-entity");
  });

  it("keeps the story fields when an article is published through the command service", async () => {
    const repository = await backend.create();
    const commands = new ArticleCommandService(repository);
    const draft = await commands.save(story("A draft that gets published", {
      status: "draft",
      claimStatus: "rumour",
      keyPoints: ["A single point"],
      sources: [{ title: "A forum post", url: "https://example.com/post", supports: "The claim." }],
      entities: [{ slug: "openai", isPrimary: true }, { slug: "chatgpt" }],
    }));
    const published = await commands.publish(draft);

    expect(published.status).toBe("published");
    expect({ ...published, status: draft.status, publishedAt: null, updatedAt: "" })
      .toEqual({ ...draft, publishedAt: null, updatedAt: "" });
  });

  it("rejects invalid story fields through the command service", async () => {
    const commands = new ArticleCommandService(await backend.create());
    await expect(commands.save(story("A story with a plain http source", {
      sources: [{ title: "Insecure source", url: "http://example.com", supports: "The claim." }],
    }))).rejects.toThrow("Invalid sources");
    await expect(commands.save(story("A story with four key points", {
      keyPoints: ["Point one", "Point two", "Point three", "Point four"],
    }))).rejects.toThrow("Invalid key points");
  });

  it("filters public stories by entity and by claim status", async () => {
    const repository = await backend.create();
    await repository.save(story("A rumour about Claude", { claimStatus: "rumour", entities: [{ slug: "claude" }] }));
    await repository.save(story("A confirmed ChatGPT update", { claimStatus: "confirmed", entities: [{ slug: "chatgpt" }] }));
    await repository.save(story("A draft about Claude", { status: "draft", entities: [{ slug: "claude" }] }));

    const claude = await repository.listPublished({ locale: "en", entity: "claude" });
    expect(claude.items.map((item) => item.title)).toEqual(["A rumour about Claude"]);

    const rumours = await repository.listPublished({ locale: "en", claimStatus: "rumour" });
    expect(rumours.items.map((item) => item.title)).toEqual(["A rumour about Claude"]);

    const both = await repository.listPublished({ locale: "en", entity: "chatgpt", claimStatus: "rumour" });
    expect(both.items).toEqual([]);

    const analysis = await repository.listPublished({ locale: "en", claimStatus: "analysis", limit: 50 });
    expect(analysis.items).toHaveLength(seedArticles.filter((article) => article.locale === "en" && article.status === "published").length);
  });

  it("lists the entities of a locale, by kind, with the published stories they have", async () => {
    const repository = await backend.create();
    await repository.save(story("A published story about Claude", { entities: [{ slug: "claude" }] }));
    await repository.save(story("A draft story about Claude", { status: "draft", entities: [{ slug: "claude" }] }));
    await repository.save(story("Una storia su Claude", { locale: "it", categorySlug: "strumenti", entities: [{ slug: "claude" }] }));

    const english = await repository.listEntities("en");
    expect(english).toHaveLength(seedEntities.length);
    expect(english.find((entity) => entity.slug === "claude")).toMatchObject({
      kind: "product",
      name: "Claude",
      officialUrl: "https://claude.ai",
      parent: { slug: "anthropic", name: "Anthropic" },
      description: "The AI assistant from Anthropic.",
      storyCount: 1,
    });
    expect(english.find((entity) => entity.slug === "openai")?.storyCount).toBe(0);
    expect((await repository.listEntities("it")).find((entity) => entity.slug === "claude")).toMatchObject({
      description: "L’assistente AI di Anthropic.",
      storyCount: 1,
    });

    const companies = await repository.listEntities("en", "company");
    expect(companies.length).toBeGreaterThan(0);
    expect(companies.every((entity) => entity.kind === "company" && entity.parent === null)).toBe(true);
    expect(await repository.listEntities("en", "model")).toEqual([]);
  });

  it("finds one entity by slug with its localized description, or null", async () => {
    const repository = await backend.create();
    expect(await repository.findEntityBySlug("anthropic", "it")).toMatchObject({
      kind: "company",
      officialUrl: "https://www.anthropic.com",
      description: "Azienda di AI che sviluppa l’assistente Claude.",
      parent: null,
    });
    expect(await repository.findEntityBySlug("nobody", "en")).toBeNull();
  });

  it("orders an entity timeline from the oldest published story to the newest", async () => {
    // Only the clock: the D1 runtime needs its timers.
    vi.useFakeTimers({ toFake: ["Date"] });
    const repository = await backend.create();
    const save = async (day: string, title: string, claimStatus: "rumour" | "test" | "confirmed") => {
      vi.setSystemTime(new Date(`2026-09-${day}T10:00:00.000Z`));
      return repository.save(story(title, { claimStatus, entities: [{ slug: "claude" }] }));
    };
    // Saved out of order on purpose: the timeline follows the publication date.
    await save("09", "Official announcement", "confirmed");
    await save("03", "First rumour", "rumour");
    await save("07", "Seen in testing", "test");
    vi.setSystemTime(new Date("2026-09-10T10:00:00.000Z"));
    await repository.save(story("A draft story", { status: "draft", entities: [{ slug: "claude" }] }));
    await repository.save(story("Una storia", { locale: "it", categorySlug: "strumenti", entities: [{ slug: "claude" }] }));

    const timeline = await repository.listEntityTimeline("claude", "en");
    expect(timeline.map(({ claimStatus, title, publishedAt }) => [claimStatus, title, publishedAt])).toEqual([
      ["rumour", "First rumour", "2026-09-03T10:00:00.000Z"],
      ["test", "Seen in testing", "2026-09-07T10:00:00.000Z"],
      ["confirmed", "Official announcement", "2026-09-09T10:00:00.000Z"],
    ]);
    expect(timeline[0].slug).toBe("first-rumour");
    expect(await repository.listEntityTimeline("openai", "en")).toEqual([]);
  });
});

describe("story seed", () => {
  it("gives every demo story a status and valid key points and sources", () => {
    expect(seedArticles.every((article) => article.claimStatus === "analysis")).toBe(true);
    expect(seedArticles.every((article) => article.keyPoints.length >= 1 && article.keyPoints.length <= 3)).toBe(true);
    expect(seedArticles.flatMap((article) => article.sources).every((source) => source.url.startsWith("https://"))).toBe(true);
  });

  it("only gives a model or a product a parent company that exists", () => {
    const companies = new Set(seedEntities.filter((entity) => entity.kind === "company").map((entity) => entity.slug));
    for (const entity of seedEntities) {
      expect(entity.officialUrl).toMatch(/^https:\/\//);
      expect(entity.parent === null ? entity.kind === "company" : companies.has(entity.parent)).toBe(true);
      expect(entity.description.en.length).toBeGreaterThan(0);
      expect(entity.description.it.length).toBeGreaterThan(0);
    }
  });
});
