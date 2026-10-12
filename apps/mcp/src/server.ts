import { McpServer } from "@modelcontextprotocol/server";

import { getContentMode, getPublicSiteUrl, getSupabaseEnvironment } from "@atlasnews/adapters/config/env";
import { createMcpEventsService } from "@atlasnews/adapters/mcp-events/lazy-service";
import {
  mcpCapabilities,
  type CapabilityPorts,
  type Principal,
  type Scope,
} from "@atlasnews/contract";
import type { McpEventsService } from "@atlasnews/core/mcp-events/application/mcp-events-service";

import { registerCapabilities } from "./adapter";
import { registerMcpApps, type McpAppsOptions } from "./apps";
import { registerMcpEvents } from "./events/register";
import { mcpServerName, mcpServerVersion } from "./metadata";

export function defaultMcpAppsOptions(): McpAppsOptions {
  const siteUrl = getPublicSiteUrl();
  // Uploaded media: the site itself serves them on Sites, Supabase Storage otherwise.
  const supabase = getContentMode() === "sites" ? null : getSupabaseEnvironment();
  return {
    siteUrl,
    assetOrigins: supabase ? [new URL(supabase.url).origin] : getContentMode() === "sites" ? [siteUrl.origin] : [],
    version: mcpServerVersion,
  };
}

/**
 * How long a 2026-07-28 client may reuse a list result (2025-era responses never carry these). The tool list
 * changes only with a deployment and is the same for every caller, but `private` keeps it out of shared
 * caches; the resource list follows the published articles, so it is kept short.
 */
const cacheHints = {
  "tools/list": { ttlMs: 300_000, cacheScope: "private" },
  "resources/list": { ttlMs: 60_000, cacheScope: "private" },
} as const;

export interface AtlasNewsServerOptions {
  ports: CapabilityPorts;
  principal: Principal;
  challenge(missing: readonly Scope[]): string;
  apps?: McpAppsOptions;
  events?: McpEventsService | null;
}

/** One server for every caller: the catalogue tools, the MCP Apps surface and MCP Events. */
export function createAtlasNewsServer({
  ports,
  principal,
  challenge,
  apps = defaultMcpAppsOptions(),
  events = createMcpEventsService(),
}: AtlasNewsServerOptions) {
  const icon = {
    src: new URL("/mcp/atlasnews-icon.svg", apps.siteUrl).href,
    mimeType: "image/svg+xml",
    sizes: ["any"],
  };
  const server = new McpServer({
    name: mcpServerName,
    title: "AtlasNews",
    version: mcpServerVersion,
    websiteUrl: apps.siteUrl.origin,
    icons: [icon],
  }, { cacheHints });

  registerCapabilities(server, mcpCapabilities, { ports, principal, challenge });
  registerMcpApps(server, ports.articles, apps, [icon]);
  registerMcpEvents(server, { service: events, subscriber: principal.kind === "anonymous" ? null : principal.subject });
  return server;
}
