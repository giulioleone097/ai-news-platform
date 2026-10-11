import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod/v4";
import { CommentOperationError } from "@atlasnews/core/comments/application/errors";
import type { ContactMessageService } from "@atlasnews/core/support/application/contact-service";
import { contactRequestSchema } from "@atlasnews/core/support/domain/contact-message";
import { getRequestNetworkAddress } from "@/lib/request-network";
import { readBoundedJson, requireSameOrigin } from "@/server/comments/http";

function json(body: Record<string, unknown>, status: number, headers: HeadersInit = {}) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers },
  });
}

/** The form fields that failed, so the form can mark them; the messages are the form's own, in its language. */
function invalidFields(error: ZodError) {
  return [...new Set(error.issues.map((issue) => String(issue.path[0] ?? "")).filter(Boolean))];
}

/**
 * The contact form's POST: same-origin JSON only, bounded, honeypot first, then the service's validation
 * and rate limits. `getService` returns null when the inbox is not configured.
 */
export async function handleContactRequest(request: NextRequest, getService: () => ContactMessageService | null) {
  try {
    requireSameOrigin(request);
    const body = await readBoundedJson(request);

    // A bot that fills the hidden field is told it worked and nothing is stored.
    const trap = typeof body === "object" && body !== null ? (body as { website?: unknown }).website : undefined;
    if (typeof trap === "string" && trap.trim()) return json({ accepted: true }, 202);

    const input = contactRequestSchema.parse(body);
    const service = getService();
    if (!service) return json({ error: "unavailable" }, 503);

    const outcome = await service.submit(input, { requester: getRequestNetworkAddress(request.headers) });
    return outcome === "accepted"
      ? json({ accepted: true }, 202)
      : json({ error: "rate_limited" }, 429, { "Retry-After": "600" });
  } catch (error) {
    if (error instanceof ZodError) return json({ error: "invalid_request", fields: invalidFields(error) }, 400);
    // The same-origin and body checks are shared with the comments and report their failures this way.
    if (error instanceof CommentOperationError) return json({ error: error.code }, error.status);
    console.error("contact: the message could not be stored", error);
    return json({ error: "contact_failed" }, 500);
  }
}
