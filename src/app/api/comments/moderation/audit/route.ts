import type { NextRequest } from "next/server";
import { CommentOperationError } from "@/modules/comments/application/errors";
import { commentPolicy } from "@/modules/comments/domain/comment";
import { commentCursorSchema } from "@/modules/comments/domain/schemas";
import { createMutationCommentService } from "@/modules/comments/infrastructure/container";
import { decodeAuditCursor } from "@/modules/comments/infrastructure/cursor";
import {
  commentErrorResponse,
  commentJson,
} from "@/modules/comments/infrastructure/http";
import { requireCommentModerator } from "@/modules/comments/infrastructure/moderator-auth";
import * as z from "zod/v4";

const auditQuerySchema = z.object({
  cursor: commentCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(commentPolicy.maxModerationPageSize).optional(),
});

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const [input] = await Promise.all([
      auditQuerySchema.parseAsync({
        cursor: request.nextUrl.searchParams.get("cursor") || undefined,
        limit: request.nextUrl.searchParams.get("limit") || undefined,
      }),
      requireCommentModerator(),
    ]);
    const beforeId = input.cursor ? decodeAuditCursor(input.cursor) : null;
    if (input.cursor && !beforeId) {
      throw new CommentOperationError("invalid_cursor", "Invalid audit cursor.", 400);
    }
    const service = createMutationCommentService();
    if (!service) {
      throw new CommentOperationError(
        "configuration_unavailable",
        "Comment moderation is unavailable.",
        503,
      );
    }

    return commentJson(await service.listAudit({
      beforeId,
      limit: input.limit ?? commentPolicy.moderationPageSize,
    }));
  } catch (error) {
    return commentErrorResponse(error);
  }
}
