import * as z from "zod/v4";

import { defaultLocale, locales } from "@atlasnews/core/locale";
import { claimStatuses, slugPattern } from "@atlasnews/core/editorial/domain/article";
import { entityKinds } from "@atlasnews/core/editorial/domain/entity";

/** The newsroom MCP App that renders article tools in hosts that support MCP Apps. */
export const newsroomAppUri = "ui://atlasnews/newsroom-v1.html";

export const localeSchema = z
  .enum(locales)
  .default(defaultLocale)
  .describe("Content locale. Defaults to English (en).");

export const categorySlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(slugPattern)
  .describe("Locale-specific category slug.");

export const articleSlugSchema = z.string().trim().min(1).max(160).regex(slugPattern);

export const entitySlugSchema = z.string().trim().min(1).max(160).regex(slugPattern);

export const claimStatusSchema = z.enum(claimStatuses);

export const categoryOutputSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
});

export const entityRefOutputSchema = z.object({
  kind: z.enum(entityKinds),
  slug: z.string(),
  name: z.string(),
  isPrimary: z.boolean(),
});

export const sourceOutputSchema = z.object({
  title: z.string(),
  url: z.string(),
  supports: z.string(),
});

export const articleSummaryOutputSchema = z.object({
  locale: z.enum(locales),
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  category: z.object({ slug: z.string(), name: z.string() }),
  publishedAt: z.string(),
  readingMinutes: z.number().int().positive(),
  path: z.string(),
  claimStatus: claimStatusSchema,
  entities: z.array(entityRefOutputSchema),
});

export const articleOutputSchema = articleSummaryOutputSchema.extend({
  content: z.string(),
  coverImage: z.string(),
  coverAlt: z.string(),
  author: z.object({ name: z.string(), role: z.string() }),
  updatedAt: z.string(),
  keyPoints: z.array(z.string()),
  sources: z.array(sourceOutputSchema),
});
