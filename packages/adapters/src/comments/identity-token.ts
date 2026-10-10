import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

const guestTokenVersion = 1;
const guestTokenLifetimeSeconds = 365 * 24 * 60 * 60;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type GuestTokenPayload = {
  v: 1;
  id: string;
  exp: number;
};

function hmac(secret: string, value: string) {
  return createHmac("sha256", secret).update(value).digest();
}

function constantTimeEqual(first: Buffer, second: Buffer) {
  return first.length === second.length && timingSafeEqual(first, second);
}

export function hashCommentSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function deriveCommentIdentityHash(secret: string, namespace: string, value: string) {
  return createHmac("sha256", secret)
    .update(`${namespace}:${value}`)
    .digest("hex");
}

export function createGuestToken(
  secret: string,
  now = Date.now(),
  id = randomUUID(),
) {
  const payload: GuestTokenPayload = {
    v: guestTokenVersion,
    id,
    exp: Math.floor(now / 1_000) + guestTokenLifetimeSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = hmac(secret, `guest:${encoded}`).toString("base64url");
  return { id, expiresAt: payload.exp * 1_000, value: `${encoded}.${signature}` };
}

export function verifyGuestToken(value: string | undefined, secret: string, now = Date.now()) {
  if (!value || value.length > 512) return null;
  const [encoded, encodedSignature, extra] = value.split(".");
  if (!encoded || !encodedSignature || extra) return null;

  try {
    const supplied = Buffer.from(encodedSignature, "base64url");
    const expected = hmac(secret, `guest:${encoded}`);
    if (!constantTimeEqual(supplied, expected)) return null;

    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<GuestTokenPayload>;
    if (
      payload.v !== guestTokenVersion
      || typeof payload.id !== "string"
      || !uuidPattern.test(payload.id)
      || typeof payload.exp !== "number"
      || !Number.isSafeInteger(payload.exp)
      || payload.exp * 1_000 <= now
    ) {
      return null;
    }

    return { id: payload.id, expiresAt: payload.exp * 1_000 };
  } catch {
    return null;
  }
}

export function createNotificationToken(secret: string, subscriptionId: string) {
  const signature = hmac(secret, `notification:${subscriptionId}`).toString("base64url");
  return `${subscriptionId}.${signature}`;
}

export function verifyNotificationToken(value: string, secret: string) {
  const separator = value.indexOf(".");
  if (separator < 1 || value.indexOf(".", separator + 1) !== -1) return null;
  const subscriptionId = value.slice(0, separator);
  const encodedSignature = value.slice(separator + 1);
  if (!uuidPattern.test(subscriptionId)) return null;

  try {
    const supplied = Buffer.from(encodedSignature, "base64url");
    const expected = hmac(secret, `notification:${subscriptionId}`);
    return constantTimeEqual(supplied, expected) ? subscriptionId : null;
  } catch {
    return null;
  }
}
