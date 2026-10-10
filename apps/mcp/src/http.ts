import { createMcpHandler } from "@modelcontextprotocol/server";
import { getAllowedMcpOrigins } from "@atlasnews/adapters/config/env";

import type { CapabilityPorts } from "@atlasnews/contract";
import type { McpEventsService } from "@atlasnews/core/mcp-events/application/mcp-events-service";

import type { McpAppsOptions } from "./apps";
import {
  bearerChallenge,
  resolvePrincipal,
  Unauthorized,
  type AccessTokenVerifier,
} from "./auth";
import { createAtlasNewsServer } from "./server";

const baseHeaders = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, MCP-Protocol-Version, MCP-Method, MCP-Name, MCP-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "MCP-Protocol-Version, MCP-Session-Id",
  "Cache-Control": "no-store",
} as const;

const maximumRequestBodyBytes = 262_144;

function getCorsOrigin(request?: Request) {
  const allowedOrigins = getAllowedMcpOrigins();
  if (!allowedOrigins.length) return "*";
  const origin = request?.headers.get("origin");
  return origin && allowedOrigins.includes(origin) ? origin : null;
}

/** Anonymous answers carry the CORS headers; answers for a signed-in editor never do. */
function withPublicHeaders(response: Response, request?: Request, cors = true) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(baseHeaders)) {
    headers.set(name, value);
  }
  const corsOrigin = cors ? getCorsOrigin(request) : null;
  if (corsOrigin) headers.set("Access-Control-Allow-Origin", corsOrigin);
  if (cors && corsOrigin !== "*") headers.append("Vary", "Origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonRpcError(status: number, code: number, message: string, request?: Request, cors = true) {
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
    cors,
  );
}

export async function readBoundedMcpRequest(request: Request): Promise<Request | null> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maximumRequestBodyBytes) {
    return null;
  }
  if (!request.body) return request;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maximumRequestBodyBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const headers = new Headers(request.headers);
  headers.delete("content-length");

  return new Request(request.url, {
    method: request.method,
    headers,
    body,
    signal: request.signal,
  });
}

export function mcpOptionsResponse(request?: Request) {
  const allowedOrigins = getAllowedMcpOrigins();
  const origin = request?.headers.get("origin");
  if (allowedOrigins.length && origin && !allowedOrigins.includes(origin)) {
    return jsonRpcError(403, -32003, "Origin not allowed.", request);
  }
  return withPublicHeaders(new Response(null, { status: 204 }), request);
}

export function mcpMethodNotAllowedResponse(request?: Request) {
  const response = jsonRpcError(405, -32000, "Method not allowed.", request);
  response.headers.set("Allow", "POST, OPTIONS");
  return response;
}

export interface McpEndpointDependencies {
  verifier: AccessTokenVerifier;
  createPorts(): CapabilityPorts;
  apps?: McpAppsOptions;
  events?: McpEventsService | null;
}

function unauthorizedResponse(request: Request) {
  const response = jsonRpcError(401, -32001, "Valid Bearer authentication required.", request, false);
  response.headers.set(
    "WWW-Authenticate",
    bearerChallenge(request, { error: "invalid_token", description: "The access token is missing, expired or invalid" }),
  );
  return response;
}

/**
 * The single MCP endpoint. The caller is resolved once, from the Authorization header:
 * none means anonymous (read tools only), a valid token means an editor with its scopes,
 * and a token that does not verify is a 401 with a Bearer challenge.
 */
export async function handleMcpRequest(request: Request, deps: McpEndpointDependencies) {
  let principal;
  try {
    principal = await resolvePrincipal(request, deps.verifier);
  } catch (error) {
    return error instanceof Unauthorized
      ? unauthorizedResponse(request)
      : jsonRpcError(500, -32603, "Internal server error.", request, false);
  }
  const cors = principal.kind === "anonymous";

  let boundedRequest: Request | null;
  try {
    boundedRequest = await readBoundedMcpRequest(request);
  } catch {
    return jsonRpcError(400, -32700, "Invalid request body.", request, cors);
  }
  if (!boundedRequest) return jsonRpcError(413, -32001, "Request body too large.", request, cors);

  let ports: CapabilityPorts;
  try {
    ports = deps.createPorts();
  } catch {
    return jsonRpcError(503, -32003, "The editorial source is not configured.", request, cors);
  }

  const handler = createMcpHandler(
    () => createAtlasNewsServer({
      ports,
      principal,
      apps: deps.apps,
      events: deps.events,
      challenge: (missing) => bearerChallenge(request, {
        error: "insufficient_scope",
        description: principal.kind === "anonymous" ? "You need to sign in to continue" : "This sign-in lacks a permission",
        scope: missing,
      }),
    }),
    { legacy: "stateless", responseMode: "auto" },
  );

  try {
    const response = await handler.fetch(boundedRequest);
    await handler.close().catch(() => undefined);
    return withPublicHeaders(response, request, cors);
  } catch {
    await handler.close().catch(() => undefined);
    return jsonRpcError(500, -32603, "Internal server error.", request, cors);
  }
}
