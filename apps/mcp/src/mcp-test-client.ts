import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";

import { MemoryEditorialRepository } from "@atlasnews/adapters/editorial/memory-editorial-repository";
import { siteLinks, type CapabilityPorts } from "@atlasnews/contract";
import type { EditorialCacheInvalidator } from "@atlasnews/core/editorial/application/cache-port";

import { apiKeyVerifier } from "./auth";
import { handleMcpRequest } from "./http";
import { mcpProtocolVersion } from "./metadata";

export const testApiKey = "test-only-admin-key-with-at-least-32-characters";

/** Ports over the in-memory repository; operational services are not configured, as in demo mode. */
export function memoryPorts(
  repository = new MemoryEditorialRepository(),
  invalidateCache: EditorialCacheInvalidator = () => undefined,
): CapabilityPorts {
  const unavailable = async () => {
    throw new Error("not configured");
  };
  return {
    site: siteLinks(new URL("http://localhost:3000")),
    articles: repository,
    invalidateCache,
    publicComments: unavailable,
    editorial: async () => repository,
    moderation: unavailable,
    commentNotifications: unavailable,
    newsletter: unavailable,
    social: unavailable,
  };
}

/** Test-only JSON-RPC client for the MCP endpoint. */
export function rpcRequest(body: unknown, version = mcpProtocolVersion, authorization?: string) {
  const message = (typeof body === "object" && body !== null ? body : {}) as {
    method?: unknown;
    params?: { name?: unknown; uri?: unknown };
  };
  const method = message.method === undefined ? undefined : String(message.method);
  // MCP-Name mirrors params.name (tools, prompts) or params.uri (resources).
  const target = message.params?.name ?? message.params?.uri;
  const name = target === undefined ? undefined : String(target);
  const modern = version === mcpProtocolVersion;
  return new Request("http://localhost:8787/mcp", {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": version,
      ...(modern && method ? { "MCP-Method": method } : {}),
      ...(modern && name ? { "MCP-Name": name } : {}),
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify(body),
  });
}

export async function sendRpc(
  body: unknown,
  version = mcpProtocolVersion,
  options: { authorization?: string; ports?: CapabilityPorts } = {},
) {
  const ports = options.ports ?? memoryPorts();
  const response = await handleMcpRequest(rpcRequest(body, version, options.authorization), {
    verifier: apiKeyVerifier(() => testApiKey),
    createPorts: () => ports,
  });
  const text = await response.text();
  const payload = response.headers.get("content-type")?.includes("text/event-stream")
    ? JSON.parse(text.split("\n").find((line) => line.startsWith("data: "))!.slice(6))
    : JSON.parse(text);
  return { response, payload };
}

export function modernParams(
  params: Record<string, unknown> = {},
  clientCapabilities: Record<string, unknown> = {},
) {
  return {
    ...params,
    _meta: {
      [PROTOCOL_VERSION_META_KEY]: mcpProtocolVersion,
      [CLIENT_INFO_META_KEY]: { name: "atlasnews-test", version: "2.0.0" },
      [CLIENT_CAPABILITIES_META_KEY]: clientCapabilities,
    },
  };
}
