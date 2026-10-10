import * as z from "zod/v4";

import { locales } from "@/i18n";
import { slugPattern } from "@/modules/editorial/domain/article";

/** Events cover published (public) data only, so every subscriber is the same principal. */
export const mcpEventPrincipal = "public";

export const mcpEventNames = ["article.published"] as const;
export type McpEventName = (typeof mcpEventNames)[number];

export function isMcpEventName(value: string): value is McpEventName {
  return (mcpEventNames as readonly string[]).includes(value);
}

export const articlePublishedArgumentsSchema = z
  .object({
    locale: z
      .enum(locales)
      .optional()
      .describe("Only notify for articles published in this locale (en or it). Omit to receive both."),
    category: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(slugPattern)
      .optional()
      .describe(
        "Only notify for articles in this locale-specific category slug, as returned by list_categories. Omit to receive every category.",
      ),
  })
  .strict();

export type ArticlePublishedArguments = z.infer<typeof articlePublishedArgumentsSchema>;

const nonEmpty = z.string().min(1);

export const articlePublishedDataSchema = z
  .object({
    article_slug: nonEmpty.describe("Locale-specific slug of the published article."),
    locale: z.enum(locales).describe("Locale of the published article."),
    title: nonEmpty.describe("Article headline."),
    excerpt: z.string().describe("Short article summary."),
    category_slug: nonEmpty.describe("Locale-specific category slug."),
    category_name: nonEmpty.describe("Localized category name."),
    url: nonEmpty.describe("Absolute canonical URL of the article."),
    published_at: nonEmpty.describe("ISO 8601 publication timestamp."),
  })
  .strict();

export type ArticlePublishedData = z.infer<typeof articlePublishedDataSchema>;

export interface McpEventDefinition {
  name: McpEventName;
  description: string;
  delivery: ["webhook"];
  inputSchema: Record<string, unknown>;
  payloadSchema: Record<string, unknown>;
}

function jsonSchema(schema: z.ZodType, io: "input" | "output") {
  const generated = z.toJSONSchema(schema, { io }) as Record<string, unknown>;
  delete generated.$schema;
  return generated;
}

export function listMcpEventDefinitions(): McpEventDefinition[] {
  return [
    {
      name: "article.published",
      description:
        "A new article was published on NEURA AI News. Fires once per published article and locale; optionally filtered by locale and category slug.",
      delivery: ["webhook"],
      inputSchema: jsonSchema(articlePublishedArgumentsSchema, "input"),
      payloadSchema: jsonSchema(articlePublishedDataSchema, "output"),
    },
  ];
}

/** Webhook body: application fields live in `data`; `cursor` is always null (no replay). */
export interface McpWebhookEvent {
  eventId: string;
  name: McpEventName;
  timestamp: string;
  data: ArticlePublishedData;
  cursor: null;
}

export interface PublishedArticle {
  id: string;
  slug: string;
  locale: ArticlePublishedData["locale"];
  title: string;
  excerpt: string;
  categorySlug: string;
  categoryName: string;
  publishedAt: string;
}

export function matchesArticleFilter(filter: ArticlePublishedArguments, article: PublishedArticle) {
  return (!filter.locale || filter.locale === article.locale)
    && (!filter.category || filter.category === article.categorySlug);
}
