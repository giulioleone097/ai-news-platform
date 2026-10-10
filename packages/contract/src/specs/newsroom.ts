import * as z from "zod/v4";

import { locales } from "@atlasnews/core/locale";
import {
  articleStatuses,
  socialChannels,
  storyLimits,
} from "@atlasnews/core/editorial/domain/article";
import { distributionStatuses, newsletterStatuses } from "@atlasnews/core/editorial/domain/editorial-operations";
import { isAllowedEditorialImageSource } from "@atlasnews/core/editorial/domain/editorial-image";

import { destructive, readOnly, write } from "../annotations";
import { defineSpec } from "../capability";
import {
  claimStatusSchema,
  entityRefOutputSchema,
  entitySlugSchema,
  sourceOutputSchema,
} from "./shared";

const localeSchema = z.enum(locales);
const statusSchema = z.enum(articleStatuses);
const channelSchema = z.enum(socialChannels);
const idSchema = z.string().uuid();
const entityIdSchema = z.string().trim().min(1).max(160);
const slugSchema = z.string().trim().min(1).max(96).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const webUrlSchema = z.string().trim().max(2_048).refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
});
const mediaTypeSchema = z.enum(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);
const mediaPathSchema = z.string().trim().min(1).max(256).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
const record = z.record(z.string(), z.unknown());
const editorialUnavailable = "The editorial operation could not be completed.";

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

const articleFields = {
  locale: localeSchema,
  title: z.string().trim().min(8).max(180),
  slug: slugSchema.optional(),
  excerpt: z.string().trim().min(20).max(360),
  content: z.string().trim().min(20).max(100_000),
  categorySlug: slugSchema,
  status: statusSchema,
  featured: z.boolean().optional(),
  coverImage: z.string().trim().min(1).max(2_048)
    .refine(isAllowedEditorialImageSource, "Use bundled media or the configured editorial bucket")
    .optional(),
  coverAlt: z.string().trim().min(3).max(240).optional(),
  scheduledFor: z.string().datetime().nullable().optional(),
  distribution: z.array(channelSchema).max(socialChannels.length).optional(),
  ...storyFields,
} as const;

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

export const adminListArticles = defineSpec({
  name: "admin_list_articles",
  title: "List newsroom articles",
  description: "List all AtlasNews newsroom articles, including drafts, for one locale.",
  input: z.object({ locale: localeSchema }),
  output: z.object({ items: z.array(newsroomArticleSchema) }),
  annotations: readOnly,
  scopes: ["newsroom.read"],
  surfaces: ["mcp"],
  unavailableMessage: editorialUnavailable,
});

export const adminGetArticle = defineSpec({
  name: "admin_get_article",
  title: "Get newsroom article",
  description: "Get a complete newsroom article by ID and locale.",
  input: z.object({ id: idSchema, locale: localeSchema }),
  output: articleResult,
  annotations: readOnly,
  scopes: ["newsroom.read"],
  surfaces: ["mcp"],
  unavailableMessage: editorialUnavailable,
});

export const adminListCategories = defineSpec({
  name: "admin_list_categories",
  title: "List newsroom categories",
  description: "List valid editorial categories for one locale.",
  input: z.object({ locale: localeSchema }),
  output: z.object({ categories: z.array(record) }),
  annotations: readOnly,
  scopes: ["newsroom.read"],
  surfaces: ["mcp"],
  unavailableMessage: editorialUnavailable,
});

export const adminCreateArticle = defineSpec({
  name: "admin_create_article",
  title: "Create newsroom article",
  description: "Create an editorial article. Draft is the safest default status.",
  input: z.object({ ...articleFields, status: statusSchema.default("draft") }),
  output: articleResult,
  annotations: write,
  scopes: ["newsroom.write"],
  surfaces: ["mcp"],
  unavailableMessage: editorialUnavailable,
});

export const adminUpdateArticle = defineSpec({
  name: "admin_update_article",
  title: "Update newsroom article",
  description: "Update selected fields of an existing editorial article.",
  input: z.object({
    id: idSchema,
    locale: localeSchema,
    title: articleFields.title.optional(),
    slug: articleFields.slug,
    excerpt: articleFields.excerpt.optional(),
    content: articleFields.content.optional(),
    categorySlug: articleFields.categorySlug.optional(),
    status: statusSchema.optional(),
    featured: articleFields.featured,
    coverImage: articleFields.coverImage,
    coverAlt: articleFields.coverAlt,
    scheduledFor: articleFields.scheduledFor,
    distribution: articleFields.distribution,
    ...storyFields,
  }),
  output: articleResult,
  annotations: write,
  scopes: ["newsroom.write"],
  surfaces: ["mcp"],
  unavailableMessage: editorialUnavailable,
});

