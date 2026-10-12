import type { AdminEditorialRepository, NewsletterRepository } from "@atlasnews/core/editorial/domain/article-repository";
import type { D1Database } from "../sites/cloudflare";
import { createSitesTestStore, type SitesTestStore } from "../sites/testing";
import { createD1EditorialRepository } from "./d1-editorial-repository";
import { createMemoryEditorialRepository } from "./memory-editorial-repository";
import { seedArticles, seedAuthor, seedCategories, seedEntities } from "./seed";

// Test support only: the editorial repository tests run their shared cases against the in-memory
// repository and against D1, both holding the same seed (the demo content).

export interface EditorialBackend {
  name: "memory" | "d1";
  /** A repository holding exactly the seed; whatever an earlier call wrote is gone. */
  create(): Promise<AdminEditorialRepository>;
  dispose(): Promise<void>;
}

export const unusedNewsletter: NewsletterRepository = {
  subscribe: async () => {
    throw new Error("The newsletter adapter is not part of this test");
  },
  listSubscriptions: async () => {
    throw new Error("The newsletter adapter is not part of this test");
  },
  findSubscription: async () => {
    throw new Error("The newsletter adapter is not part of this test");
  },
  updateSubscriptionStatus: async () => {
    throw new Error("The newsletter adapter is not part of this test");
  },
};

const clearedTables = [
  "social_publications",
  "article_entities",
  "articles",
  "entity_descriptions",
  "entities",
  "categories",
  "authors",
];

/** Replaces the editorial tables' content with the seed of the in-memory repository. */
export async function resetEditorialSeed(database: D1Database) {
  const insert = (table: string, record: Record<string, unknown>) => {
    const columns = Object.keys(record);
    return database
      .prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
      .bind(...Object.values(record));
  };
  const positions = new Map([...new Set(seedCategories.map((category) => category.translationKey))].map((key, index) => [key, index + 1]));
  const created = seedArticles.at(-1)?.createdAt ?? new Date(0).toISOString();

  await database.batch([
    // ON DELETE RESTRICT is checked row by row, so the entities lose their parents before they go.
    database.prepare("UPDATE entities SET parent_id = NULL"),
    ...clearedTables.map((table) => database.prepare(`DELETE FROM ${table}`)),
    insert("authors", { id: seedAuthor.id, name: seedAuthor.name, role: seedAuthor.role, initials: seedAuthor.initials, created_at: created }),
    ...seedCategories.map((category) =>
      insert("categories", {
        id: category.id,
        translation_key: category.translationKey,
        locale: category.locale,
        slug: category.slug,
        name: category.name,
        description: category.description,
        position: positions.get(category.translationKey),
        created_at: created,
      }),
    ),
    ...seedEntities.flatMap((entity) => [
      database
        .prepare(
          `INSERT INTO entities (id, kind, slug, name, official_url, parent_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, (SELECT id FROM entities WHERE slug = ?), ?, ?)`,
        )
        .bind(entity.id, entity.kind, entity.slug, entity.name, entity.officialUrl, entity.parent, created, created),
      ...Object.entries(entity.description).map(([locale, description]) =>
        insert("entity_descriptions", { entity_id: entity.id, locale, description }),
      ),
    ]),
    ...seedArticles.flatMap((article) => [
      insert("articles", {
        id: article.id,
        translation_key: article.translationKey,
        locale: article.locale,
        slug: article.slug,
        title: article.title,
        excerpt: article.excerpt,
        content: article.content,
        cover_image: article.coverImage,
        cover_alt: article.coverAlt,
        status: article.status,
        category_id: article.category.id,
        author_id: article.author.id,
        featured: article.featured ? 1 : 0,
        reading_minutes: article.readingMinutes,
        published_at: article.publishedAt,
        scheduled_for: article.scheduledFor,
        created_at: article.createdAt,
        updated_at: article.updatedAt,
        claim_status: article.claimStatus,
        key_points: JSON.stringify(article.keyPoints),
        sources: JSON.stringify(article.sources),
      }),
      ...article.distribution.map((channel) =>
        insert("social_publications", {
          id: `${article.id}:${channel}`,
          article_id: article.id,
          channel,
          status: "ready",
          message: article.excerpt,
          scheduled_for: article.scheduledFor,
          created_at: article.createdAt,
          updated_at: article.updatedAt,
        }),
      ),
    ]),
  ]);
}

export function createEditorialBackends(): EditorialBackend[] {
  let store: SitesTestStore | undefined;
  return [
    { name: "memory", create: async () => createMemoryEditorialRepository(), dispose: async () => undefined },
    {
      name: "d1",
      async create() {
        store ??= await createSitesTestStore();
        await resetEditorialSeed(store.database);
        return createD1EditorialRepository(store.database, {
          audience: "editorial",
          media: store.media,
          newsletter: unusedNewsletter,
          actorAuthorId: async () => seedAuthor.id,
        });
      },
      async dispose() {
        await store?.dispose();
        store = undefined;
      },
    },
  ];
}
