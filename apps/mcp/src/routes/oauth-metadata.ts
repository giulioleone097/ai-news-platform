import { getMcpOAuthEnvironment } from "@atlasnews/adapters/config/env";
import { protectedResource } from "../auth";

/**
 * RFC 9728 protected-resource metadata, the document that a Bearer challenge points at. It exists only
 * when Supabase Auth is the authorization server: that server is named (Claude reads only the first
 * entry) and the scopes it can grant are listed. Where there is none (Sites, whose platform runs sign-in,
 * or a deployment that has only the API key) the answer is 404, not a document without a server.
 */
export function GET(request: Request) {
  const oauth = getMcpOAuthEnvironment();
  if (!oauth) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(
    {
      resource: protectedResource(request),
      authorization_servers: [oauth.issuer],
      scopes_supported: oauth.scopes,
      bearer_methods_supported: ["header"],
    },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" } },
  );
}
