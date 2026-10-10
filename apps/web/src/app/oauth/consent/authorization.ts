import type { SupabaseClient } from "@supabase/supabase-js";
import { getOAuthRedirectHosts } from "@atlasnews/adapters/config/env";
import { isAllowedRedirectUri } from "@atlasnews/adapters/config/oauth-redirect";

/** Supabase Auth issues opaque ids; this only keeps odd characters out of URLs and queries. */
export const authorizationIdPattern = /^[A-Za-z0-9_-]{8,128}$/;

export function consentPath(authorizationId: string) {
  return `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
}

/** The same rule as the MCP server and the Studio: a profile with role editor or admin. */
export async function isEditorProfile(client: SupabaseClient, userId: string) {
  const { data } = await client
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .in("role", ["editor", "admin"])
    .maybeSingle();
  return Boolean(data);
}

/**
 * Whether the application may send the editor, and the code, to this address. Dynamic client
 * registration lets anyone register a client with any name and redirect URI, so approval depends on
 * the host the editor lands on, not on the name the application gave itself.
 */
export function isRedirectAllowed(redirectUri: string) {
  return isAllowedRedirectUri(redirectUri, getOAuthRedirectHosts());
}

/** The host shown to the editor; the whole value when it is not a URL. */
export function redirectHost(redirectUri: string) {
  try {
    return new URL(redirectUri).host || redirectUri;
  } catch {
    return redirectUri;
  }
}
