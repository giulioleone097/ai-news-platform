import { CommentOperationError } from "@/modules/comments/application/errors";
import { commentIdSchema } from "@/modules/comments/domain/schemas";
import { createMutationCommentService } from "@/modules/comments/infrastructure/container";
import {
  commentErrorResponse,
  commentJson,
} from "@/modules/comments/infrastructure/http";
import { requireCommentModerator } from "@/modules/comments/infrastructure/moderator-auth";

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
