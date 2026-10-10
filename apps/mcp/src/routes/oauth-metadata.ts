import { getMcpOAuthEnvironment } from "@atlasnews/adapters/config/env";
import { scopes } from "@atlasnews/contract";

import { protectedResource } from "../auth";

/**
 * RFC 9728 protected-resource metadata, the document that a Bearer challenge points at.
 * With Supabase Auth configured it names that authorization server first (Claude reads only the
 * first entry) and lists the scopes it can grant; otherwise the API key is the only credential.
 */
export function GET(request: Request) {
  const oauth = getMcpOAuthEnvironment();
  return Response.json(
    {
      resource: protectedResource(request),
      ...(oauth ? { authorization_servers: [oauth.issuer] } : {}),
      scopes_supported: oauth ? oauth.scopes : scopes,
      bearer_methods_supported: ["header"],
    },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" } },
  );
}
