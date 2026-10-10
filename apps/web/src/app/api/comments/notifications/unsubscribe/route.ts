import type { NextRequest } from "next/server";
import { getCommentEnvironment } from "@atlasnews/adapters/config/env";
import { CommentOperationError } from "@atlasnews/core/comments/application/errors";
import { notificationTokenSchema } from "@atlasnews/core/comments/domain/schemas";
import { createMutationCommentService } from "@/server/composition";
import {
  commentErrorResponse,
  commentJson,
  readBoundedJson,
  requireSameOrigin,
} from "@/server/comments/http";
import {
  hashCommentSecret,
  verifyNotificationToken,
} from "@atlasnews/adapters/comments/identity-token";
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

    await service.unsubscribeNotificationSubscription(
      subscriptionId,
      hashCommentSecret(input.token),
    );
    return commentJson({ unsubscribed: true });
  } catch (error) {
    return commentErrorResponse(error);
  }
}
