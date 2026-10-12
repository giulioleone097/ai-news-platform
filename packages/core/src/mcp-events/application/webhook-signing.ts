import { hmacSha256 } from "../../crypto";
import { decodeSigningSecret } from "./signing-secret";

/** Standard Webhooks v1 signature: `v1,` + base64(HMAC-SHA256(key, "id.timestamp.body")). */
export function signWebhook(input: {
  secret: string;
  messageId: string;
  timestampSeconds: number;
  body: string;
}) {
  const key = decodeSigningSecret(input.secret);
  if (!key) throw new Error("Invalid webhook signing secret.");
  const signature = Buffer.from(
    hmacSha256(key, `${input.messageId}.${input.timestampSeconds}.${input.body}`),
  ).toString("base64");
  return `v1,${signature}`;
}

/**
 * Headers for one signed attempt. `body` must be the exact string that is sent.
 * Several secrets (rotation window) yield space-separated signatures.
 */
export function buildWebhookHeaders(input: {
  messageId: string;
  subscriptionId: string;
  secrets: string[];
  body: string;
  now: Date;
}): Record<string, string> {
  const timestampSeconds = Math.floor(input.now.getTime() / 1000);
  return {
    "Content-Type": "application/json",
    "webhook-id": input.messageId,
    "webhook-timestamp": String(timestampSeconds),
    "webhook-signature": input.secrets
      .map((secret) => signWebhook({
        secret,
        messageId: input.messageId,
        timestampSeconds,
        body: input.body,
      }))
      .join(" "),
    "X-MCP-Subscription-Id": input.subscriptionId,
  };
}
