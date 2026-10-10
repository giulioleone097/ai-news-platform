export const callbackFailureReasons = [
  "challenge_failed",
  "timeout",
  "invalid_url",
  "blocked_address",
  "http_error",
] as const;

export type CallbackFailureReason = (typeof callbackFailureReasons)[number];

export type McpEventsErrorKind = "invalid_params" | "callback_error";

/** Application failure the MCP adapter maps to JSON-RPC -32602 or -32015. */
export class McpEventsError extends Error {
  constructor(
    readonly kind: McpEventsErrorKind,
    message: string,
    readonly reason?: CallbackFailureReason | "subscription_limit",
  ) {
    super(message);
    this.name = "McpEventsError";
  }
}

export function invalidParams(message: string, reason?: "subscription_limit") {
  return new McpEventsError("invalid_params", message, reason);
}

export function callbackError(reason: CallbackFailureReason, message: string) {
  return new McpEventsError("callback_error", message, reason);
}

/** Transport-level failure of the outbound webhook client. */
export class WebhookTransportError extends Error {
  constructor(
    readonly reason: "timeout" | "blocked_address" | "invalid_url" | "payload_too_large" | "network",
    message: string,
  ) {
    super(message);
    this.name = "WebhookTransportError";
  }
}
