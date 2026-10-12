import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { ArticleRepository } from "@atlasnews/core/editorial/domain/article-repository";

import { readOnly, searchPublishedAcrossLocales, sourceUnavailableMessage } from "@atlasnews/contract";

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
        const found = await searchPublishedAcrossLocales(reader, {
          query: text.length >= 2 ? text : undefined,
          perLocale: 5,
          limit: 10,
        });
        return { content: [], structuredContent: { items: found.map(articleResourceLink) } };
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
