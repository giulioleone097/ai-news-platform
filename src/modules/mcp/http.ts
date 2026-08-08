import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getAllowedMcpOrigins } from "@/config/env";

import {
  createPublicMcpServer,
  type PublicEditorialReader,
} from "./public-server";

const baseHeaders = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "MCP-Protocol-Version, MCP-Session-Id",
  "Cache-Control": "no-store",
} as const;

function getCorsOrigin(request?: Request) {
  const allowedOrigins = getAllowedMcpOrigins();
  if (!allowedOrigins.length) return "*";
  const origin = request?.headers.get("origin");
  return origin && allowedOrigins.includes(origin) ? origin : null;
}

function withPublicHeaders(response: Response, request?: Request) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(baseHeaders)) {
    headers.set(name, value);
  }
  const corsOrigin = getCorsOrigin(request);
  if (corsOrigin) headers.set("Access-Control-Allow-Origin", corsOrigin);
  if (corsOrigin !== "*") headers.append("Vary", "Origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonRpcError(status: number, code: number, message: string, request?: Request) {
  return withPublicHeaders(
    Response.json(
      {
        jsonrpc: "2.0",
        error: { code, message },
        id: null,
      },
      { status },
    ),
    request,
  );
}

export function publicMcpOptionsResponse(request?: Request) {
  const allowedOrigins = getAllowedMcpOrigins();
  const origin = request?.headers.get("origin");
  if (allowedOrigins.length && origin && !allowedOrigins.includes(origin)) {
    return jsonRpcError(403, -32003, "Origin not allowed.", request);
  }
  return withPublicHeaders(new Response(null, { status: 204 }), request);
}

export function publicMcpMethodNotAllowedResponse(request?: Request) {
  const response = jsonRpcError(405, -32000, "Method not allowed.", request);
  response.headers.set("Allow", "POST, OPTIONS");
  return response;
}

export async function handlePublicMcpRequest(
  request: Request,
  reader: PublicEditorialReader,
) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > 262_144) {
    return jsonRpcError(413, -32001, "Request body too large.", request);
  }

  const server = createPublicMcpServer(reader);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    await server.close().catch(() => undefined);
    return withPublicHeaders(response, request);
  } catch {
    await server.close().catch(() => undefined);
    return jsonRpcError(500, -32603, "Internal server error.", request);
  }
}
