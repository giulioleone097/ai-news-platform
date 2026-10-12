import type { ExecutionContext } from "@cloudflare/workers-types";
import { setSitesBindings } from "@atlasnews/adapters/sites/bindings";
import { handleJobsRequest } from "@atlasnews/jobs/handler";
import { runDueJobsOnSites } from "@atlasnews/jobs/scheduled";
import { handleMcpServerRequest } from "@atlasnews/mcp/handler";
import handler from "vinext/server/fetch-handler";

// Replaced at build time by vite.config.ts: pre-sized widths of each local /media/<name>.webp.
declare const __PRESIZED_MEDIA__: Record<string, number[]>;

// Sites has no image resizer, so vinext answers /_next/image with a redirect to the original file.
// For local media that ship pre-sized, redirect to the smallest variant that is wide enough instead.
function presizedMedia(request: Request) {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname !== "/_next/image") return null;
  const name = /^\/media\/([\w-]+)\.webp$/.exec(url.searchParams.get("url") ?? "")?.[1];
  const width = Number(url.searchParams.get("w"));
  const target = name && Number.isFinite(width)
    ? __PRESIZED_MEDIA__[name]?.find((candidate) => candidate >= width)
    : undefined;
  if (!target) return null;
  return new Response(null, {
    status: 302,
    headers: { Location: `/media/${name}-${target}.webp`, "Cache-Control": "public, max-age=31536000" },
  });
}

/**
 * On Sites one Worker serves all three deployables. The MCP server answers at `/mcp` (Sites declares it
 * with the `mcp` capability and signs editors in for it), the workers at `/internal/*` (for an external
 * schedule, with `CRON_SECRET`), and vinext the Next.js app at every other path. Self-hosted, the same
 * handlers run as the `apps/mcp` and `apps/jobs` containers instead (docs/HOSTING.md).
 */
const mcpPaths = new Set(["/mcp", "/info", "/.well-known/openai-apps-challenge"]);

function route(request: Request, env: unknown, ctx: ExecutionContext) {
  const { pathname } = new URL(request.url);
  if (mcpPaths.has(pathname)) return handleMcpServerRequest(request);
  if (pathname.startsWith("/internal/")) return handleJobsRequest(request);
  return presizedMedia(request) ?? handler.fetch(request, env as never, ctx);
}

// The Worker entry of the ChatGPT Sites artifact; the platform serves dist/client (static assets) before
// this code runs.
const worker = {
  fetch(request: Request, env: unknown, ctx: ExecutionContext) {
    setSitesBindings(env);
    // Sites has no scheduler: due outbox and event jobs run in the background of ordinary requests.
    ctx.waitUntil(runDueJobsOnSites().catch(() => undefined));
    return route(request, env, ctx);
  },
};

export default worker;
