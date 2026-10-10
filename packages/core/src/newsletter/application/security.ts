import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const unsubscribePayloadSchema = z.object({
  recipientId: z.uuid(),
  subscriptionId: z.uuid(),
  version: z.literal(1),
});

function safeEqual(left: Buffer, right: Buffer) {
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

export function hashNewsletterValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashNewsletterEmail(email: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`newsletter-email:${email.trim().toLowerCase()}`)
    .digest("hex");
}

export function hashNewsletterRequestFingerprint(requester: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`newsletter-requester:v1:${requester.trim().toLowerCase()}`)
    .digest("hex");
}

export function createConfirmationChallenge() {
  const secret = randomBytes(32).toString("base64url");
  return {
    hash: hashNewsletterValue(secret),
    secret,
  };
}

export function buildConfirmationToken(subscriptionId: string, secret: string) {
  return `${subscriptionId}.${secret}`;
}

export function parseConfirmationToken(token: string) {
  if (token.length > 256) return null;
  const [subscriptionId, secret, extra] = token.split(".");
  const parsedId = z.uuid().safeParse(subscriptionId);
  if (!parsedId.success || !secret || extra || secret.length < 32) return null;
  return { subscriptionId: parsedId.data, tokenHash: hashNewsletterValue(secret) };
}

export function createUnsubscribeToken(
  input: { recipientId: string; subscriptionId: string },
  secret: string,
) {
  const payload = Buffer.from(JSON.stringify({ ...input, version: 1 })).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`newsletter-unsubscribe:v1.${payload}`)
    .digest("base64url");
  return `v1.${payload}.${signature}`;
}

export function verifyUnsubscribeToken(token: string, secret: string) {
  if (token.length > 512) return null;
  const [version, payload, signature, extra] = token.split(".");
  if (version !== "v1" || !payload || !signature || extra) return null;

  const expected = createHmac("sha256", secret)
    .update(`newsletter-unsubscribe:v1.${payload}`)
    .digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (!safeEqual(expected, received)) return null;

  try {
    return unsubscribePayloadSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
  } catch {
    return null;
  }
}

export function verifySvixWebhook(input: {
  body: string;
  id: string | null;
  signature: string | null;
  timestamp: string | null;
  secret: string;
  now?: number;
  toleranceSeconds?: number;
}) {
  if (!input.id || !input.signature || !input.timestamp || !input.secret.startsWith("whsec_")) {
    return false;
  }
  const timestamp = Number.parseInt(input.timestamp, 10);
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? 300;
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > tolerance) return false;

  let key: Buffer;
  try {
    key = Buffer.from(input.secret.slice("whsec_".length), "base64");
  } catch {
    return false;
  }
  if (!key.byteLength) return false;

  const expected = createHmac("sha256", key)
    .update(`${input.id}.${input.timestamp}.${input.body}`)
    .digest();
  return input.signature
    .split(/\s+/)
    .map((part) => part.split(",", 2))
    .some(([version, signature]) => {
      if (version !== "v1" || !signature) return false;
      try {
        return safeEqual(expected, Buffer.from(signature, "base64"));
      } catch {
        return false;
      }
    });
}
