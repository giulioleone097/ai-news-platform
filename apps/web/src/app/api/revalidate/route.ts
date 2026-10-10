import { createHash, timingSafeEqual } from "node:crypto";
import * as z from "zod/v4";

import { locales } from "@atlasnews/core/locale";
import { slugPattern } from "@atlasnews/core/editorial/domain/article";
import { invalidatePublicEditorialCache } from "@/lib/editorial-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const maximumBodyBytes = 8_192;
const invalidationSchema = z.object({
  locale: z.enum(locales),
  slugs: z.array(z.string().max(160).regex(slugPattern)).max(20),
});

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Lets the standalone MCP process purge this app's Next cache after an editorial write.
 * Fails closed: without ATLASNEWS_REVALIDATE_SECRET the route answers 503 to everyone.
 */
export async function POST(request: Request) {
  const secret = process.env.ATLASNEWS_REVALIDATE_SECRET?.trim();
  if (!secret || secret.length < 32) return reply(503, { error: "revalidation_not_configured" });

  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match || !timingSafeEqual(digest(match[1]), digest(secret))) {
    return reply(401, { error: "unauthorized" });
  }

  const text = await request.text();
  if (text.length > maximumBodyBytes) return reply(413, { error: "body_too_large" });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reply(400, { error: "invalid_body" });
  }
  const invalidation = invalidationSchema.safeParse(body);
  if (!invalidation.success) return reply(400, { error: "invalid_body" });

  invalidatePublicEditorialCache(invalidation.data);
  return reply(200, { revalidated: true });
}
