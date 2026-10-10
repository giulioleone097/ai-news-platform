import * as z from "zod/v4";

import { defaultLocale, locales } from "@atlasnews/core/locale";
import { slugPattern } from "@atlasnews/core/editorial/domain/article";

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

export const categoryOutputSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
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
});

export const articleOutputSchema = articleSummaryOutputSchema.extend({
  content: z.string(),
  coverImage: z.string(),
  coverAlt: z.string(),
  author: z.object({ name: z.string(), role: z.string() }),
  updatedAt: z.string(),
});
