import type { NextRequest } from "next/server";
import { CommentOperationError } from "@atlasnews/core/comments/application/errors";
import {
  commentIdSchema,
  moderateCommentRequestSchema,
} from "@atlasnews/core/comments/domain/schemas";
import { createMutationCommentService } from "@/server/composition";
import {
  commentErrorResponse,
  commentJson,
  readBoundedJson,
  requireSameOrigin,
} from "@/server/comments/http";
import { requireCommentModerator } from "@/server/comments/moderator-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireSameOrigin(request);
    const [{ id: rawId }, body, actor] = await Promise.all([
      context.params,
      readBoundedJson(request),
      requireCommentModerator(),
    ]);
    const id = commentIdSchema.parse(rawId);
    const input = moderateCommentRequestSchema.parse(body);
    const service = createMutationCommentService();
    if (!service) {
      throw new CommentOperationError(
        "configuration_unavailable",
        "Comment moderation is unavailable.",
        503,
      );
    }

    await service.moderate({ id, ...input, actor });
    return commentJson({ moderatedId: id, status: input.status });
  } catch (error) {
    return commentErrorResponse(error);
  }
}
