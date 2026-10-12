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
  readOnly,
  toArticleSummary,
  toCategory,
} from "@atlasnews/contract";

import { safely } from "../results";
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

/** What tells the two ChatGPT entrypoints apart; the input, the output and the handler are shared. */
const entrypoints: Record<
  (typeof newsroomEntrypointTools)[number],
  { title: string; description: string; type: "global" | "thread" }
> = {
  open_newsroom: {
    title: "AtlasNews",
    description:
      "Open the AtlasNews AI newsroom fullscreen from the ChatGPT sidebar: latest stories, categories, search and reading.",
    type: "global",
  },
  open_news_panel: {
    title: "AI news beside chat",
    description:
      "Open a AtlasNews reading panel next to the current conversation to browse stories and add them to the chat.",
    type: "thread",
  },
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

  for (const name of newsroomEntrypointTools) {
    const { title, description, type } = entrypoints[name];
    server.registerTool(
      name,
      {
        title,
        description,
        inputSchema,
        outputSchema,
        annotations: readOnly,
        icons,
        _meta: newsroomToolMeta({ visibility: ["app"], entrypoint: { type } }),
      },
      openFeed,
    );
  }
}
