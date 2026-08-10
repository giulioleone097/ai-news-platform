import type { NextRequest } from "next/server";
import { getCommentEnvironment } from "@/config/env";
import { CommentOperationError } from "@/modules/comments/application/errors";
import { notificationTokenSchema } from "@/modules/comments/domain/schemas";
import { createMutationCommentService } from "@/modules/comments/infrastructure/container";
import {
  commentErrorResponse,
  commentJson,
  readBoundedJson,
  requireSameOrigin,
} from "@/modules/comments/infrastructure/http";
import {
  hashCommentSecret,
  verifyNotificationToken,
} from "@/modules/comments/infrastructure/identity-token";
import * as z from "zod/v4";

const requestSchema = z.object({ token: notificationTokenSchema });

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const input = requestSchema.parse(await readBoundedJson(request));
    const environment = getCommentEnvironment();
    const subscriptionId = environment
      ? verifyNotificationToken(input.token, environment.guestSecret)
      : null;
    const service = createMutationCommentService();
    if (!environment || !subscriptionId || !service) {
      throw new CommentOperationError(
        environment ? "notification_token_invalid" : "configuration_unavailable",
        environment ? "The notification link is invalid or expired." : "Comment notifications are unavailable.",
        environment ? 400 : 503,
      );
    }

    await service.verifyNotificationSubscription(
      subscriptionId,
      hashCommentSecret(input.token),
    );
    return commentJson({ verified: true });
  } catch (error) {
    return commentErrorResponse(error);
  }
}
