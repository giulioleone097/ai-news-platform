import type { NextRequest } from "next/server";
import { CommentOperationError } from "@atlasnews/core/comments/application/errors";
import { moderationQuerySchema } from "@atlasnews/core/comments/domain/schemas";
import { createMutationCommentService } from "@/server/composition";
import { decodeCommentCursor } from "@atlasnews/core/comments/domain/cursor";
import {
  commentErrorResponse,
  commentJson,
} from "@/server/comments/http";
import { requireCommentModerator } from "@/server/comments/moderator-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const [input] = await Promise.all([
      moderationQuerySchema.parseAsync({
        status: request.nextUrl.searchParams.get("status") || undefined,
        locale: request.nextUrl.searchParams.get("locale") || undefined,
        cursor: request.nextUrl.searchParams.get("cursor") || undefined,
        limit: request.nextUrl.searchParams.get("limit") || undefined,
      }),
      requireCommentModerator(),
    ]);
    const cursor = input.cursor ? decodeCommentCursor(input.cursor) : null;
    if (input.cursor && !cursor) {
      throw new CommentOperationError("invalid_cursor", "Invalid comment cursor.", 400);
    }

    const service = createMutationCommentService();
    if (!service) {
      throw new CommentOperationError(
        "configuration_unavailable",
        "Comment moderation is unavailable.",
        503,
      );
    }

    const page = await service.listModeration({
      status: input.status ?? null,
      locale: input.locale ?? null,
      cursor,
      limit: input.limit ?? 30,
    });
    return commentJson(page);
  } catch (error) {
    return commentErrorResponse(error);
  }
}
