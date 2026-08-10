import { defaultLocale, locales } from "@/i18n";
import {
  adminMcpTools,
  publicMcpProtocolVersion,
  publicMcpTools,
} from "@/modules/mcp/metadata";

export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      name: "neura-ai-news",
      version: "2.0.0",
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
        resources: false,
        prompts: false,
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
