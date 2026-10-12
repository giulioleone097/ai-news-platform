import { createHash, timingSafeEqual } from "node:crypto";

import {
  getConfiguredMcpUrl,
  getContentMode,
  getMcpAdminApiKey,
  getMcpOAuthEnvironment,
} from "@atlasnews/adapters/config/env";
import { requireSitesBindings } from "@atlasnews/adapters/sites/bindings";
import { getEditorAllowList, readSitesIdentity, resolveSitesEditor } from "@atlasnews/adapters/sites/editors";
import { anonymous, scopes, scopesForRole, type Principal, type Scope } from "@atlasnews/contract";

import { supabaseEditorDirectory } from "./auth/editors";
import { supabaseOAuthVerifier } from "./auth/supabase-oauth";

export interface VerifiedToken {
  subject: string;
  scopes: readonly Scope[];
  /** The `public.authors` id that writes are attributed to, when the token identifies an editor. */
  authorId?: string;
}

/** The caller of a request. `authorId` attributes writes to the signed-in editor. */
export type AuthenticatedPrincipal = Principal & { readonly authorId?: string };

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

/** Tries each verifier in order; the first that accepts the token decides. */
export function firstAccepting(...verifiers: readonly AccessTokenVerifier[]): AccessTokenVerifier {
  return {
    async verify(token, context) {
      for (const verifier of verifiers) {
        const claims = await verifier.verify(token, context);
        if (claims) return claims;
      }
      return null;
    },
  };
}

let configured: { key: string; verifier: AccessTokenVerifier } | undefined;

/**
 * The verifier of the running server: Supabase-issued OAuth tokens when sign-in is configured,
 * then the shared API key. Rebuilt only when the configuration changes, so the key set stays cached.
 */
export function defaultAccessTokenVerifier(): AccessTokenVerifier {
  return {
    verify(token, context) {
      const oauth = getMcpOAuthEnvironment();
      const key = oauth ? JSON.stringify([oauth.issuer, oauth.audience, oauth.clientIds, oauth.profiles.url, oauth.profiles.serviceRoleKey]) : "";
      if (configured?.key !== key) {
        const apiKey = apiKeyVerifier();
        configured = {
          key,
          verifier: oauth
            ? firstAccepting(
                supabaseOAuthVerifier(
                  { issuer: oauth.issuer, jwksUrl: oauth.jwksUrl, audience: oauth.audience, clientIds: oauth.clientIds },
                  supabaseEditorDirectory(oauth.profiles),
                ),
                apiKey,
              )
            : apiKey,
        };
      }
      return configured.verifier.verify(token, context);
    },
  };
}

/**
 * On ChatGPT Sites the platform runs OAuth for the Site's MCP server and forwards who signed in as
 * identity headers; the editors table decides the newsroom scopes. No identity means anonymous.
 */
async function resolveSitesPrincipal(request: Request): Promise<AuthenticatedPrincipal> {
  const identity = readSitesIdentity(request.headers);
  if (!identity) return anonymous;
  const editor = await resolveSitesEditor(requireSitesBindings().database, identity, getEditorAllowList());
  const granted = scopesForRole(editor?.role);
  return {
    kind: "editor",
    subject: identity.userId,
    scopes: granted,
    ...(granted.length && editor ? { authorId: editor.author.id } : {}),
  };
}

/** No Authorization header means anonymous; a header that does not verify is rejected. */
export async function resolvePrincipal(
  request: Request,
  verifier: AccessTokenVerifier,
): Promise<AuthenticatedPrincipal> {
  if (getContentMode() === "sites") return resolveSitesPrincipal(request);
  const header = request.headers.get("authorization");
  if (header === null) return anonymous;
  const match = /^Bearer\s+([^\s]+)$/i.exec(header);
  if (!match) throw new Unauthorized();
  const claims = await verifier.verify(match[1], { resource: protectedResource(request) });
  if (!claims) throw new Unauthorized();
  return {
    kind: "editor",
    subject: claims.subject,
    scopes: claims.scopes,
    ...(claims.authorId ? { authorId: claims.authorId } : {}),
  };
}

/**
 * The scopes a host may put into an authorization request. Supabase Auth rejects scopes it does not
 * define, so with it as the authorization server hosts only ever see its own; the newsroom scopes
 * stay a server-side check that the profile role decides.
 */
export function hostScopes(required: readonly Scope[]): readonly string[] {
  return getMcpOAuthEnvironment()?.scopes ?? required;
}

/** OpenAI's per-tool security declaration: `noauth`, or `oauth2` with the scopes it needs. */
export function securitySchemes(required: readonly Scope[]) {
  return required.length ? [{ type: "oauth2", scopes: [...hostScopes(required)] }] : [{ type: "noauth" }];
}

/** The public origin hosts reach this server at; the request URL is only trusted when none is configured. */
function publicOrigin(request: Request) {
  return (getConfiguredMcpUrl() ?? new URL(request.url)).origin;
}

export function protectedResource(request: Request) {
  return new URL("/mcp", publicOrigin(request)).href;
}

export function protectedResourceMetadataUrl(request: Request) {
  return new URL("/.well-known/oauth-protected-resource", publicOrigin(request)).href;
}

/** A Bearer challenge (RFC 6750) that points hosts at the resource metadata to start sign-in. */
export function bearerChallenge(
  request: Request,
  detail: { error: "invalid_token" | "insufficient_scope"; description: string; scope?: readonly Scope[] },
) {
  const parameters = [
    // The metadata exists only where Supabase Auth is the authorization server (not on Sites, not with the API key alone).
    ...(getMcpOAuthEnvironment() ? [`resource_metadata="${protectedResourceMetadataUrl(request)}"`] : []),
    `error="${detail.error}"`,
    `error_description="${detail.description}"`,
    ...(detail.scope?.length ? [`scope="${hostScopes(detail.scope).join(" ")}"`] : []),
  ];
  return `Bearer realm="atlasnews", ${parameters.join(", ")}`;
}
