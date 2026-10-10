import { CommentOperationError } from "@atlasnews/core/comments/application/errors";
import { commentIdSchema } from "@atlasnews/core/comments/domain/schemas";
import { createMutationCommentService } from "@/server/composition";
import {
  commentErrorResponse,
  commentJson,
} from "@/server/comments/http";
import { requireCommentModerator } from "@/server/comments/moderator-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id: rawId }] = await Promise.all([
      context.params,
      requireCommentModerator(),
    ]);
    const id = commentIdSchema.parse(rawId);
    const service = createMutationCommentService();
    if (!service) {
      throw new CommentOperationError(
        "configuration_unavailable",
        "Comment moderation is unavailable.",
        503,
      );
    }

    return commentJson({ items: await service.listReports(id) });
  } catch (error) {
    return commentErrorResponse(error);
  }
}
