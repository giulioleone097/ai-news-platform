import { encodeBase64Url } from "./base64url";

/**
 * Sign-in with an OAuth identity provider, as one small interface: where to send the person, and how to
 * turn the code they come back with into a verified profile. Only `fetch` and WebCrypto are used, so the
 * adapters run in a Cloudflare Worker and in Node alike. What a deployment does with the profile (the
 * session cookie, the editor lookup) lives elsewhere.
 */

export const oauthProviderIds = ["google", "github"] as const;
export type OAuthProviderId = (typeof oauthProviderIds)[number];

export function isOAuthProviderId(value: unknown): value is OAuthProviderId {
  return typeof value === "string" && (oauthProviderIds as readonly string[]).includes(value);
}

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

/** Who the provider says signed in. An adapter returns a profile only for an email the provider verified. */
export interface OAuthProfile {
  provider: OAuthProviderId;
  /** Stable id at the provider (Google `sub`, GitHub numeric id). */
  providerUserId: string;
  /** Lower case. */
  email: string;
  emailVerified: true;
  name: string | null;
}

export interface OAuthProvider {
  readonly id: OAuthProviderId;
  /** Where to send the browser; `state` and the PKCE `codeChallenge` (S256) come from `createOAuthFlowSecrets`. */
  authorizeUrl(input: { redirectUri: string; state: string; codeChallenge: string }): URL;
  /** Swaps the authorization code for the profile. Throws `OAuthError`. */
  exchange(input: { code: string; redirectUri: string; codeVerifier: string }): Promise<OAuthProfile>;
}

export type OAuthErrorCode = "exchange_failed" | "profile_failed" | "email_missing" | "email_unverified";

/** A failed sign-in. Messages name the step, never the provider's response, which can echo secrets. */
export class OAuthError extends Error {
  constructor(readonly code: OAuthErrorCode, message: string) {
    super(message);
    this.name = "OAuthError";
  }
}

export type Fetcher = typeof fetch;

const requestTimeoutMs = 10_000;

function randomToken(byteLength: number) {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/** The one-time `state` and PKCE verifier of a sign-in attempt, with the S256 challenge of the verifier. */
export async function createOAuthFlowSecrets() {
  const state = randomToken(32);
  const codeVerifier = randomToken(48);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  return { state, codeVerifier, codeChallenge: encodeBase64Url(new Uint8Array(digest)) };
}

/**
 * A JSON request to a provider with a deadline. Any failure, non-2xx or non-JSON-object answer becomes an
 * `OAuthError`; the caller still checks the fields it reads.
 */
export async function requestJson<T extends object = Record<string, unknown>>(
  fetcher: Fetcher,
  url: string,
  init: RequestInit,
  failure: { code: OAuthErrorCode; message: string },
): Promise<T> {
  let value: unknown;
  try {
    const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) });
    if (!response.ok) throw new Error(`status ${response.status}`);
    value = await response.json();
  } catch {
    throw new OAuthError(failure.code, failure.message);
  }
  if (typeof value !== "object" || value === null) throw new OAuthError(failure.code, failure.message);
  return value as T;
}

/** The urlencoded body of a token request. */
export function formBody(fields: Record<string, string>) {
  return new URLSearchParams(fields).toString();
}

/** A display name a person can be shown: printable, trimmed, at most 120 characters; null when nothing is left. */
export function cleanName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return name || null;
}

/** An email address in the shape the editors table accepts, lower case; null otherwise. */
export function cleanEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length >= 3 && email.length <= 254 && /^[^\s@]+@[^\s@]+$/.test(email) ? email : null;
}
