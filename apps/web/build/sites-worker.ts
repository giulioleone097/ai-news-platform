import type { ExecutionContext } from "@cloudflare/workers-types";
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

// The Worker entry of the ChatGPT Sites artifact: vinext serves the Next.js app, and the platform
// serves dist/client (static assets) before this code runs.
export default {
  fetch(request: Request, env: unknown, ctx: ExecutionContext) {
    return presizedMedia(request) ?? handler.fetch(request, env as never, ctx);
  },
};
