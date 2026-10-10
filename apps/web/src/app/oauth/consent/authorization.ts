import type { SupabaseClient } from "@supabase/supabase-js";

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
