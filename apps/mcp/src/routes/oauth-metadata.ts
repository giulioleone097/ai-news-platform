import { scopes } from "@atlasnews/contract";

import { protectedResource } from "../auth";

/**
 * RFC 9728 protected-resource metadata, the document that a Bearer challenge points at.
 * `authorization_servers` is added when an OAuth verifier is configured.
 */
export function GET(request: Request) {
  return Response.json(
    {
      resource: protectedResource(request),
      scopes_supported: scopes,
      bearer_methods_supported: ["header"],
    },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" } },
  );
}
