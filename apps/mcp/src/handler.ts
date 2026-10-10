import * as info from "./routes/info";
import * as mcp from "./routes/mcp";
import * as oauthMetadata from "./routes/oauth-metadata";
import * as openaiChallenge from "./routes/openai-challenge";

type Route = Partial<Record<string, (request: Request) => Response | Promise<Response>>>;

const routes: Record<string, Route> = {
  "/mcp": mcp,
  "/info": info,
  "/.well-known/oauth-protected-resource": oauthMetadata,
  // Path-suffixed form (RFC 9728) that some hosts try before the root document.
  "/.well-known/oauth-protected-resource/mcp": oauthMetadata,
  "/.well-known/openai-apps-challenge": openaiChallenge,
};

/** Web-standard handler for the standalone MCP server: `/mcp`, `/info` and the OAuth resource metadata. */
export async function handleMcpServerRequest(request: Request): Promise<Response> {
  const route = routes[new URL(request.url).pathname];
  if (!route) return Response.json({ error: "not_found" }, { status: 404 });
  const method = route[request.method];
  return method
    ? method(request)
    : new Response(null, { status: 405, headers: { Allow: Object.keys(route).join(", ") } });
}
