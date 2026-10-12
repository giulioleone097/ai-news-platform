import { describe, expect, it, vi } from "vitest";

import type { Article, ArticleDraftInput } from "@atlasnews/core/editorial/domain/article";
import { storyLimits } from "@atlasnews/core/editorial/domain/article";
import type { AdminEditorialRepository } from "@atlasnews/core/editorial/domain/article-repository";

import { anonymous, CapabilityFailure } from "../capability";
import { capabilities } from "../catalogue";
import { siteLinks, type CapabilityPorts } from "../ports";
import { adminCreateArticle, adminUpdateArticle } from "../specs/articles";

const keyPoint = "A short key point that a reader can scan before the body.";
const source = { title: "Company blog", url: "https://example.com/post", supports: "The launch date claim" };
const articleId = "6f1c2c1e-6a2b-4f7e-9d3e-1a2b3c4d5e6f";

const category = {
  id: "c1",
  translationKey: "research",
  locale: "en" as const,
  slug: "research",
  name: "Research",
  description: "Research notes",
};

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: articleId,
    translationKey: "openai-model-launch",
    locale: "en",
    slug: "openai-model-launch",
    title: "OpenAI launches a new model for testing",
    excerpt: "A new model enters limited testing with selected partners this week.",
    content: "The body of the story is long enough to pass the editorial validation rules in tests.",
    coverImage: "/covers/launch.png",
    coverAlt: "A launch illustration",
    status: "published",
    category,
    author: { id: "a1", name: "Ada Editor", role: "Editor", initials: "AE" },
    featured: false,
    readingMinutes: 1,
    publishedAt: "2026-09-01T10:00:00.000Z",
    scheduledFor: null,
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    distribution: [],
    claimStatus: "rumour",
    keyPoints: [keyPoint, keyPoint, keyPoint],
    sources: [source],
    entities: [{ kind: "company", slug: "openai", name: "OpenAI", isPrimary: true }],
    ...overrides,
  };
}

/** Ports over test doubles: the contract may not import the adapters, so the tests bring their own. */
function ports(overrides: Partial<CapabilityPorts> = {}): CapabilityPorts {
  const unavailable = async (): Promise<never> => {
    throw new Error("not configured");
  };
  return {
    site: siteLinks(new URL("https://atlasnews.example")),
    articles: {
      listPublished: vi.fn(async () => ({ items: [article()], nextCursor: null })),
      findBySlug: vi.fn(async () => article()),
      listCategories: vi.fn(async () => [category]),
    },
    entities: {
      listEntities: vi.fn(async () => []),
      findEntityBySlug: vi.fn(async () => null),
      listEntityTimeline: vi.fn(async () => []),
    },
    invalidateCache: vi.fn(async () => undefined),
    publicComments: unavailable,
    editorial: unavailable,
    moderation: unavailable,
    commentNotifications: unavailable,
    newsletter: unavailable,
    contact: unavailable,
    social: unavailable,
    team: unavailable,
    ...overrides,
  };
}

/** Parses the arguments as the adapters do, runs the handler, and parses the result against its output schema. */
async function call<T>(name: string, input: Record<string, unknown>, p: CapabilityPorts): Promise<T> {
  const capability = capabilities.find((item) => item.name === name);
  if (!capability) throw new Error(`No capability ${name}`);
  const result = await capability.run(p, capability.input.parse(input), anonymous);
  return capability.output.parse(result) as T;
}

type Row = Record<string, unknown>;
type Listed = { items: Row[] };
type Full = { article: Row };
type Fetched = { text: string; metadata: Record<string, string | number> };
type Timeline = { entity: Row; stories: Row[] };
type Saved = { article: Row & { id: string } };

/** A fake of the admin repository that keeps story fields when a draft omits them, as the adapters do. */
function fakeEditorial(seed: Article | null) {
  let stored = seed;
  const findById = vi.fn(async () => stored);
  const save = vi.fn(async (input: ArticleDraftInput) => {
    const base = stored ?? article({
      id: articleId,
      slug: input.slug ?? "new-story",
      claimStatus: "analysis",
      keyPoints: [],
      sources: [],
      entities: [],
    });
    stored = {
      ...base,
      title: input.title,
      excerpt: input.excerpt,
      claimStatus: input.claimStatus ?? base.claimStatus,
      keyPoints: input.keyPoints ?? base.keyPoints,
      sources: input.sources ?? base.sources,
      entities: input.entities
        ? input.entities.map((link) => ({ kind: "company" as const, slug: link.slug, name: link.slug, isPrimary: Boolean(link.isPrimary) }))
        : base.entities,
    };
    return stored;
  });
  const entity = (slug: string) => ({ id: slug, kind: "company" as const, slug, name: slug, officialUrl: null, parent: null, description: "" });
  const repository = {
    findById,
    save,
    findBySlug: vi.fn(async () => null),
    findEntityBySlug: vi.fn(async (slug: string) => entity(slug)),
    listCategories: vi.fn(async () => [category]),
  };
  return { save, repository: repository as unknown as AdminEditorialRepository };
}

