import type { Icon, McpServer } from "@modelcontextprotocol/server";

import type { ArticleRepository } from "@atlasnews/core/editorial/domain/article-repository";

import { registerArticleResources } from "./article-resources";
import { briefingTool, registerBriefingTool } from "./briefing";
import { newsroomEntrypointTools, registerNewsroomEntrypoints } from "./entrypoints";
import { mentionSearchTool, registerMentionSearch } from "./mentions";
import { registerNewsroomResource, type NewsroomAppOptions } from "./ui-resource";

export type McpAppsOptions = NewsroomAppOptions;

/** The tools of the MCP Apps surface; the rest of the tool list comes from the capability catalogue. */
export const appToolNames = [...newsroomEntrypointTools, briefingTool, mentionSearchTool] as const;

type AppsReader = Pick<ArticleRepository, "listPublished" | "findBySlug" | "listCategories">;

/**
 * MCP Apps surface of the public server: the newsroom UI resource, ChatGPT
 * sidebar/thread entrypoints, the form-driven briefing, composer mentions and
 * article resources. Every piece reuses the read-only editorial port.
 */
export function registerMcpApps(
  server: McpServer,
  reader: AppsReader,
  options: McpAppsOptions,
  icons: Icon[],
) {
  registerNewsroomResource(server, options);
  registerNewsroomEntrypoints(server, reader, icons);
  registerBriefingTool(server, reader, options.siteUrl);
  registerMentionSearch(server, reader);
  registerArticleResources(server, reader, options.siteUrl);
}
