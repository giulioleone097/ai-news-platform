import type { CommentRepository } from "@atlasnews/core/comments/application/comment-repository";
import type {
  CommentModerationRepository,
  CommentNotificationSubscriptionRepository,
  CommentThreadRepository,
} from "@atlasnews/core/comments/application/comment-repository";
import { composePorts, portPart } from "../compose-ports";
import type { D1Database } from "../sites/cloudflare";
import { D1CommentModerationRepository } from "./d1/moderation";
import { D1CommentNotificationSubscriptionRepository } from "./d1/notification-subscription";
import { D1CommentThreadRepository } from "./d1/thread";

/**
 * Comments on D1, one class per port in `./d1`. It carries the rules that the Postgres functions of `20260810110000_comments.sql`
 * enforce: input and actor validation, the edit and delete windows, the reply depth, the rate limits, the
 * report dedupe, the moderation audit and the notification outbox rows. Every multi-statement write is one
 * `batch()`; a statement that cannot apply (a lost race) is skipped with its dependents, and a rate-limit
 * hit over its limit aborts the whole batch through the `comment_rate_limited` CHECK.
 */

const threadMembers: Record<keyof CommentThreadRepository, true> = {
  listApproved: true, listOwn: true, create: true, editOwn: true, deleteOwn: true, report: true,
};
const moderationMembers: Record<keyof CommentModerationRepository, true> = {
  listModeration: true, getModeration: true, countByStatus: true, listReports: true, moderate: true,
  moderateMany: true, listAudit: true,
};
const notificationSubscriptionMembers: Record<keyof CommentNotificationSubscriptionRepository, true> = {
  verifyNotificationSubscription: true, unsubscribeNotificationSubscription: true,
};

export function createD1CommentRepository(database: D1Database): CommentRepository {
  return composePorts<[
    CommentThreadRepository,
    CommentModerationRepository,
    CommentNotificationSubscriptionRepository,
  ]>(
    portPart<CommentThreadRepository>(new D1CommentThreadRepository(database), threadMembers),
    portPart<CommentModerationRepository>(new D1CommentModerationRepository(database), moderationMembers),
    portPart<CommentNotificationSubscriptionRepository>(
      new D1CommentNotificationSubscriptionRepository(database),
      notificationSubscriptionMembers,
    ),
  );
}