const newStory = {
  locale: "en",
  title: "OpenAI launches a new model for testing",
  excerpt: "A new model enters limited testing with selected partners this week.",
  content: "The body of the story is long enough to pass the editorial validation rules in tests.",
  categorySlug: "research",
};

describe("article filters and story fields on the public reads", () => {
  it("passes the entity and claim status filters to the repository", async () => {
    const p = ports();
    await call("list_articles", { locale: "en", entity: "openai", claimStatus: "rumour" }, p);
    expect(p.articles.listPublished).toHaveBeenLastCalledWith(
      expect.objectContaining({ locale: "en", entity: "openai", claimStatus: "rumour" }),
    );

    await call("search_articles", { locale: "it", query: "modello", entity: "openai", claimStatus: "confirmed" }, p);
    expect(p.articles.listPublished).toHaveBeenLastCalledWith(
      expect.objectContaining({ locale: "it", query: "modello", entity: "openai", claimStatus: "confirmed" }),
    );
  });

  it("rejects a claim status that core does not define", () => {
    const list = capabilities.find((item) => item.name === "list_articles")!;
    expect(list.input.safeParse({ locale: "en", claimStatus: "gossip" }).success).toBe(false);
  });

  it("gives summaries the claim status and entities, and the full article the key points and sources", async () => {
    const p = ports();
    const listed = await call<Listed>("list_articles", { locale: "en" }, p);
    expect(listed.items[0]).toMatchObject({
      claimStatus: "rumour",
      entities: [{ kind: "company", slug: "openai", name: "OpenAI", isPrimary: true }],
    });

    const found = await call<Listed>("search_articles", { locale: "en", query: "openai" }, p);
    expect(found.items[0]).toMatchObject({ claimStatus: "rumour" });

    const full = await call<Full>("get_article", { locale: "en", slug: "openai-model-launch" }, p);
    expect(full.article).toMatchObject({
      keyPoints: [keyPoint, keyPoint, keyPoint],
      sources: [source],
    });
  });

  it("fetches the story as Markdown with its status, entities, key points and sources", async () => {
    const fetched = await call<Fetched>("fetch", { id: "en/openai-model-launch" }, ports());
    expect(fetched.text).toContain("- Status: Rumour");
    expect(fetched.text).toContain("- Entities: OpenAI (Company, primary)");
    expect(fetched.text).toContain("## Key points");
    expect(fetched.text).toContain(`- ${keyPoint}`);
    expect(fetched.text).toContain("## Sources");
    expect(fetched.text).toContain("- [Company blog](https://example.com/post): The launch date claim");
    expect(fetched.metadata).toMatchObject({ claimStatus: "rumour" });
  });
});

describe("entity reads", () => {
  const detail = {
    id: "e1",
    kind: "company" as const,
    slug: "openai",
    name: "OpenAI",
    description: "An AI research company.",
    officialUrl: "https://openai.example",
    parent: null,
  };

  it("lists entities with their story counts and passes the kind filter on", async () => {
    const p = ports({
      entities: {
        listEntities: vi.fn(async () => [{ ...detail, storyCount: 2 }]),
        findEntityBySlug: vi.fn(async () => null),
        listEntityTimeline: vi.fn(async () => []),
      },
    });
    const listed = await call<Listed>("list_entities", { locale: "en", kind: "company" }, p);
    expect(p.entities.listEntities).toHaveBeenCalledWith("en", "company");
    expect(listed.items).toEqual([
      {
        kind: "company",
        slug: "openai",
        name: "OpenAI",
        description: "An AI research company.",
        officialUrl: "https://openai.example",
        parent: null,
        storyCount: 2,
      },
    ]);
  });

  it("returns an entity with its stories in the order the repository gives, with absolute URLs", async () => {
    const p = ports({
      entities: {
        listEntities: vi.fn(async () => []),
        findEntityBySlug: vi.fn(async () => detail),
        listEntityTimeline: vi.fn(async () => [
          { slug: "first-rumour", title: "A rumour", claimStatus: "rumour" as const, publishedAt: "2026-08-01T10:00:00.000Z" },
          { slug: "then-confirmed", title: "Confirmed", claimStatus: "confirmed" as const, publishedAt: "2026-09-01T10:00:00.000Z" },
        ]),
      },
    });
    const timeline = await call<Timeline>("get_entity_timeline", { locale: "en", slug: "openai" }, p);
    expect(p.entities.listEntityTimeline).toHaveBeenCalledWith("openai", "en");
    expect(timeline.entity).toMatchObject({ slug: "openai", kind: "company" });
    expect(timeline.stories).toEqual([
      {
        date: "2026-08-01T10:00:00.000Z",
        status: "rumour",
        title: "A rumour",
        slug: "first-rumour",
        url: "https://atlasnews.example/en/articles/first-rumour",
      },
      {
        date: "2026-09-01T10:00:00.000Z",
        status: "confirmed",
        title: "Confirmed",
        slug: "then-confirmed",
        url: "https://atlasnews.example/en/articles/then-confirmed",
      },
    ]);
  });

  it("refuses an unknown entity", async () => {
    const capability = capabilities.find((item) => item.name === "get_entity_timeline")!;
    await expect(
      capability.run(ports(), capability.input.parse({ locale: "en", slug: "nobody" }), anonymous),
    ).rejects.toBeInstanceOf(CapabilityFailure);
  });
});

