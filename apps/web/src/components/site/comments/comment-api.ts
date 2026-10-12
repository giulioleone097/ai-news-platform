import type { CreatedComment } from "@atlasnews/core/comments/domain/comment";
import type { Copy } from "./comment-copy";

/** A request the comments API refused or could not finish. `code` is the `error` code it answered with. */
export class CommentRequestError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CommentRequestError";
  }
}

export async function sendComment(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  // A failure behind the API (a gateway page, say) is not JSON; it still fails the request.
  const value = (await response.json().catch(() => ({}))) as { error?: string; comment?: CreatedComment };
  if (!response.ok) throw new CommentRequestError(value.error ?? "comment_operation_failed");
  return value;
}

/**
 * What to tell the reader about a failed request, in the widget's language. The API's `error` code decides;
 * its `message` is English and never shown. Anything else (a storage error, no network) gets `fallback`.
 */
export function commentErrorMessage(error: unknown, text: Copy, fallback: string) {
  if (!(error instanceof CommentRequestError)) return fallback;
  switch (error.code) {
    case "rate_limited":
      return text.errorRateLimited;
    case "already_reported":
      return text.errorAlreadyReported;
    case "operation_not_allowed":
      return text.errorNotAllowed;
    case "invalid_request":
      return text.errorInvalid;
    case "not_found":
      return text.errorNotFound;
    case "configuration_unavailable":
      return text.unavailable;
    default:
      return fallback;
  }
}
