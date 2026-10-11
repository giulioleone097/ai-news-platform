import { decodeBase64Url, encodeBase64Url } from "./base64url";
import { isOAuthProviderId, type OAuthProfile, type OAuthProviderId } from "./oauth";

/**
 * The two signed cookies of own sign-in, as stateless HMAC-SHA256 tokens (`<payload>.<mac>`, base64url):
 *
 * - the session, 30 days: who signed in. There is no server-side record, so signing out clears the
 *   cookie but cannot revoke a copy someone kept; rotating `ATLASNEWS_SESSION_SECRET` ends every session.
 * - the flow, 10 minutes: the `state` and PKCE verifier of one sign-in attempt, kept in the browser that
 *   started it so the callback can tell its own attempt from a forged one.
 *
 * Each token type has its own MAC domain, so one can never pass for the other. The MAC is verified with
 * `crypto.subtle.verify`, which compares in constant time. Expiry is inside the signed payload.
 */

export const sessionLifetimeSeconds = 30 * 24 * 60 * 60;
export const flowLifetimeSeconds = 10 * 60;

const maximumTokenLength = 2048;
const encoder = new TextEncoder();

type Domain = "session" | "flow";

function importKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

async function seal(domain: Domain, payload: object, secret: string) {
  const body = encodeBase64Url(encoder.encode(JSON.stringify(payload)));
  const mac = await crypto.subtle.sign("HMAC", await importKey(secret, "sign"), encoder.encode(`${domain}.${body}`));
  return `${body}.${encodeBase64Url(new Uint8Array(mac))}`;
}

/** The payload of a token this secret signed for this domain, or null: wrong shape, bad MAC or not JSON. */
async function open(domain: Domain, token: string | undefined, secret: string): Promise<Record<string, unknown> | null> {
  if (!token || token.length > maximumTokenLength) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, mac] = parts as [string, string];
  const macBytes = decodeBase64Url(mac);
  if (!macBytes) return null;
  const valid = await crypto.subtle.verify("HMAC", await importKey(secret, "verify"), macBytes as BufferSource, encoder.encode(`${domain}.${body}`));
  if (!valid) return null;

  const bytes = decodeBase64Url(body);
  if (!bytes) return null;
  try {
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof payload === "object" && payload !== null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isLive(expires: unknown, now: number) {
  return typeof expires === "number" && Number.isFinite(expires) && expires * 1000 > now;
}

/** A signed-in person: `sub` is `google:<id>` or `github:<id>`. */
export interface SessionUser {
  sub: string;
  provider: OAuthProviderId;
  email: string;
  name: string | null;
}

const subjectPattern = /^(google|github):[A-Za-z0-9._-]{1,128}$/;

export async function createSessionToken(
  profile: Pick<OAuthProfile, "provider" | "providerUserId" | "email" | "name">,
  secret: string,
  now = Date.now(),
) {
  const value = await seal(
    "session",
    {
      sub: `${profile.provider}:${profile.providerUserId}`,
      email: profile.email,
      name: profile.name,
      exp: Math.floor(now / 1000) + sessionLifetimeSeconds,
    },
    secret,
  );
  return { value, maxAge: sessionLifetimeSeconds };
}

export async function readSessionToken(token: string | undefined, secret: string, now = Date.now()): Promise<SessionUser | null> {
  const payload = await open("session", token, secret);
  if (!payload || !isLive(payload.exp, now)) return null;
  const { sub, email, name } = payload;
  if (typeof sub !== "string" || !subjectPattern.test(sub)) return null;
  if (typeof email !== "string" || email.length < 3 || email.length > 254) return null;
  if (name !== null && (typeof name !== "string" || name.length > 120)) return null;
  const provider = sub.slice(0, sub.indexOf(":"));
  return isOAuthProviderId(provider) ? { sub, provider, email, name } : null;
}

/** One sign-in attempt, remembered by the browser that started it. */
export interface OAuthFlow {
  provider: OAuthProviderId;
  state: string;
  codeVerifier: string;
  /** A same-site path, already made safe by the route that started the attempt. */
  returnTo: string;
}

export async function createFlowToken(flow: OAuthFlow, secret: string, now = Date.now()) {
  const value = await seal("flow", { ...flow, exp: Math.floor(now / 1000) + flowLifetimeSeconds }, secret);
  return { value, maxAge: flowLifetimeSeconds };
}

export async function readFlowToken(token: string | undefined, secret: string, now = Date.now()): Promise<OAuthFlow | null> {
  const payload = await open("flow", token, secret);
  if (!payload || !isLive(payload.exp, now)) return null;
  const { provider, state, codeVerifier, returnTo } = payload;
  if (!isOAuthProviderId(provider)) return null;
  if (typeof state !== "string" || typeof codeVerifier !== "string" || typeof returnTo !== "string") return null;
  return { provider, state, codeVerifier, returnTo };
}

/** Equality that takes the same time wherever two strings differ. */
export function timingSafeEqual(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}
