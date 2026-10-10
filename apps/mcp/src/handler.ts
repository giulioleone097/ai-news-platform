import * as admin from "./routes/admin";
import * as info from "./routes/info";
import * as publicMcp from "./routes/public";

type Route = Partial<Record<string, (request: Request) => Response | Promise<Response>>>;

const routes: Record<string, Route> = {
  "/mcp": publicMcp,
  "/mcp/admin": admin,
  "/info": info,
};

/** Web-standard handler for the standalone MCP server: `/mcp`, `/mcp/admin` and `/info`. */
export async function handleMcpServerRequest(request: Request): Promise<Response> {
  const route = routes[new URL(request.url).pathname];
  if (!route) return Response.json({ error: "not_found" }, { status: 404 });
  const method = route[request.method];
  return method
    ? method(request)
    : new Response(null, { status: 405, headers: { Allow: Object.keys(route).join(", ") } });
}
