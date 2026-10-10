import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { locales } from "@atlasnews/core/locale";
import type { ArticleRepository } from "@atlasnews/core/editorial/domain/article-repository";

import { readOnly, sourceUnavailableMessage } from "@atlasnews/contract";

import { securitySchemes } from "../auth";
import { failure } from "../results";
import { articleResourceLink } from "./article-resources";

type MentionReader = Pick<ArticleRepository, "listPublished">;

export const mentionSearchTool = "search_mentions";
export const openAiMentionsCapability = "openai/mentions";

const resourceLinkSchema = z.object({
  type: z.literal("resource_link"),
  uri: z.string(),
  name: z.string(),
  title: z.string(),
  description: z.string(),
  mimeType: z.string(),
});

/**
 * ChatGPT composer @-mentions: typeahead over published articles in every
 * locale. Results are resource links readable through the article resources.
 */
export function registerMentionSearch(server: McpServer, reader: MentionReader) {
  server.registerTool(
    mentionSearchTool,
    {
      title: "Mention AtlasNews articles",
      description: "Find published AtlasNews articles to mention in the ChatGPT composer.",
      inputSchema: { query: z.string().max(160).describe("Typeahead text, possibly empty.") },
      outputSchema: { items: z.array(resourceLinkSchema) },
      annotations: readOnly,
      _meta: { securitySchemes: securitySchemes([]), ui: { visibility: ["app"] } },
    },
    async ({ query }) => {
      const text = query.trim();
      try {
        const pages = await Promise.all(
          locales.map((locale) =>
            reader.listPublished({ locale, limit: 5, ...(text.length >= 2 ? { query: text } : {}) }),
          ),
        );
        const items = pages
          .flatMap((page) => page.items)
          .sort((left, right) =>
            (right.publishedAt ?? right.updatedAt).localeCompare(left.publishedAt ?? left.updatedAt),
          )
          .slice(0, 10)
          .map(articleResourceLink);
        return { content: [], structuredContent: { items } };
      } catch {
        return failure(sourceUnavailableMessage);
      }
    },
  );

  const capability = { searchTool: mentionSearchTool };
  server.server.registerCapabilities({
    extensions: { [openAiMentionsCapability]: capability },
    // Hosts that negotiate 2025-11-25 read extensions from `experimental`.
    experimental: { [openAiMentionsCapability]: capability },
  });
}
