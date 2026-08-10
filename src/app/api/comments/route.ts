import type { NextRequest } from "next/server";
import { CommentOperationError } from "@/modules/comments/application/errors";
import {
  createCommentRequestSchema,
  publicCommentQuerySchema,
} from "@/modules/comments/domain/schemas";
import {
  createMutationCommentService,
  createPublicCommentService,
  getCommentCapability,
} from "@/modules/comments/infrastructure/container";
import { decodeCommentCursor } from "@/modules/comments/infrastructure/cursor";
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
import { createCommentNotificationPreference } from "@/modules/comments/infrastructure/notification-preference";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const result = publicCommentQuerySchema.parse({
      articleId: request.nextUrl.searchParams.get("articleId"),
      locale: request.nextUrl.searchParams.get("locale"),
      parentId: request.nextUrl.searchParams.get("parentId") || undefined,
      cursor: request.nextUrl.searchParams.get("cursor") || undefined,
      limit: request.nextUrl.searchParams.get("limit") || undefined,
      scope: request.nextUrl.searchParams.get("scope") || undefined,
    });
    const cursor = result.cursor ? decodeCommentCursor(result.cursor) : null;
    if (result.cursor && !cursor) {
      throw new CommentOperationError("invalid_cursor", "Invalid comment cursor.", 400);
    }

    const capability = getCommentCapability();
    if (result.scope === "own") {
      const service = createMutationCommentService();
      const resolved = await resolveCommentActor(request);
      if (!service || !resolved) {
        throw new CommentOperationError(
          "configuration_unavailable",
          "Owned comments are unavailable.",
          503,
        );
      }
      const page = await service.listOwn({
        articleId: result.articleId,
        locale: result.locale,
        parentId: result.parentId ?? null,
        cursor,
        limit: result.limit ?? capability.policy.publicPageSize,
        actor: resolved.actor,
      });
      return attachCommentGuestCookie(
        commentJson({ ...page, capability }),
        resolved,
      );
    }

    const service = createPublicCommentService();
    if (!service) {
      throw new CommentOperationError(
        "configuration_unavailable",
        "Comments are unavailable.",
        503,
      );
    }
    const page = await service.listApproved({
      articleId: result.articleId,
      locale: result.locale,
      parentId: result.parentId ?? null,
      cursor,
      limit: result.limit ?? capability.policy.publicPageSize,
    });

    return commentJson({ ...page, capability });
  } catch (error) {
    return commentErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const input = createCommentRequestSchema.parse(await readBoundedJson(request));

    if (input.website.trim()) {
      return commentJson({ accepted: true, status: "pending" }, { status: 202 });
    }
    const resolved = await resolveCommentActor(request);
    const service = createMutationCommentService();
    if (!service || !resolved) {
      throw new CommentOperationError(
        "configuration_unavailable",
        "Comment submissions are unavailable.",
        503,
      );
    }
    const notifications = input.notifications
      ? createCommentNotificationPreference(input.notifications)
      : null;
    if (input.notifications && !notifications) {
      throw new CommentOperationError(
        "configuration_unavailable",
        "Comment notifications are unavailable.",
        503,
      );
    }

    const comment = await service.create({
      articleId: input.articleId,
      locale: input.locale,
      parentId: input.parentId,
      body: input.body,
      displayName: input.displayName,
      actor: resolved.actor,
      notifications,
    });
    return attachCommentGuestCookie(
      commentJson({ comment, accepted: true }, { status: 202 }),
      resolved,
    );
  } catch (error) {
    return commentErrorResponse(error);
  }
}
