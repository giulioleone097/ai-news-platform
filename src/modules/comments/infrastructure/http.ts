import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod/v4";
import { CommentOperationError } from "../application/errors";

const maximumJsonBytes = 20_000;

export function commentJson(
  body: unknown,
  init: { status?: number; headers?: HeadersInit } = {},
) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Vary", "Cookie, Authorization");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

export function isSameOriginMutation(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export async function readBoundedJson(request: NextRequest): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new CommentOperationError("invalid_request", "Expected JSON request body.", 415);
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumJsonBytes) {
    throw new CommentOperationError("invalid_request", "Request body is too large.", 413);
  }

  if (!request.body) {
    throw new CommentOperationError("invalid_request", "Request body is required.", 400);
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumJsonBytes) {
        await reader.cancel();
        throw new CommentOperationError("invalid_request", "Request body is too large.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof CommentOperationError) throw error;
    throw new CommentOperationError("invalid_request", "Malformed JSON request body.", 400);
  }
}

export function commentErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return commentJson(
      { error: "invalid_request", message: "Invalid comment request." },
      { status: 400 },
    );
  }
  if (error instanceof CommentOperationError) {
    return commentJson({ error: error.code, message: error.message }, { status: error.status });
  }
  return commentJson(
    { error: "comment_operation_failed", message: "The comment operation could not be completed." },
    { status: 500 },
  );
}

export function requireSameOrigin(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    throw new CommentOperationError("operation_not_allowed", "Cross-origin mutation rejected.", 403);
  }
}
