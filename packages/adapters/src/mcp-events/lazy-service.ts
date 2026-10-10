import { getSupabaseServiceEnvironment } from "../config/env";

import {
  type McpEventsService,
} from "@atlasnews/core/mcp-events/application/mcp-events-service";
import { listMcpEventDefinitions } from "@atlasnews/core/mcp-events/domain/events";

/**
 * Service for the public MCP route, or null when service-role persistence is not configured.
 * The Supabase-backed runtime is imported on first subscribe/unsubscribe, so catalog and
 * discovery requests never load persistence code.
 */
export function createMcpEventsService(): McpEventsService | null {
  if (!getSupabaseServiceEnvironment()) return null;

  let loaded: Promise<McpEventsService> | undefined;
  const load = () => {
    loaded ??= import("./runtime").then((runtime) => {
      const service = runtime.createMcpEventsPersistentService();
      if (!service) throw new Error("MCP events persistence is not configured.");
      return service;
    });
    return loaded;
  };

  return {
    list: async () => ({ events: listMcpEventDefinitions() }),
    subscribe: async (input) => (await load()).subscribe(input),
    unsubscribe: async (input) => (await load()).unsubscribe(input),
  };
}
