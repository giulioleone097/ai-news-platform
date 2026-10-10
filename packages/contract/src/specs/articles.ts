import * as z from "zod/v4";

import {
  articleStatuses,
  draftStatuses,
  socialChannels,
  storyLimits,
} from "@atlasnews/core/editorial/domain/article";
import { isAllowedEditorialImageSource } from "@atlasnews/core/editorial/domain/editorial-image";
import { batchLimit } from "@atlasnews/core/editorial/domain/errors";

import { destructive, readOnly, write } from "../annotations";
import { defineSpec } from "../capability";
import {
  batchNote,
  describeArticles,
  editorialUnavailable,
  editorLocaleSchema as localeSchema,
  idSchema,
  patchNote,
  slugSchema,
} from "./editorial";
import {
  batchOutput,
  claimStatusSchema,
  entityRefOutputSchema,
  entitySlugSchema,
  sourceOutputSchema,
} from "./shared";

const statusSchema = z.enum(articleStatuses);
const draftStatusSchema = z.enum(draftStatuses);
const channelSchema = z.enum(socialChannels);

/** Bounds come from core; core still checks the rules that a number cannot express (https, primary entity). */
const storyFields = {
  claimStatus: claimStatusSchema.optional(),
  keyPoints: z
    .array(z.string().trim().min(storyLimits.keyPoints.min).max(storyLimits.keyPoints.max))
    .max(storyLimits.keyPoints.count)
    .optional(),
  sources: z
    .array(z.object({
      title: z.string().trim().min(storyLimits.sources.titleMin).max(storyLimits.sources.titleMax),
      url: z.string().trim().max(storyLimits.sources.urlMax),
      supports: z.string().trim().min(storyLimits.sources.supportsMin).max(storyLimits.sources.supportsMax),
    }))
    .max(storyLimits.sources.count)
    .optional(),
  entities: z
    .array(z.object({ slug: entitySlugSchema, isPrimary: z.boolean().optional() }))
    .max(storyLimits.entities.count)
    .optional(),
} as const;

/** The fields of a story that create and patch share. The status is not among them: see below. */
const articleFields = {
  title: z.string().trim().min(8).max(180),
  slug: slugSchema.optional(),
  excerpt: z.string().trim().min(20).max(360),
  content: z.string().trim().min(20).max(100_000),
  categorySlug: slugSchema,
  featured: z.boolean().optional(),
  coverImage: z.string().trim().min(1).max(2_048)
    .refine(isAllowedEditorialImageSource, "Use bundled media or the configured editorial bucket")
    .optional(),
  coverAlt: z.string().trim().min(3).max(240).optional(),
  scheduledFor: z.string().datetime().nullable().optional(),
  distribution: z.array(channelSchema).max(socialChannels.length).optional(),
  ...storyFields,
} as const;

/** Create and patch can set the draft statuses only; going live and back is publish and unpublish. */
const createItem = z.object({
  locale: localeSchema,
  ...articleFields,
  status: draftStatusSchema.default("draft"),
});

const patchItem = z.object({
  id: idSchema,
  locale: localeSchema,
  title: articleFields.title.optional(),
  slug: articleFields.slug,
  excerpt: articleFields.excerpt.optional(),
  content: articleFields.content.optional(),
  categorySlug: articleFields.categorySlug.optional(),
  status: draftStatusSchema.optional(),
  featured: articleFields.featured,
  coverImage: articleFields.coverImage,
  coverAlt: articleFields.coverAlt,
  scheduledFor: articleFields.scheduledFor,
  distribution: articleFields.distribution,
  ...storyFields,
});

const refItem = z.object({ id: idSchema, locale: localeSchema });

export const newsroomArticleSchema = z.object({
  id: z.string(),
  translationKey: z.string(),
  locale: localeSchema,
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  content: z.string(),
  category: z.object({ slug: z.string(), name: z.string() }),
  status: statusSchema,
  featured: z.boolean(),
  coverImage: z.string(),
  coverAlt: z.string(),
  publishedAt: z.string().nullable(),
  scheduledFor: z.string().nullable(),
  updatedAt: z.string(),
  distribution: z.array(channelSchema),
  claimStatus: claimStatusSchema,
  keyPoints: z.array(z.string()),
  sources: z.array(sourceOutputSchema),
  entities: z.array(entityRefOutputSchema),
});
const articleResult = z.object({ article: newsroomArticleSchema });

