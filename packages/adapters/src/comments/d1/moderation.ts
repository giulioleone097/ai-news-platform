import type {
  CommentModerationRepository,
  ModerationAuditQuery,
  ModerationCommentQuery,
} from "@atlasnews/core/comments/application/comment-repository";
import { D1CommentAccess } from "./access";
import {
  type CommentRow,
  Condition,
  notFound,
  notAllowed,
  guarded,
  pageOf,
  cursorFilter,
  moderationSelect,
  type ModerationRow,
  toModerationComment,
  parentApproved,
  assertModeration,
} from "./sql";
import {
  type CommentStatus,
  type ModerateCommentInput,
  type ModerateCommentsInput,
  type ModerationAuditEvent,
  type ModerationReport,
} from "@atlasnews/core/comments/domain/comment";
import {
  encodeAuditCursor,
} from "@atlasnews/core/comments/domain/cursor";

/** The moderators' side of comments: the queue, the reports, the decisions and the audit trail. */
export class D1CommentModerationRepository extends D1CommentAccess implements CommentModerationRepository {
  async listModeration(query: ModerationCommentQuery) {
    return guarded(async () => {
      const cursor = cursorFilter(query.cursor);
      const { results } = await this.statement(
        `${moderationSelect}
         WHERE (? IS NULL OR c.status = ?) AND (? IS NULL OR c.locale = ?) ${cursor.sql}
         ORDER BY c.created_at DESC, c.id DESC LIMIT ?`,
        query.status,
        query.status,
        query.locale,
        query.locale,
        ...cursor.binds,
        query.limit + 1,
      ).all<ModerationRow>();
      return pageOf(results, query.limit, toModerationComment);
    });
  }

  async getModeration(id: string) {
    return guarded(async () => {
      const row = await this.statement(`${moderationSelect} WHERE c.id = ?`, id).first<ModerationRow>();
      return row ? toModerationComment(row) : null;
    });
  }

  async countByStatus(status: CommentStatus) {
    return guarded(async () => {
      const row = await this.statement("SELECT count(*) AS total FROM comments WHERE status = ?", status).first<{ total: number }>();
      return row?.total ?? 0;
    });
  }

  async listReports(commentId: string) {
    return guarded(async () => {
      const { results } = await this.statement(
        `SELECT id, comment_id, reason, details, status, created_at FROM comment_reports
         WHERE comment_id = ? ORDER BY created_at DESC, id DESC`,
        commentId,
      ).all<{
        id: string;
        comment_id: string;
        reason: ModerationReport["reason"];
        details: string | null;
        status: ModerationReport["status"];
        created_at: string;
      }>();
      return results.map((row): ModerationReport => ({
        id: row.id,
        commentId: row.comment_id,
        reason: row.reason,
        details: row.details,
        status: row.status,
        createdAt: row.created_at,
      }));
    });
  }

  async moderate(input: ModerateCommentInput) {
    const reason = assertModeration(input);

    await guarded(async () => {
      const target = await this.commentById(input.id);
      if (!target) throw notFound();
      if (target.status === "deleted") throw notAllowed();
      if (input.status === "approved" && target.parent_id !== null) {
        const parent = await this.commentById(target.parent_id);
        if (parent?.status !== "approved") throw notAllowed();
      }

      const now = new Date().toISOString();
      const deleting = input.status === "deleted";
      const statements = [
        this.statement(
          `UPDATE comments AS c SET status = ?,
             body = CASE WHEN ? THEN '[deleted]' ELSE body END,
             author_display_name = CASE WHEN ? THEN 'Deleted user' ELSE author_display_name END,
             deleted_at = CASE WHEN ? THEN ? ELSE NULL END,
             updated_at = ?
           WHERE c.id = ? AND c.status = ? AND (? <> 'approved' OR ${parentApproved("c")})`,
          input.status,
          deleting ? 1 : 0,
          deleting ? 1 : 0,
          deleting ? 1 : 0,
          now,
          now,
          target.id,
          target.status,
          input.status,
        ),
        ...this.moderationRecords(target, input, reason, now),
      ];
      if (!(await this.didApply(statements, 0))) throw notAllowed();
    });
  }

