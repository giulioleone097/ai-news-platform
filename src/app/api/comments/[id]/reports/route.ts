import type { NextRequest } from "next/server";
import { CommentOperationError } from "@/modules/comments/application/errors";
import {
  commentIdSchema,
  reportCommentRequestSchema,
} from "@/modules/comments/domain/schemas";
import { createMutationCommentService } from "@/modules/comments/infrastructure/container";
import {
  attachCommentGuestCookie,
  resolveCommentActor,
} from "@/modules/comments/infrastructure/guest-identity";
import {
  commentErrorResponse,
  commentJson,
  readBoundedJson,
  requireSameOrigin,
} from "@/modules/comments/infrastructure/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireSameOrigin(request);
    const [{ id: rawId }, body] = await Promise.all([
      context.params,
      readBoundedJson(request),
    ]);
    const commentId = commentIdSchema.parse(rawId);
    const input = reportCommentRequestSchema.parse(body);

    if (input.website.trim()) {
      return commentJson({ accepted: true }, { status: 202 });
    }
    const resolved = await resolveCommentActor(request);
    const service = createMutationCommentService();
    if (!service || !resolved) {
      throw new CommentOperationError(
        "configuration_unavailable",
        "Comment reporting is unavailable.",
        503,
      );
    }

    await service.report({
      commentId,
      reason: input.reason,
      details: input.details,
      actor: resolved.actor,
    });
    return attachCommentGuestCookie(
      commentJson({ accepted: true }, { status: 202 }),
      resolved,
    );
  } catch (error) {
    return commentErrorResponse(error);
  }
}