export const adminPublishArticle = defineSpec({
  name: "admin_publish_article",
  title: "Publish newsroom article",
  description: "Publish an existing article immediately on the public site.",
  input: z.object({ id: idSchema, locale: localeSchema }),
  output: articleResult,
  annotations: write,
  scopes: ["newsroom.publish"],
  surfaces: ["mcp"],
  confirmation: {
    async question({ id, locale }, ports) {
      const article = await (await ports.editorial()).findById(id, locale).catch(() => null);
      return `Publish “${article?.title ?? id}” on /${locale}?`;
    },
  },
  unavailableMessage: editorialUnavailable,
});

export const adminDeleteArticle = defineSpec({
  name: "admin_delete_article",
  title: "Delete newsroom article",
  description: "Permanently delete an article.",
  input: z.object({ id: idSchema, locale: localeSchema }),
  output: z.object({ deletedId: z.string() }),
  annotations: destructive,
  scopes: ["newsroom.publish"],
  surfaces: ["mcp"],
  confirmation: {
    async question({ id, locale }, ports) {
      const article = await (await ports.editorial()).findById(id, locale).catch(() => null);
      return `Permanently delete “${article?.title ?? id}” from /${locale}?`;
    },
  },
  unavailableMessage: editorialUnavailable,
});

export const adminListDistribution = defineSpec({
  name: "admin_list_distribution",
  title: "List distribution workflow",
  description: "List saved newsletter and social publication workflow items for one locale.",
  input: z.object({ locale: localeSchema }),
  output: z.object({ items: z.array(record) }),
  annotations: readOnly,
  scopes: ["newsroom.read"],
  surfaces: ["mcp"],
  unavailableMessage: editorialUnavailable,
});

export const adminUpdateDistribution = defineSpec({
  name: "admin_update_distribution",
  title: "Update distribution workflow",
  description:
    "Update channel copy, scheduling, external URL and verified workflow status. This does not post to an external network.",
  input: z.object({
    id: entityIdSchema,
    status: z.enum(distributionStatuses),
    message: z.string().trim().max(1_000).optional(),
    externalUrl: webUrlSchema.optional(),
    scheduledFor: z.string().datetime().nullable().optional(),
  }),
  output: z.object({ publication: record }),
  annotations: write,
  scopes: ["newsroom.write"],
  surfaces: ["mcp"],
  unavailableMessage: editorialUnavailable,
});

export const adminListNewsletterSubscriptions = defineSpec({
  name: "admin_list_newsletter_subscriptions",
  title: "List newsletter subscriptions",
  description:
    "List the consented newsletter registry for one locale. Results contain personal data and require an editor sign-in.",
  input: z.object({
    locale: localeSchema,
    query: z.string().trim().min(1).max(120).optional(),
    status: z.enum(newsletterStatuses).optional(),
    limit: z.number().int().min(1).max(500).default(100),
    offset: z.number().int().min(0).max(1_000_000).default(0),
  }),
  output: z.looseObject({ items: z.array(record), total: z.number() }),
  annotations: readOnly,
  scopes: ["newsroom.read"],
  surfaces: ["mcp"],
  unavailableMessage: editorialUnavailable,
});

export const adminUpdateNewsletterSubscription = defineSpec({
  name: "admin_update_newsletter_subscription",
  title: "Update newsletter subscription",
  description:
    "Unsubscribe a consent-registry entry without deleting its audit record. Reactivation always requires double opt-in.",
  input: z.object({ id: entityIdSchema, status: z.literal("unsubscribed") }),
  output: z.object({ id: z.string(), status: z.string() }),
  annotations: write,
  scopes: ["newsroom.write"],
  surfaces: ["mcp"],
  unavailableMessage: editorialUnavailable,
});

export const adminListMedia = defineSpec({
  name: "admin_list_media",
  title: "List newsroom media",
  description: "List immutable assets in the configured editorial media store.",
  input: z.object({}),
  output: z.object({ writable: z.boolean(), items: z.array(record) }),
  annotations: readOnly,
  scopes: ["newsroom.read"],
  surfaces: ["mcp"],
  unavailableMessage: editorialUnavailable,
});

export const adminUploadMedia = defineSpec({
  name: "admin_upload_media",
  title: "Upload newsroom media",
  description: "Upload a base64 image up to 160 KiB. Larger assets should use AtlasNews Studio.",
  input: z.object({
    name: z.string().trim().min(1).max(160),
    mimeType: mediaTypeSchema,
    dataBase64: z.string().min(4).max(220_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  }),
  output: z.object({ asset: record }),
  annotations: write,
  scopes: ["newsroom.write"],
  surfaces: ["mcp"],
  unavailableMessage: editorialUnavailable,
});

export const adminDeleteMedia = defineSpec({
  name: "admin_delete_media",
  title: "Delete newsroom media",
  description: "Delete an unused immutable media asset.",
  input: z.object({ path: mediaPathSchema }),
  output: z.object({ deletedPath: z.string() }),
  annotations: destructive,
  scopes: ["newsroom.publish"],
  surfaces: ["mcp"],
  confirmation: { question: ({ path }) => `Permanently delete the media asset “${path}”?` },
  unavailableMessage: editorialUnavailable,
});