  /**
   * One status for every comment, in one `batch()` that holds a single UPDATE. Its WHERE clause only matches
   * when all the comments can take the status (a count taken before the update runs), so a comment that was
   * deleted or whose parent is not approved since the service checked leaves every comment untouched.
   */
  async moderateMany(input: ModerateCommentsInput) {
    const reason = assertModeration(input);

    await guarded(async () => {
      const { results: targets } = await this.statement(
        `SELECT * FROM comments WHERE id IN (${input.ids.map(() => "?").join(", ")})`,
        ...input.ids,
      ).all<CommentRow>();
      if (targets.length !== input.ids.length) throw notFound();
      const byId = new Map(targets.map((target) => [target.id, target]));

      const now = new Date().toISOString();
      const deleting = input.status === "deleted" ? 1 : 0;
      const idList = input.ids.map(() => "?").join(", ");
      const eligible = (alias: string) =>
        `${alias}.status <> 'deleted' AND (? <> 'approved' OR ${parentApproved(alias)})`;
      const statements = [
        this.statement(
          `UPDATE comments AS c SET status = ?,
             body = CASE WHEN ? THEN '[deleted]' ELSE body END,
             author_display_name = CASE WHEN ? THEN 'Deleted user' ELSE author_display_name END,
             deleted_at = CASE WHEN ? THEN ? ELSE NULL END,
             updated_at = ?
           WHERE c.id IN (${idList}) AND ${eligible("c")}
             AND (SELECT count(*) FROM comments t WHERE t.id IN (${idList}) AND ${eligible("t")}) = ?`,
          input.status,
          deleting,
          deleting,
          deleting,
          now,
          now,
          ...input.ids,
          input.status,
          ...input.ids,
          input.status,
          input.ids.length,
        ),
        ...input.ids.flatMap((id) => this.moderationRecords(byId.get(id)!, input, reason, now)),
      ];
      if (!(await this.didApply(statements, 0))) throw notAllowed();
    });
  }

  /**
   * What follows the status change of one comment: its audit row, the resolved reports and the notifications.
   * Every statement carries the condition that the comment now holds this status as of `now`, so it is a
   * no-op when the UPDATE did not apply.
   */
  private moderationRecords(target: CommentRow, input: Pick<ModerateCommentInput, "status" | "actor">, reason: string, now: string) {
    const { actor } = input;
    const applied = new Condition(
      "EXISTS (SELECT 1 FROM comments WHERE id = ? AND updated_at = ? AND status = ?)",
      [target.id, now, input.status],
    );
    const statements = [
      this.audit(
        now,
        target.id,
        { approved: "approved", rejected: "rejected", spam: "marked_spam", deleted: "moderator_deleted" }[input.status],
        { kind: actor.kind === "user" ? "moderator" : "system", userId: actor.userId, label: actor.label },
        target.status,
        input.status,
        reason,
        applied,
      ),
      this.statement(
        `UPDATE comment_reports SET status = 'resolved', resolved_at = ?, resolved_by = ?
         WHERE comment_id = ? AND status = 'open' AND ${applied.sql}`,
        now,
        actor.userId,
        target.id,
        ...applied.binds,
      ),
    ];
    if (target.status !== input.status) statements.push(this.moderationNotification(target, input.status, now, applied));
    if (target.parent_id !== null && input.status === "approved" && target.status !== "approved") {
      statements.push(this.replyNotification(target, now, applied));
    }
    return statements;
  }

