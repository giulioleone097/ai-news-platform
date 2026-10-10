import type { Icon, McpServer } from "@modelcontextprotocol/server";

import type { ArticleRepository } from "@/modules/editorial/domain/article-repository";

import { registerArticleResources } from "./article-resources";
import { registerBriefingTool } from "./briefing";
import { registerNewsroomEntrypoints } from "./entrypoints";
import { registerMentionSearch } from "./mentions";
import { registerNewsroomResource, type NewsroomAppOptions } from "./ui-resource";

export type McpAppsOptions = NewsroomAppOptions;

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
