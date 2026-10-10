import { defaultLocale, locales } from "@/i18n";
import {
  adminMcpTools,
  publicMcpProtocolVersion,
  publicMcpServerVersion,
  publicMcpTools,
} from "@/modules/mcp/metadata";
import { newsroomUiUri } from "@/modules/mcp/apps/ui-resource";
import { mcpEventNames } from "@/modules/mcp-events";

export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      name: "neura-ai-news",
      version: publicMcpServerVersion,
      description:
        "Read-only access to NEURA's published AI news and approved comments in English and Italian.",
      protocol: {
        name: "Model Context Protocol",
        version: publicMcpProtocolVersion,
        transport: "streamable-http",
        endpoint: "/api/mcp",
        stateless: true,
        responseMode: "auto-modern/sse-legacy",
        requestHeaders: {
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
          "MCP-Protocol-Version": publicMcpProtocolVersion,
          "MCP-Method": "<json-rpc method>",
          "MCP-Name": "<tool name for tools/call>",
        },
      },
      access: {
        authentication: "none",
        mode: "read-only",
      },
      internationalization: {
        defaultLocale,
        locales,
      },
      capabilities: {
        tools: publicMcpTools,
        resources: ["neura://articles/{locale}/{slug}", newsroomUiUri],
        prompts: false,
        events: {
          names: mcpEventNames,
          delivery: "webhook",
          availability: "requires service-role persistence",
        },
      },
      apps: {
        uiResource: newsroomUiUri,
        entrypoints: { global: "open_newsroom", thread: "open_news_panel" },
        openaiExtensions: ["openai/ui", "openai/mentions", "openai/elicitation", "openai/message", "openai/modelContext", "openai/deepLink"],
      },
      administration: {
        endpoint: "/api/mcp/admin",
        authentication: "bearer-api-key",
        tools: adminMcpTools,
      },
      discovery: {
        server: "server/discover",
        tools: "tools/list",
      },
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    },
  );
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}
