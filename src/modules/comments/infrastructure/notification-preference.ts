import "server-only";

import { randomUUID } from "node:crypto";
import { getCommentNotificationEnvironment } from "@/config/env";
import type { CommentNotificationPreference } from "../domain/comment";
import {
  createNotificationToken,
  hashCommentSecret,
} from "./identity-token";

export function createCommentNotificationPreference(input: {
  email: string;
  onReplies: boolean;
  onModeration: boolean;
}): CommentNotificationPreference | null {
  const environment = getCommentNotificationEnvironment();
  if (!environment) return null;

  const subscriptionId = randomUUID();
  const token = createNotificationToken(environment.guestSecret, subscriptionId);
  return {
    email: input.email.trim().toLowerCase(),
    emailHash: hashCommentSecret(input.email.trim().toLowerCase()),
    onReplies: input.onReplies,
    onModeration: input.onModeration,
    subscriptionId,
    verificationTokenHash: hashCommentSecret(token),
  };
}
