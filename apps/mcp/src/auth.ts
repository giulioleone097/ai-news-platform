import { createHash, timingSafeEqual } from "node:crypto";

import { getMcpAdminApiKey } from "@atlasnews/adapters/config/env";
import { anonymous, scopes, type Principal, type Scope } from "@atlasnews/contract";

export interface VerifiedToken {
  subject: string;
  scopes: readonly Scope[];
}

/**
 * Port for turning a bearer token into a caller. Adapters check signature, issuer,
 * audience and expiry (a JWT verifier) or compare a shared secret (the API key).
 * Return null for any token that is not valid for this resource.
 */
export interface AccessTokenVerifier {
  verify(token: string, context: { resource: string }): Promise<VerifiedToken | null>;
}

/** Thrown when a request carries credentials that are not valid. */
export class Unauthorized extends Error {
  override readonly name = "Unauthorized";
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

/** The shared newsroom API key: one editor with every scope. */
export function apiKeyVerifier(getKey: () => string | null = getMcpAdminApiKey): AccessTokenVerifier {
  return {
    async verify(token) {
      const key = getKey();
      if (!key || !timingSafeEqual(digest(token), digest(key))) return null;
      return { subject: "mcp-admin", scopes };
    },
  };
}

/** No Authorization header means anonymous; a header that does not verify is rejected. */
export async function resolvePrincipal(
  request: Request,
  verifier: AccessTokenVerifier,
): Promise<Principal> {
  const header = request.headers.get("authorization");
  if (header === null) return anonymous;
  const match = /^Bearer\s+([^\s]+)$/i.exec(header);
  if (!match) throw new Unauthorized();
  const claims = await verifier.verify(match[1], { resource: protectedResource(request) });
  if (!claims) throw new Unauthorized();
  return { kind: "editor", subject: claims.subject, scopes: claims.scopes };
}

/** OpenAI's per-tool security declaration: `noauth`, or `oauth2` with the scopes it needs. */
export function securitySchemes(required: readonly Scope[]) {
  return required.length ? [{ type: "oauth2", scopes: [...required] }] : [{ type: "noauth" }];
}

export function protectedResource(request: Request) {
  return new URL("/mcp", request.url).href;
}

export function protectedResourceMetadataUrl(request: Request) {
  return new URL("/.well-known/oauth-protected-resource", request.url).href;
}

/** A Bearer challenge (RFC 6750) that points hosts at the resource metadata to start sign-in. */
export function bearerChallenge(
  request: Request,
  detail: { error: "invalid_token" | "insufficient_scope"; description: string; scope?: readonly Scope[] },
) {
  const parameters = [
    `resource_metadata="${protectedResourceMetadataUrl(request)}"`,
    `error="${detail.error}"`,
    `error_description="${detail.description}"`,
    ...(detail.scope?.length ? [`scope="${detail.scope.join(" ")}"`] : []),
  ];
  return `Bearer realm="atlasnews", ${parameters.join(", ")}`;
}