  /** Tells the verified, still subscribed author that a moderator changed the status of the comment. */
  private moderationNotification(target: CommentRow, status: string, now: string, applied: Condition) {
    return this.statement(
      `INSERT INTO comment_notifications
         (id, subscription_id, comment_id, kind, recipient_email, recipient_email_hash, locale, payload,
          dedupe_key, available_at, created_at)
       SELECT ?, s.id, ?, 'moderation', s.email, s.email_hash, ?,
         json_object('subscriptionId', s.id, 'commentId', ?, 'articleId', ?,
           'articleSlug', (SELECT slug FROM articles WHERE id = ?), 'locale', ?, 'status', ?),
         'comment-moderation:' || (SELECT max(id) FROM comment_moderation_audit WHERE comment_id = ?), ?, ?
       FROM comment_notification_subscriptions s
       WHERE s.comment_id = ? AND s.verified_at IS NOT NULL AND s.unsubscribed_at IS NULL
         AND s.notify_on_moderation = 1 AND ${applied.sql}`,
      crypto.randomUUID(),
      target.id,
      target.locale,
      target.id,
      target.article_id,
      target.article_id,
      target.locale,
      status,
      target.id,
      now,
      now,
      target.id,
      ...applied.binds,
    );
  }

  /** Tells the parent's subscriber about a newly approved reply, unless the same person wrote both. */
  private replyNotification(target: CommentRow, now: string, applied: Condition) {
    return this.statement(
      `INSERT INTO comment_notifications
         (id, subscription_id, comment_id, kind, recipient_email, recipient_email_hash, locale, payload,
          dedupe_key, available_at, created_at)
       SELECT ?, s.id, ?, 'reply', s.email, s.email_hash, ?,
         json_object('subscriptionId', s.id, 'commentId', ?, 'parentId', ?, 'articleId', ?,
           'articleSlug', (SELECT slug FROM articles WHERE id = ?), 'locale', ?),
         'comment-reply:' || ? || ':' || s.id, ?, ?
       FROM comment_notification_subscriptions s
       JOIN comments parent ON parent.id = s.comment_id
       WHERE s.comment_id = ? AND s.verified_at IS NOT NULL AND s.unsubscribed_at IS NULL
         AND s.notify_on_replies = 1
         AND NOT COALESCE(
           (? = 'authenticated' AND parent.author_user_id = ?) OR (? = 'guest' AND parent.guest_identity_hash = ?), 0)
         AND ${applied.sql}
       ON CONFLICT (dedupe_key) DO NOTHING`,
      crypto.randomUUID(),
      target.id,
      target.locale,
      target.id,
      target.parent_id,
      target.article_id,
      target.article_id,
      target.locale,
      target.id,
      now,
      now,
      target.parent_id,
      target.author_kind,
      target.author_user_id,
      target.author_kind,
      target.guest_identity_hash,
      ...applied.binds,
    );
  }

  async listAudit(query: ModerationAuditQuery) {
    return guarded(async () => {
      const { results } = await this.statement(
        `SELECT id, comment_id, action, actor_kind, actor_label, previous_status, next_status, reason, created_at
         FROM comment_moderation_audit WHERE (? IS NULL OR id < ?) ORDER BY id DESC LIMIT ?`,
        query.beforeId || null,
        query.beforeId || null,
        query.limit + 1,
      ).all<{
        id: number;
        comment_id: string | null;
        action: string;
        actor_kind: string;
        actor_label: string | null;
        previous_status: CommentStatus | null;
        next_status: CommentStatus | null;
        reason: string | null;
        created_at: string;
      }>();
      const hasMore = results.length > query.limit;
      const rows = hasMore ? results.slice(0, query.limit) : results;
      const items = rows.map((row): ModerationAuditEvent => ({
        id: row.id,
        commentId: row.comment_id,
        action: row.action,
        actorKind: row.actor_kind,
        actorLabel: row.actor_label,
        previousStatus: row.previous_status,
        nextStatus: row.next_status,
        reason: row.reason,
        createdAt: row.created_at,
      }));
      return { items, nextCursor: hasMore ? encodeAuditCursor(rows.at(-1)?.id ?? null) : null };
    });
  }
}
