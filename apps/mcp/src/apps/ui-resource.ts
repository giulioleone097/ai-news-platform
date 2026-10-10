import type { McpServer } from "@modelcontextprotocol/server";

import { getMcpUiDomain } from "@atlasnews/adapters/config/env";
import { newsroomAppUri } from "@atlasnews/contract";

import { securitySchemes } from "../auth";

import { renderNewsroomWidget } from "./newsroom-widget";

/** The URI lives in the contract; bump its version segment whenever the widget HTML changes so hosts drop cached copies. */
export const newsroomUiUri = newsroomAppUri;
export const mcpAppMimeType = "text/html;profile=mcp-app";

type Visibility = "model" | "app";

/** Tool `_meta` that renders a tool's result in the AtlasNews newsroom MCP App. */
export function newsroomToolMeta(
  options: {
    visibility?: Visibility[];
    entrypoint?: { type: "global" } | { type: "thread" };
  } = {},
) {
  return {
    securitySchemes: securitySchemes([]),
    ui: {
      resourceUri: newsroomUiUri,
      ...(options.visibility ? { visibility: options.visibility } : {}),
    },
    // Pre-standard key still read by older MCP Apps hosts.
    "ui/resourceUri": newsroomUiUri,
    ...(options.entrypoint
      ? { "openai/ui": { entrypoints: [options.entrypoint] } }
      : {}),
  };
}

export interface NewsroomAppOptions {
  siteUrl: URL;
  /** Extra origins that serve article images, such as Supabase Storage. */
  assetOrigins: string[];
  version: string;
}

export function registerNewsroomResource(server: McpServer, options: NewsroomAppOptions) {
  const resourceDomains = [...new Set([options.siteUrl.origin, ...options.assetOrigins])];
  const uiDomain = getMcpUiDomain();

  server.registerResource(
    "atlasnews-newsroom",
    newsroomUiUri,
    {
      title: "AtlasNews newsroom",
      description: "Interactive AtlasNews AI news reader for ChatGPT, Claude and other MCP Apps hosts.",
      mimeType: mcpAppMimeType,
    },
    async () => ({
      contents: [
        {
          uri: newsroomUiUri,
          mimeType: mcpAppMimeType,
          text: renderNewsroomWidget({
            siteOrigin: options.siteUrl.origin,
            version: options.version,
          }),
          _meta: {
            ui: {
              csp: { resourceDomains, connectDomains: [] },
              prefersBorder: true,
              // Only when the operator configures it; other hosts derive their own domain.
              ...(uiDomain ? { domain: uiDomain } : {}),
            },
            // Lets ChatGPT pick a display mode before the app initializes.
            "openai/ui": {
              availableDisplayModes: ["inline", "fullscreen"],
              preferredDisplayMode: "inline",
            },
          },
        },
      ],
    }),
  );
}
