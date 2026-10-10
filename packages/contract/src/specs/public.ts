import * as z from "zod/v4";

import { locales } from "@atlasnews/core/locale";
import { decodeArticleCursor } from "@atlasnews/core/editorial/application/public-feed";

import { readOnly } from "../annotations";
import { defineSpec } from "../capability";
import {
  articleOutputSchema,
  articleSlugSchema,
  articleSummaryOutputSchema,
  categoryOutputSchema,
  categorySlugSchema,
  localeSchema,
  newsroomAppUri,
} from "./shared";

const encodedCursorSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => decodeArticleCursor(value) !== null, "Invalid article cursor.")
  .describe("Opaque cursor returned by a previous list_articles call.");

const publicCommentOutputSchema = z.object({
  id: z.string().uuid(),
  articleId: z.string().uuid(),
  locale: z.enum(locales),
  parentId: z.string().uuid().nullable(),
  body: z.string(),
  displayName: z.string(),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
  replyCount: z.number().int().nonnegative(),
});

export const listArticles = defineSpec({
  name: "list_articles",
  title: "List published AI news",
  description:
    "List published AtlasNews articles in English or Italian with cursor pagination. English is the default.",
  input: z.object({
    locale: localeSchema,
    category: categorySlugSchema.optional(),
    limit: z.number().int().min(1).max(25).default(10),
    cursor: encodedCursorSchema.optional(),
  }),
  output: z.object({
    items: z.array(articleSummaryOutputSchema),
    nextCursor: z.string().nullable(),
  }),
  annotations: readOnly,
  scopes: [],
  surfaces: ["mcp"],
  ui: newsroomAppUri,
});

export const getArticle = defineSpec({
  name: "get_article",
  title: "Get a published AI news article",
  description: "Get the complete body and public metadata for one published AtlasNews article.",
  input: z.object({ locale: localeSchema, slug: articleSlugSchema }),
  output: z.object({ article: articleOutputSchema }),
  annotations: readOnly,
  scopes: [],
  surfaces: ["mcp"],
  ui: newsroomAppUri,
});

export const listCategories = defineSpec({
  name: "list_categories",
  title: "List AI news categories",
  description: "List the available AtlasNews editorial categories in English or Italian.",
  input: z.object({ locale: localeSchema }),
  output: z.object({ categories: z.array(categoryOutputSchema) }),
  annotations: readOnly,
  scopes: [],
  surfaces: ["mcp"],
});

export const listComments = defineSpec({
  name: "list_comments",
  title: "List approved article comments",
  description:
    "List approved top-level comments or replies for a published article with keyset pagination.",
  input: z.object({
    slug: articleSlugSchema,
    locale: localeSchema,
    parentId: z.string().uuid().nullable().optional(),
    cursor: z.string().trim().min(1).max(512).optional(),
    limit: z.number().int().min(1).max(24).default(12),
  }),
  output: z.object({
    items: z.array(publicCommentOutputSchema),
    nextCursor: z.string().nullable(),
  }),
  annotations: readOnly,
  scopes: [],
  surfaces: ["mcp"],
});

/** The standard `search` tool that ChatGPT uses to treat a site as a knowledge source. */
export const search = defineSpec({
  name: "search",
  title: "Search AtlasNews",
  description:
    "Search published AtlasNews articles in English and Italian. Returns ids, titles and URLs; pass an id to fetch.",
  input: z.object({ query: z.string().trim().min(2).max(160).describe("A single query string.") }),
  output: z.object({
    results: z.array(z.object({ id: z.string(), title: z.string(), url: z.string() })),
  }),
  annotations: readOnly,
  scopes: [],
  surfaces: ["mcp"],
});

/** The standard `fetch` tool: the full article for an id returned by `search`. */
export const fetchArticle = defineSpec({
  name: "fetch",
  title: "Fetch an AtlasNews article",
  description:
    "Retrieve one published AtlasNews article as Markdown by the id that search returned.",
  input: z.object({
    id: z.string().trim().min(3).max(200).describe("An id returned by search, such as en/some-article."),
  }),
  output: z.object({
    id: z.string(),
    title: z.string(),
    text: z.string(),
    url: z.string(),
    metadata: z.record(z.string(), z.union([z.string(), z.number()])),
  }),
  annotations: readOnly,
  scopes: [],
  surfaces: ["mcp"],
});
