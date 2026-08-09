import { createMcpHandler } from "@modelcontextprotocol/server";

import type { ArticleRepository } from "@/modules/editorial/domain/article-repository";

import { authorizeAdminMcpRequest } from "./admin-auth";
import { createAdminMcpServer } from "./admin-server";
import { readBoundedMcpRequest } from "./http";

function errorResponse(status: number, code: number, message: string) {
  const response = Response.json({ jsonrpc: "2.0", error: { code, message }, id: null }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
  if (status === 401) response.headers.set("WWW-Authenticate", 'Bearer realm="neura-mcp-admin"');
  return response;
}

export function adminMcpMethodNotAllowedResponse() {
  const response = errorResponse(405, -32000, "Method not allowed.");
  response.headers.set("Allow", "POST");
  return response;
}

export async function handleAdminMcpRequest(
  request: Request,
  getRepository: () => ArticleRepository,
) {
  const auth = authorizeAdminMcpRequest(request);
  if (!auth.ok) return errorResponse(auth.status, -32001, auth.message);

  let bounded: Request | null;
  try {
    bounded = await readBoundedMcpRequest(request);
  } catch {
    return errorResponse(400, -32700, "Invalid request body.");
  }
  if (!bounded) return errorResponse(413, -32002, "Request body too large.");

  let repository: ArticleRepository;
  try {
    repository = getRepository();
  } catch {
    return errorResponse(503, -32003, "Admin MCP persistence is not configured.");
  }

  const handler = createMcpHandler(() => createAdminMcpServer(repository), {
    legacy: "stateless",
    responseMode: "auto",
  });
  try {
    const response = await handler.fetch(bounded);
    await handler.close().catch(() => undefined);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(response.body, { status: response.status, headers });
  } catch {
    await handler.close().catch(() => undefined);
    return errorResponse(500, -32603, "Internal server error.");
  }
}
