import { Condition, openNotificationStatuses, type CommentRow } from "./sql";
import type { D1Database, D1PreparedStatement } from "../../sites/cloudflare";

/** What every D1 comment port needs: the database and the statements that several operations repeat. */
export class D1CommentAccess {
  constructor(protected readonly database: D1Database) {}

  protected statement(sql: string, ...binds: unknown[]) {
    return this.database.prepare(sql).bind(...binds);
  }

  protected async commentById(id: string) {
    return this.statement("SELECT * FROM comments WHERE id = ?", id).first<CommentRow>();
  }

  protected audit(
    now: string,
    commentId: string,
    action: string,
    actor: { kind: string; userId: string | null; label?: string | null },
    previousStatus: string | null,
    nextStatus: string,
    reason: string | null,
    applied: Condition,
  ) {
    return this.statement(
      `INSERT INTO comment_moderation_audit
         (comment_id, action, actor_kind, actor_user_id, actor_label, previous_status, next_status, reason, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${applied.sql}`,
      commentId,
      action,
      actor.kind,
      actor.userId,
      actor.label ?? null,
      previousStatus,
      nextStatus,
      reason,
      now,
      ...applied.binds,
    );
  }

  /** Runs the batch and reports whether the statement at `index` changed a row. */
  protected async didApply(statements: D1PreparedStatement[], index: number) {
    const results = await this.database.batch(statements);
    return (results[index]?.meta.changes ?? 0) > 0;
  }

  /** Cancels notifications that no worker has started sending yet. */
  protected cancelNotifications(now: string, filter: string, filterBinds: unknown[], applied: Condition) {
    return this.statement(
      `UPDATE comment_notifications SET status = 'cancelled', processed_at = ?, locked_at = NULL, worker_id = NULL
       WHERE ${filter} AND status IN ${openNotificationStatuses} AND dispatch_started_at IS NULL AND ${applied.sql}`,
      now,
      ...filterBinds,
      ...applied.binds,
    );
  }
}
