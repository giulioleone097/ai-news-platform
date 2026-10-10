import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";

import { MemoryEditorialRepository } from "@/modules/editorial/infrastructure/memory-editorial-repository";

import { handlePublicMcpRequest } from "./http";
import { publicMcpProtocolVersion } from "./metadata";

/** Test-only JSON-RPC client for the public MCP route handler. */
export function rpcRequest(body: unknown, version = publicMcpProtocolVersion) {
  const message = (typeof body === "object" && body !== null ? body : {}) as {
    method?: unknown;
    params?: { name?: unknown; uri?: unknown };
  };
  const method = message.method === undefined ? undefined : String(message.method);
  // MCP-Name mirrors params.name (tools, prompts) or params.uri (resources).
  const target = message.params?.name ?? message.params?.uri;
  const name = target === undefined ? undefined : String(target);
  const modern = version === publicMcpProtocolVersion;
  return new Request("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": version,
      ...(modern && method ? { "MCP-Method": method } : {}),
      ...(modern && name ? { "MCP-Name": name } : {}),
    },
    body: JSON.stringify(body),
  });
}

export async function sendRpc(body: unknown, version = publicMcpProtocolVersion) {
  const repository = new MemoryEditorialRepository();
  const response = await handlePublicMcpRequest(rpcRequest(body, version), repository);
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
      [PROTOCOL_VERSION_META_KEY]: publicMcpProtocolVersion,
      [CLIENT_INFO_META_KEY]: { name: "neura-test", version: "2.0.0" },
      [CLIENT_CAPABILITIES_META_KEY]: clientCapabilities,
    },
  };
}