/** What a batch says about each article. */
const articleBatchItem = {
  id: z.string(),
  locale: localeSchema,
  slug: z.string(),
  title: z.string(),
  status: statusSchema.nullable().describe("Status after the batch; null when the article was deleted."),
};
const articleBatchResult = (action: z.ZodType<string>) => batchOutput(action, articleBatchItem);

const patchSemantics =
  `${patchNote} Clearing: scheduledFor null removes the date (only while the status is not scheduled); `
  + "an empty distribution, keyPoints, sources or entities list empties it. Title, slug, excerpt, content, categorySlug, "
  + "coverImage, coverAlt and claimStatus cannot be cleared, only replaced. status moves between draft, review and "
  + "scheduled; a published article keeps its status here.";
const cannotPublish =
  " This tool cannot publish or unpublish: use admin_publish_article and admin_unpublish_article, which need the publish permission and ask for confirmation.";
const batchCannotPublish =
  " This tool cannot publish or unpublish: use admin_publish_articles and admin_unpublish_articles.";

const base = { surfaces: ["mcp", "page"], unavailableMessage: editorialUnavailable } as const;

export const adminListArticles = defineSpec({
  ...base,
  name: "admin_list_articles",
  title: "List newsroom articles",
  description:
    "List AtlasNews newsroom articles of every status, including drafts, for one locale, newest change first (up to 100). "
    + "Optional filters: status, category (slug), entity (slug), claimStatus and query (words in title, excerpt or body).",
  input: z.object({
    locale: localeSchema,
    status: statusSchema.optional(),
    category: slugSchema.optional(),
    entity: entitySlugSchema.optional(),
    claimStatus: claimStatusSchema.optional(),
    query: z.string().trim().min(2).max(160).optional(),
  }),
  output: z.object({ items: z.array(newsroomArticleSchema) }),
  annotations: readOnly,
  scopes: ["newsroom.read"],
});

export const adminGetArticle = defineSpec({
  ...base,
  name: "admin_get_article",
  title: "Get newsroom article",
  description: "Get a complete newsroom article by ID and locale, whatever its status.",
  input: z.object({ id: idSchema, locale: localeSchema }),
  output: articleResult,
  annotations: readOnly,
  scopes: ["newsroom.read"],
});

export const adminCreateArticle = defineSpec({
  ...base,
  name: "admin_create_article",
  title: "Create newsroom article",
  description:
    "Create one editorial article in one locale. The status is draft, review or scheduled (default draft; scheduled needs scheduledFor). "
    + `An article is never published on creation.${cannotPublish}`,
  input: createItem,
  output: articleResult,
  annotations: write,
  scopes: ["newsroom.write"],
});

export const adminUpdateArticle = defineSpec({
  ...base,
  name: "admin_update_article",
  title: "Update newsroom article",
  description: `Update selected fields of one editorial article. ${patchSemantics}${cannotPublish}`,
  input: patchItem,
  output: articleResult,
  annotations: write,
  scopes: ["newsroom.write"],
});

export const adminPublishArticle = defineSpec({
  ...base,
  name: "admin_publish_article",
  title: "Publish newsroom article",
  description: "Publish an existing article immediately on the public site. This and admin_publish_articles are the only way to publish.",
  input: z.object({ id: idSchema, locale: localeSchema }),
  output: articleResult,
  annotations: write,
  scopes: ["newsroom.publish"],
  confirmation: {
    async question({ id, locale }, ports) {
      return `Publish ${await describeArticles(ports, [{ id, locale }])} on /${locale}?`;
    },
  },
});

export const adminUnpublishArticle = defineSpec({
  ...base,
  name: "admin_unpublish_article",
  title: "Unpublish newsroom article",
  description:
    "Take a published article off the public site and return it to draft. The text and the first publication date are kept, so publishing it again restores it.",
  input: z.object({ id: idSchema, locale: localeSchema }),
  output: articleResult,
  annotations: write,
  scopes: ["newsroom.publish"],
  confirmation: {
    async question({ id, locale }, ports) {
      return `Take ${await describeArticles(ports, [{ id, locale }])} off /${locale} and return it to draft?`;
    },
  },
});