describe("newsroom story fields", () => {
  it("round-trips the story fields on create and keeps the stored ones when an update omits them", async () => {
    const editorial = fakeEditorial(null);
    const p = ports({ editorial: async () => editorial.repository });

    const created = await call<Saved>("admin_create_article", {
      ...newStory,
      claimStatus: "rumour",
      keyPoints: [keyPoint, keyPoint, keyPoint],
      sources: [source],
      entities: [{ slug: "openai", isPrimary: true }],
    }, p);
    expect(created.article).toMatchObject({
      claimStatus: "rumour",
      keyPoints: [keyPoint, keyPoint, keyPoint],
      sources: [source],
      entities: [expect.objectContaining({ slug: "openai", isPrimary: true })],
    });

    const renamed = await call<Saved>("admin_update_article", {
      id: created.article.id,
      locale: "en",
      title: "A renamed story for the round trip",
    }, p);
    expect(renamed.article).toMatchObject({
      title: "A renamed story for the round trip",
      claimStatus: "rumour",
      keyPoints: [keyPoint, keyPoint, keyPoint],
      sources: [source],
      entities: [expect.objectContaining({ slug: "openai" })],
    });
    expect(editorial.save.mock.calls.at(-1)?.[0]).toMatchObject({
      claimStatus: "rumour",
      keyPoints: [keyPoint, keyPoint, keyPoint],
      sources: [source],
    });

    const reclassified = await call<Saved>("admin_update_article", {
      id: created.article.id,
      locale: "en",
      claimStatus: "confirmed",
    }, p);
    expect(reclassified.article).toMatchObject({ claimStatus: "confirmed", keyPoints: [keyPoint, keyPoint, keyPoint] });
  });

  it("rejects story fields over the core limits before they reach the handler", () => {
    const base = { ...newStory, keyPoints: [keyPoint, keyPoint, keyPoint] };
    const tooManyPoints = Array.from({ length: storyLimits.keyPoints.count + 1 }, () => keyPoint);
    const overlongPoint = "a".repeat(storyLimits.keyPoints.max + 1);
    const tooManySources = Array.from({ length: storyLimits.sources.count + 1 }, () => source);
    const tooManyEntities = Array.from({ length: storyLimits.entities.count + 1 }, (_, index) => ({ slug: `entity-${index}` }));

    const rejected: Array<Record<string, unknown>> = [
      { ...base, keyPoints: tooManyPoints },
      { ...base, keyPoints: [overlongPoint, keyPoint, keyPoint] },
      { ...base, sources: tooManySources },
      { ...base, entities: tooManyEntities },
      { ...base, claimStatus: "gossip" },
    ];
    for (const extra of rejected) {
      expect(adminCreateArticle.input.safeParse({ ...base, ...extra }).success, JSON.stringify(extra).slice(0, 80)).toBe(false);
      expect(
        adminUpdateArticle.input.safeParse({ id: articleId, locale: "en", ...extra }).success,
        JSON.stringify(extra).slice(0, 80),
      ).toBe(false);
    }
  });

  it("refuses story rules that core owns and a schema cannot express", async () => {
    const editorial = fakeEditorial(null);
    const p = ports({ editorial: async () => editorial.repository });
    const capability = capabilities.find((item) => item.name === "admin_create_article")!;

    const insecure = capability.input.parse({ ...newStory, sources: [{ ...source, url: "http://example.com/post" }] });
    await expect(capability.run(p, insecure, anonymous)).rejects.toThrow("Invalid sources");

    const twoPrimaries = capability.input.parse({
      ...newStory,
      entities: [{ slug: "openai", isPrimary: true }, { slug: "anthropic", isPrimary: true }],
    });
    await expect(capability.run(p, twoPrimaries, anonymous)).rejects.toThrow("Invalid entities");
    expect(editorial.save).not.toHaveBeenCalled();
  });
});
