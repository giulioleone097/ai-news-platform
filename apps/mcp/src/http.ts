import { createMcpHandler } from "@modelcontextprotocol/server";
import { getAllowedMcpOrigins } from "@atlasnews/adapters/config/env";

import { mcpCapabilities, type CapabilityPorts, type Scope } from "@atlasnews/contract";
import type { McpEventsService } from "@atlasnews/core/mcp-events/application/mcp-events-service";

import type { McpAppsOptions } from "./apps";
import {
  bearerChallenge,
  resolvePrincipal,
  Unauthorized,
  type AccessTokenVerifier,
  type AuthenticatedPrincipal,
} from "./auth";
import { SubscribeRateLimiter } from "./events/subscribe-rate-limit";
import { createAtlasNewsServer } from "./server";

const baseHeaders = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, MCP-Protocol-Version, MCP-Method, MCP-Name, MCP-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "MCP-Protocol-Version, MCP-Session-Id, WWW-Authenticate",
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

/** Reads the body once, up to the limit. `null` means too large; an empty array means no body. */
async function readBoundedBody(request: Request): Promise<Uint8Array<ArrayBuffer> | null> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maximumRequestBodyBytes) {
    return null;
  }
  if (!request.body) return new Uint8Array();

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
  return body;
}

/** The same request with its body already read, for the SDK handler. */
function withBody(request: Request, body: Uint8Array<ArrayBuffer>) {
  if (!body.byteLength) return request;
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  return new Request(request.url, { method: request.method, headers, body, signal: request.signal });
}

const scopesByTool = new Map(mcpCapabilities.map((capability) => [capability.name, capability.scopes]));

/**
 * The scopes of every tool this request would run. The JSON-RPC body is what the SDK executes, so it
 * decides; the `MCP-Name` header (2026-07-28 requests) is only ever added, never trusted to lower the
 * result: a header and a body that disagree are treated as the stricter of the two. Batches are read
 * message by message, and a body that does not parse contributes nothing (the SDK rejects it).
 */
function scopesRequiredByCall(headers: Headers, body: Uint8Array<ArrayBuffer>): Scope[] {
  const names: unknown[] = [headers.get("mcp-name")];
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
    for (const message of Array.isArray(parsed) ? parsed : [parsed]) {
      const { method, params } = (message ?? {}) as { method?: unknown; params?: { name?: unknown } };
      if (method === "tools/call") names.push(params?.name);
    }
  } catch {
    // Not JSON: nothing in the body can run a tool.
  }
  return [...new Set(names.flatMap((name) => (typeof name === "string" ? scopesByTool.get(name) ?? [] : [])))];
}

/** Whether the body calls `events/subscribe` (a batch is read message by message). */
function callsEventSubscribe(headers: Headers, body: Uint8Array<ArrayBuffer>) {
  if (headers.get("mcp-method") === "events/subscribe") return true;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
    return (Array.isArray(parsed) ? parsed : [parsed])
      .some((message) => (message as { method?: unknown } | null)?.method === "events/subscribe");
  } catch {
    return false;
  }
}

const sharedSubscribeLimiter = new SubscribeRateLimiter();

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
  /** Receives the caller, so that writes can be attributed to the signed-in editor. */
  createPorts(principal: AuthenticatedPrincipal): CapabilityPorts;
  apps?: McpAppsOptions;
  events?: McpEventsService | null;
  /** Throttle for `events/subscribe`; one limiter per process unless a test passes its own. */
  subscribeLimiter?: SubscribeRateLimiter;
}

/**
 * HTTP 401 with a Bearer challenge. With `required` scopes it answers an anonymous call to a scoped
 * tool: Claude and ChatGPT start sign-in only on a real 401, which a tool handler cannot produce, so
 * this runs before the SDK. That answer is public (CORS as for any anonymous caller) so browser hosts
 * can read it; a rejected token gets none.
 */
function unauthorizedResponse(request: Request, required?: readonly Scope[]) {
  const response = jsonRpcError(
    401,
    -32001,
    required ? "Sign in to use this tool." : "Valid Bearer authentication required.",
    request,
    required !== undefined,
  );
  response.headers.set(
    "WWW-Authenticate",
    bearerChallenge(request, {
      error: "invalid_token",
      description: required ? "Authentication required for this tool" : "The access token is missing, expired or invalid",
      scope: required,
    }),
  );
  return response;
}

/**
 * The single MCP endpoint. The caller is resolved once, from the Authorization header:
 * none means anonymous (read tools only; a call to a scoped tool is a 401 with a Bearer challenge),
 * a valid token means an editor with its scopes, and a token that does not verify is a 401 too.
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

  let body: Uint8Array<ArrayBuffer> | null;
  try {
    body = await readBoundedBody(request);
  } catch {
    return jsonRpcError(400, -32700, "Invalid request body.", request, cors);
  }
  if (!body) return jsonRpcError(413, -32001, "Request body too large.", request, cors);

  if (principal.kind === "anonymous") {
    const required = scopesRequiredByCall(request.headers, body);
    if (required.length) return unauthorizedResponse(request, required);
  }

  if (callsEventSubscribe(request.headers, body)) {
    const retryAfter = (deps.subscribeLimiter ?? sharedSubscribeLimiter).take(request.headers);
    if (retryAfter !== null) {
      const response = jsonRpcError(429, -32029, "Too many subscription requests. Try again shortly.", request, cors);
      response.headers.set("Retry-After", String(retryAfter));
      return response;
    }
  }

  let ports: CapabilityPorts;
  try {
    ports = deps.createPorts(principal);
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
    const response = await handler.fetch(withBody(request, body));
    await handler.close().catch(() => undefined);
    return withPublicHeaders(response, request, cors);
  } catch {
    await handler.close().catch(() => undefined);
    return jsonRpcError(500, -32603, "Internal server error.", request, cors);
  }
}
