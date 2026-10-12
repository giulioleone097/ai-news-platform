import { ProtocolError, type McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { McpEventsError } from "@atlasnews/core/mcp-events/domain/errors";
import { maximumPrincipalLength } from "@atlasnews/core/mcp-events/domain/subscription";
import type { McpEventsService } from "@atlasnews/core/mcp-events/application/mcp-events-service";

export const invalidParamsCode = -32602;
export const internalErrorCode = -32603;
/** The code of the 401 body that `handleMcpRequest` answers to an anonymous caller. */
export const authenticationRequiredCode = -32001;
/** CallbackEndpointError from the MCP Events draft. */
export const callbackEndpointErrorCode = -32015;

const meta = z.record(z.string(), z.unknown()).optional();
const argumentsSchema = z.record(z.string(), z.unknown()).optional();

const listParams = z.object({ cursor: z.string().optional(), _meta: meta });
const listResult = z.object({
  events: z.array(z.object({
    name: z.string(),
    description: z.string(),
    delivery: z.array(z.string()),
    inputSchema: z.record(z.string(), z.unknown()),
    payloadSchema: z.record(z.string(), z.unknown()),
  })),
  nextCursor: z.string().optional(),
});

const subscribeParams = z.object({
  name: z.string().min(1).max(200),
  arguments: argumentsSchema,
  delivery: z.object({
    mode: z.string().max(40),
    url: z.string().max(2048),
    secret: z.string().max(256),
  }),
  cursor: z.string().nullable().optional(),
  ttlMs: z.number().positive().nullable().optional(),
  _meta: meta,
});
const subscribeResult = z.object({
  id: z.string(),
  refreshBefore: z.string().nullable(),
  cursor: z.null(),
  truncated: z.boolean(),
});

const unsubscribeParams = z.object({
  name: z.string().min(1).max(200),
  arguments: argumentsSchema,
  delivery: z.object({ mode: z.string().max(40), url: z.string().max(2048) }),
  _meta: meta,
});
const unsubscribeResult = z.object({});

function toProtocolError(error: unknown) {
  if (error instanceof ProtocolError) return error;
  if (error instanceof McpEventsError) {
    return error.kind === "callback_error"
      ? new ProtocolError(callbackEndpointErrorCode, error.message, { reason: error.reason })
      : new ProtocolError(
        invalidParamsCode,
        error.message,
        error.reason ? { reason: error.reason } : undefined,
      );
  }
  // Persistence and unexpected failures: never leak details of stored subscriptions.
  return new ProtocolError(internalErrorCode, "Event subscriptions are temporarily unavailable.");
}

async function translated<T>(action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    throw toProtocolError(error);
  }
}

/**
 * Advertises the `events` capability and serves events/list, events/subscribe and
 * events/unsubscribe. Without a service (persistence not configured) nothing is registered.
 * `subscriber` is the signed-in caller (its subject); subscriptions belong to it, and an anonymous caller
 * (null) may list the events but neither subscribe nor unsubscribe. `handleMcpRequest` answers an anonymous
 * subscribe with a 401 first, so that hosts start sign-in; this is the second check.
 */
export function registerMcpEvents(
  server: McpServer,
  deps: { service: McpEventsService | null; subscriber: string | null },
) {
  const { service, subscriber } = deps;
  if (!service) return;
  const principal = () => {
    if (!subscriber) throw new ProtocolError(authenticationRequiredCode, "Sign in to manage event subscriptions.");
    return subscriber.slice(0, maximumPrincipalLength);
  };

  server.server.registerCapabilities({ events: {} } as Parameters<typeof server.server.registerCapabilities>[0]);
  server.server.setRequestHandler(
    "events/list",
    { params: listParams, result: listResult },
    () => translated(() => service.list()),
  );
  server.server.setRequestHandler(
    "events/subscribe",
    { params: subscribeParams, result: subscribeResult },
    (params) => translated(() => service.subscribe({ ...params, principal: principal() })),
  );
  server.server.setRequestHandler(
    "events/unsubscribe",
    { params: unsubscribeParams, result: unsubscribeResult },
    (params) => translated(() => service.unsubscribe({ ...params, principal: principal() })),
  );
}
