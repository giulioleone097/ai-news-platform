import { afterEach, describe, expect, it, vi } from "vitest";
import { commentErrorMessage, CommentRequestError, sendComment } from "./comment-api";
import { commentCopy } from "./comment-copy";

function respond(status: number, body: string) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status })));
}

async function failure(): Promise<unknown> {
  return sendComment("/api/comments", "POST", { body: "x" }).then(
    () => null,
    (error: unknown) => error,
  );
}

describe("comment request errors", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the API error code and never the English message", async () => {
    respond(429, JSON.stringify({ error: "rate_limited", message: "Too many requests. Try again later." }));

    const error = await failure();

    expect(error).toBeInstanceOf(CommentRequestError);
    expect((error as CommentRequestError).code).toBe("rate_limited");
    expect((error as CommentRequestError).message).toBe("rate_limited");
  });

  it("tells the reader in the language of the widget", async () => {
    respond(409, JSON.stringify({ error: "already_reported", message: "You already reported this comment." }));
    const error = await failure();

    expect(commentErrorMessage(error, commentCopy.it, "fallback")).toBe(commentCopy.it.errorAlreadyReported);
    expect(commentErrorMessage(error, commentCopy.en, "fallback")).toBe(commentCopy.en.errorAlreadyReported);
    expect(commentCopy.it.errorAlreadyReported).not.toBe(commentCopy.en.errorAlreadyReported);
  });

  it.each([
    ["rate_limited", "errorRateLimited"],
    ["operation_not_allowed", "errorNotAllowed"],
    ["invalid_request", "errorInvalid"],
    ["not_found", "errorNotFound"],
    ["configuration_unavailable", "unavailable"],
  ] as const)("maps %s to its copy", (code, key) => {
    expect(commentErrorMessage(new CommentRequestError(code), commentCopy.it, "fallback")).toBe(commentCopy.it[key]);
  });

  it("falls back to the action's own text for a storage error, a gateway page or no network", async () => {
    expect(commentErrorMessage(new CommentRequestError("storage_error"), commentCopy.it, commentCopy.it.updateFailed))
      .toBe(commentCopy.it.updateFailed);

    respond(502, "<html>Bad gateway</html>");
    const gateway = await failure();
    expect((gateway as CommentRequestError).code).toBe("comment_operation_failed");
    expect(commentErrorMessage(gateway, commentCopy.it, commentCopy.it.deleteFailed)).toBe(commentCopy.it.deleteFailed);

    expect(commentErrorMessage(new TypeError("Failed to fetch"), commentCopy.it, commentCopy.it.errorGeneric))
      .toBe(commentCopy.it.errorGeneric);
  });

  it("returns the comment of a successful request", async () => {
    respond(202, JSON.stringify({ accepted: true, comment: { id: "c1" } }));

    await expect(sendComment("/api/comments", "POST", {})).resolves.toMatchObject({ comment: { id: "c1" } });
  });
});
