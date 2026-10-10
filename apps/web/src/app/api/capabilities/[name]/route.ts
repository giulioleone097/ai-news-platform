import { getPublicSiteUrl } from "@atlasnews/adapters/config/env";
import { runEditorCapability } from "@/server/capabilities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Room for a media batch (ten base64 images); every other call is far smaller. */
const maximumBodyBytes = 3 * 1024 * 1024;

type RouteContext = { params: Promise<{ name: string }> };

function reply(status: number, body: Record<string, unknown>, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");
  return Response.json(body, { status, headers: responseHeaders });
}

/**
 * The call is authenticated by the editor's cookies, so only this site's own pages may make it.
 * A browser always sends `Origin` on a POST and `Sec-Fetch-Site` on any request; without an
 * `Origin` the request is accepted only when the browser vouches that it is same-origin.
 */
function isSameOriginRequest(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin") return false;

  const origin = request.headers.get("origin");
  if (origin === null) return fetchSite === "same-origin";
  const allowed = new Set([new URL(request.url).origin, getPublicSiteUrl().origin]);
  return allowed.has(origin);
}

/** Reads at most `maximumBodyBytes`, so an oversized body is never held in memory. */
async function readBoundedText(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBodyBytes) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBodyBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function parseBody(text: string): { input: unknown; confirmed: boolean } | null {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { input, confirmed } = body as { input?: unknown; confirmed?: unknown };
  if (confirmed !== undefined && typeof confirmed !== "boolean") return null;
  return { input, confirmed: confirmed === true };
}

/**
 * Runs one catalogue capability for the signed-in Studio editor: the way the page's site tools
 * (WebMCP) reach the content capabilities. Body: `{ "input": {...}, "confirmed": true | false }`.
 * `confirmed: true` asserts that a person approved this exact action in the page; a capability that
 * asks first (publishing, deleting) answers 409 with its question until it is sent.
 * Same-origin only, JSON only, no CORS headers: a cross-site page can neither call nor read it.
 */
export async function POST(request: Request, context: RouteContext) {
  if (!isSameOriginRequest(request)) return reply(403, { ok: false, error: "Cross-site requests are not allowed." });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return reply(415, { ok: false, error: "Send the request as application/json." });
  }

  const text = await readBoundedText(request);
  if (text === null) return reply(413, { ok: false, error: "The request body is too large." });
  const body = parseBody(text);
  if (!body) {
    return reply(400, { ok: false, error: 'Send a JSON object like {"input": {...}, "confirmed": false}.' });
  }

  const { name } = await context.params;
  const outcome = await runEditorCapability(name, body.input, { confirmed: body.confirmed });
  return outcome.ok
    ? reply(200, outcome)
    : reply(outcome.status, { ok: false, error: outcome.error });
}

function methodNotAllowed() {
  return reply(405, { ok: false, error: "Use POST." }, { Allow: "POST" });
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
