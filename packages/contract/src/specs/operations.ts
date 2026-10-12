import * as z from "zod/v4";

/**
 * What the operations specs (comment moderation, newsletter, social publishing) share. What an editor does in the
 * Studio is offered on the page too; the workers that send mail and post to providers (outbox processing,
 * notification delivery, erasure) stay MCP-only.
 */
export const operationalUnavailable =
  "The operational service is not configured or the request could not be completed.";

export const operationsBase = { surfaces: ["mcp", "page"], unavailableMessage: operationalUnavailable } as const;
export const workerBase = { ...operationsBase, surfaces: ["mcp"] } as const;

const count = z.number().int().nonnegative();

/** What one batch of an outbox worker did; the same for comment notifications and newsletter mail. */
export const deliveryBatchOutputSchema = z.object({ claimed: count, sent: count, failed: count, skipped: count });