export const adminDeleteArticle = defineSpec({
  ...base,
  name: "admin_delete_article",
  title: "Delete newsroom article",
  description: "Permanently delete an article, whatever its status. Its distribution workflow items go with it.",
  input: z.object({ id: idSchema, locale: localeSchema }),
  output: z.object({ deletedId: z.string() }),
  annotations: destructive,
  scopes: ["newsroom.publish"],
  confirmation: {
    async question({ id, locale }, ports) {
      return `Permanently delete ${await describeArticles(ports, [{ id, locale }])} from /${locale}?`;
    },
  },
});

export const adminCreateArticles = defineSpec({
  ...base,
  name: "admin_create_articles",
  title: "Create many newsroom articles",
  description:
    `Create several editorial articles in one call; each item is shaped like admin_create_article.${batchNote("articles")}${batchCannotPublish}`,
  input: z.object({ items: z.array(createItem).min(1).max(batchLimit) }),
  output: articleBatchResult(z.literal("created")),
  annotations: write,
  scopes: ["newsroom.write"],
});

export const adminUpdateArticles = defineSpec({
  ...base,
  name: "admin_update_articles",
  title: "Update many newsroom articles",
  description:
    `Update selected fields of several articles in one call; each item is shaped like admin_update_article. ${patchSemantics}${batchNote("articles")}${batchCannotPublish}`,
  input: z.object({ items: z.array(patchItem).min(1).max(batchLimit) }),
  output: articleBatchResult(z.literal("updated")),
  annotations: write,
  scopes: ["newsroom.write"],
});

export const adminPublishArticles = defineSpec({
  ...base,
  name: "admin_publish_articles",
  title: "Publish many newsroom articles",
  description: `Publish several existing articles on the public site immediately.${batchNote("articles")}`,
  input: z.object({ items: z.array(refItem).min(1).max(batchLimit) }),
  output: articleBatchResult(z.literal("published")),
  annotations: write,
  scopes: ["newsroom.publish"],
  confirmation: {
    async question({ items }, ports) {
      return `Publish ${items.length} article${items.length === 1 ? "" : "s"} on the public site: ${await describeArticles(ports, items)}?`;
    },
  },
});

export const adminUnpublishArticles = defineSpec({
  ...base,
  name: "admin_unpublish_articles",
  title: "Unpublish many newsroom articles",
  description:
    `Take several published articles off the public site and return them to draft; text and first publication dates are kept.${batchNote("articles")}`,
  input: z.object({ items: z.array(refItem).min(1).max(batchLimit) }),
  output: articleBatchResult(z.literal("unpublished")),
  annotations: write,
  scopes: ["newsroom.publish"],
  confirmation: {
    async question({ items }, ports) {
      return `Take ${items.length} article${items.length === 1 ? "" : "s"} off the public site: ${await describeArticles(ports, items)}?`;
    },
  },
});

export const adminDeleteArticles = defineSpec({
  ...base,
  name: "admin_delete_articles",
  title: "Delete many newsroom articles",
  description: `Permanently delete several articles, whatever their status.${batchNote("articles")}`,
  input: z.object({ items: z.array(refItem).min(1).max(batchLimit) }),
  output: articleBatchResult(z.literal("deleted")),
  annotations: destructive,
  scopes: ["newsroom.publish"],
  confirmation: {
    async question({ items }, ports) {
      return `Permanently delete ${items.length} article${items.length === 1 ? "" : "s"}: ${await describeArticles(ports, items)}?`;
    },
  },
});

export const articleSpecs = [
  adminListArticles,
  adminGetArticle,
  adminCreateArticle,
  adminUpdateArticle,
  adminPublishArticle,
  adminUnpublishArticle,
  adminDeleteArticle,
  adminCreateArticles,
  adminUpdateArticles,
  adminPublishArticles,
  adminUnpublishArticles,
  adminDeleteArticles,
] as const;
