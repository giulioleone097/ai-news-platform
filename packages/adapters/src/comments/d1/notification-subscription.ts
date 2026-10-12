import type { CommentNotificationSubscriptionRepository } from "@atlasnews/core/comments/application/comment-repository";
import { D1CommentAccess } from "./access";
import {
  Condition,
  invalidToken,
  guarded,
} from "./sql";

/** The links in a notification email that confirm or end a reader's subscription to replies. */
export class D1CommentNotificationSubscriptionRepository extends D1CommentAccess implements CommentNotificationSubscriptionRepository {
  async verifyNotificationSubscription(subscriptionId: string, tokenHash: string) {
    await guarded(async () => {
      const now = new Date().toISOString();
      const verified = await this.statement(
        `UPDATE comment_notification_subscriptions SET verified_at = COALESCE(verified_at, ?), updated_at = ?
         WHERE id = ? AND verification_token_hash = ? AND verification_expires_at >= ? AND unsubscribed_at IS NULL`,
        now,
        now,
        subscriptionId,
        tokenHash,
        now,
      ).run();
      if (verified.meta.changes === 0) throw invalidToken();
    });
  }

  async unsubscribeNotificationSubscription(subscriptionId: string, tokenHash: string) {
    await guarded(async () => {
      const now = new Date().toISOString();
      const matches = new Condition(
        "EXISTS (SELECT 1 FROM comment_notification_subscriptions WHERE id = ? AND verification_token_hash = ?)",
        [subscriptionId, tokenHash],
      );
      const [unsubscribed] = await this.database.batch([
        this.statement(
          `UPDATE comment_notification_subscriptions SET unsubscribed_at = COALESCE(unsubscribed_at, ?), updated_at = ?
           WHERE id = ? AND verification_token_hash = ?`,
          now,
          now,
          subscriptionId,
          tokenHash,
        ),
        this.cancelNotifications(now, "subscription_id = ?", [subscriptionId], matches),
      ]);
      if (unsubscribed?.meta.changes === 0) throw invalidToken();
    });
  }
}
