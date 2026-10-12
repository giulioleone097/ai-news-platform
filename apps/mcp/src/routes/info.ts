import { getMcpOAuthEnvironment } from "@atlasnews/adapters/config/env";
import { mcpCapabilities, scopes } from "@atlasnews/contract";
import { defaultLocale, locales } from "@atlasnews/core/locale";
import { mcpEventNames } from "@atlasnews/core/mcp-events/domain/events";

import { appToolNames } from "../apps";
import { newsroomEntrypointTools } from "../apps/entrypoints";
import { articleResourceTemplate } from "../apps/article-resources";
import { newsroomUiUri } from "../apps/ui-resource";
import { mcpProtocolVersion, mcpServerName, mcpServerVersion } from "../metadata";

export function GET() {
  const tools = (anonymousOnly: boolean) => [
    ...mcpCapabilities
      .filter((capability) => (capability.scopes.length === 0) === anonymousOnly)
      .map((capability) => capability.name),
    ...(anonymousOnly ? appToolNames : []),
  ];

  return Response.json(
    {
      name: mcpServerName,
      version: mcpServerVersion,
      description:
        "AtlasNews published AI news and approved comments in English and Italian, plus newsroom tools for signed-in editors.",
      protocol: {
        name: "Model Context Protocol",
        version: mcpProtocolVersion,
        transport: "streamable-http",
        endpoint: "/mcp",
        stateless: true,
        responseMode: "auto-modern/sse-legacy",
        requestHeaders: {
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
          "MCP-Protocol-Version": mcpProtocolVersion,
          "MCP-Method": "<json-rpc method>",
          "MCP-Name": "<tool name for tools/call>",
        },
      },
      access: {
        anonymous: "read-only tools",
        authenticated: "Authorization: Bearer <token>; every tool declares the scopes it needs",
        scopes,
        // The route answers 404 while no OAuth server is configured, so it is not advertised then.
        resourceMetadata: getMcpOAuthEnvironment() ? "/.well-known/oauth-protected-resource" : null,
      },
      internationalization: {
        defaultLocale,
        locales,
      },
      capabilities: {
        tools: { anonymous: tools(true), scoped: tools(false) },
        resources: [articleResourceTemplate, newsroomUiUri],
        prompts: false,
        events: {
          names: mcpEventNames,
          delivery: "webhook",
          availability: "requires service-role persistence",
        },
      },
      apps: {
        uiResource: newsroomUiUri,
        entrypoints: { global: newsroomEntrypointTools[0], thread: newsroomEntrypointTools[1] },
        openaiExtensions: ["openai/ui", "openai/mentions", "openai/elicitation", "openai/message", "openai/modelContext", "openai/deepLink"],
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
