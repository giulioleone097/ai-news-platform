import type { Icon, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { locales } from "@atlasnews/core/locale";
import { encodeArticleCursor } from "@atlasnews/core/editorial/application/public-feed";
import type { ArticleRepository } from "@atlasnews/core/editorial/domain/article-repository";

import {
  articleSummaryOutputSchema,
  categoryOutputSchema,
  categorySlugSchema,
  localeSchema,
  readOnlyAnnotations,
  safely,
  toArticleSummary,
  toCategory,
} from "../public-presenters";
import { newsroomToolMeta } from "./ui-resource";

type EntrypointReader = Pick<ArticleRepository, "listPublished" | "listCategories">;

export const newsroomEntrypointTools = ["open_newsroom", "open_news_panel"] as const;

/** Entrypoint tools must accept `{}`; ChatGPT opens them without model involvement. */
const inputSchema = {
  locale: localeSchema,
  category: categorySlugSchema.optional(),
};

const outputSchema = {
  locale: z.enum(locales),
  items: z.array(articleSummaryOutputSchema),
  nextCursor: z.string().nullable(),
  categories: z.array(categoryOutputSchema),
};

export function registerNewsroomEntrypoints(
  server: McpServer,
  reader: EntrypointReader,
  icons: Icon[],
) {
  const openFeed = async ({ locale, category }: { locale: (typeof locales)[number]; category?: string }) =>
    safely(async () => {
      const [page, categories] = await Promise.all([
        reader.listPublished({ locale, category, limit: 12 }),
        reader.listCategories(locale),
      ]);
      return {
        locale,
        items: page.items.map(toArticleSummary),
        nextCursor: encodeArticleCursor(page.nextCursor),
        categories: categories.map(toCategory),
      };
    });

  server.registerTool(
    "open_newsroom",
    {
      title: "NEURA",
      description:
        "Open the NEURA AI newsroom fullscreen from the ChatGPT sidebar: latest stories, categories, search and reading.",
      inputSchema,
      outputSchema,
      annotations: readOnlyAnnotations,
      icons,
      _meta: newsroomToolMeta({ visibility: ["app"], entrypoint: { type: "global" } }),
    },
    openFeed,
  );

  server.registerTool(
    "open_news_panel",
    {
      title: "AI news beside chat",
      description:
        "Open a NEURA reading panel next to the current conversation to browse stories and add them to the chat.",
      inputSchema,
      outputSchema,
      annotations: readOnlyAnnotations,
      icons,
      _meta: newsroomToolMeta({ visibility: ["app"], entrypoint: { type: "thread" } }),
    },
    openFeed,
  );
}
