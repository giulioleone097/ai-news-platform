import * as info from "./routes/info";
import * as mcp from "./routes/mcp";
import * as oauthMetadata from "./routes/oauth-metadata";

type Route = Partial<Record<string, (request: Request) => Response | Promise<Response>>>;

const routes: Record<string, Route> = {
  "/mcp": mcp,
  "/info": info,
  "/.well-known/oauth-protected-resource": oauthMetadata,
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
