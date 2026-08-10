import type { NextRequest } from "next/server";
import { CommentOperationError } from "@/modules/comments/application/errors";
import { moderationQuerySchema } from "@/modules/comments/domain/schemas";
import { createMutationCommentService } from "@/modules/comments/infrastructure/container";
import { decodeCommentCursor } from "@/modules/comments/infrastructure/cursor";
import {
  commentErrorResponse,
  commentJson,
} from "@/modules/comments/infrastructure/http";
import { requireCommentModerator } from "@/modules/comments/infrastructure/moderator-auth";

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
