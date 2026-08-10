import type { NextRequest } from "next/server";
import { CommentOperationError } from "@/modules/comments/application/errors";
import {
  commentIdSchema,
  editCommentRequestSchema,
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

type CommentRouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: CommentRouteContext) {
  try {
    requireSameOrigin(request);
    const [{ id: rawId }, body, resolved] = await Promise.all([
      context.params,
      readBoundedJson(request),
      resolveCommentActor(request),
    ]);
    const id = commentIdSchema.parse(rawId);
    const input = editCommentRequestSchema.parse(body);
    const service = createMutationCommentService();
    if (!service || !resolved) {
      throw new CommentOperationError(
        "configuration_unavailable",
        "Comment editing is unavailable.",
        503,
      );
    }

    const comment = await service.editOwn({
      id,
      body: input.body,
      displayName: input.displayName,
      actor: resolved.actor,
    });
    return attachCommentGuestCookie(commentJson({ comment }), resolved);
  } catch (error) {
    return commentErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: CommentRouteContext) {
  try {
    requireSameOrigin(request);
    const [{ id: rawId }, resolved] = await Promise.all([
      context.params,
      resolveCommentActor(request),
    ]);
    const id = commentIdSchema.parse(rawId);
    const service = createMutationCommentService();
    if (!service || !resolved) {
      throw new CommentOperationError(
        "configuration_unavailable",
        "Comment deletion is unavailable.",
        503,
      );
    }

    await service.deleteOwn(id, resolved.actor);
    return attachCommentGuestCookie(commentJson({ deletedId: id }), resolved);
  } catch (error) {
    return commentErrorResponse(error);
  }
}
