import type { CallToolResult } from "@modelcontextprotocol/server";

import { sourceUnavailableMessage } from "@atlasnews/contract";

export function success(payload: object): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload as Record<string, unknown>,
  };
}

export function failure(message: string, meta?: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
    ...(meta ? { _meta: meta } : {}),
  };
}

export async function safely(
  operation: () => Promise<object>,
  message: string = sourceUnavailableMessage,
): Promise<CallToolResult> {
  try {
    return success(await operation());
  } catch {
    return failure(message);
  }
}
