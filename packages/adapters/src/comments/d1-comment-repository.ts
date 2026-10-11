import { CommentOperationError } from "@atlasnews/core/comments/application/errors";
import type {
  CommentRepository,
  ModerationAuditQuery,
  ModerationCommentQuery,
  OwnCommentQuery,
  PublicCommentQuery,
} from "@atlasnews/core/comments/application/comment-repository";
import {
  commentLocales,
  commentPolicy,
  commentReportReasons,
  moderationTargetStatuses,
  type CommentActor,
  type CommentReportInput,
  type CommentStatus,
  type CreateCommentInput,
  type CreatedComment,
  type ModerateCommentInput,
  type ModerationAuditEvent,
  type ModerationComment,
  type ModerationReport,
  type OwnComment,
  type OwnCommentMutationInput,
  type PublicComment,
} from "@atlasnews/core/comments/domain/comment";
import { encodeAuditCursor, encodeCommentCursor } from "@atlasnews/core/comments/domain/cursor";
import type { D1Database, D1PreparedStatement } from "../sites/cloudflare";

/**
 * Comments on D1. It carries the rules that the Postgres functions of `20260810110000_comments.sql`
 * enforce: input and actor validation, the edit and delete windows, the reply depth, the rate limits, the
 * report dedupe, the moderation audit and the notification outbox rows. Every multi-statement write is one
 * `batch()`; a statement that cannot apply (a lost race) is skipped with its dependents, and a rate-limit
 * hit over its limit aborts the whole batch through the `comment_rate_limited` CHECK.
 */

type CommentRow = {
  id: string;
  article_id: string;
  locale: "en" | "it";
  parent_id: string | null;
  body: string;
  author_display_name: string;
  author_kind: "authenticated" | "guest";
  author_user_id: string | null;
  guest_identity_hash: string | null;
  status: CommentStatus;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
};

type ListedRow = Pick<
  CommentRow,
  "id" | "article_id" | "locale" | "parent_id" | "body" | "author_display_name" | "status" | "created_at" | "edited_at"
> & { reply_count: number };

const hashPattern = /^[0-9a-f]{64}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const systemLabelPattern = /^[a-zA-Z0-9:_-]{2,80}$/;
const openNotificationStatuses = "('pending', 'failed', 'processing')";

/** A SQL predicate with its bound values, shared by the statements of one batch that depend on the same fact. */
class Condition {
  constructor(
    readonly sql: string,
    readonly binds: unknown[],
  ) {}
}

const invalidRequest = () => new CommentOperationError("invalid_request", "Invalid comment request.", 400);
const notFound = () => new CommentOperationError("not_found", "Comment not found.", 404);
const notAllowed = () =>
  new CommentOperationError("operation_not_allowed", "This comment operation is not allowed.", 403);
const invalidToken = () =>
  new CommentOperationError("notification_token_invalid", "The notification link is invalid or expired.", 400);

function errorText(error: unknown): string {
  const parts: string[] = [];
  for (let current = error; current instanceof Error; current = current.cause) parts.push(current.message);
  return parts.join(" ").toLowerCase();
}

/** The constraint and trigger messages that the batches rely on, mapped like the Supabase adapter maps its SQLSTATEs. */
function repositoryError(error: unknown) {
  if (error instanceof CommentOperationError) return error;
  const message = errorText(error);
  if (message.includes("comment_rate_limited")) {
    return new CommentOperationError("rate_limited", "Too many requests. Try again later.", 429);
  }
  if (message.includes("unique constraint failed") && message.includes("comment_reports")) {
    return new CommentOperationError("already_reported", "This comment was already reported.", 409);
  }
  if (message.includes("comment_parent_invalid") || message.includes("check constraint failed")) {
    return invalidRequest();
  }
  if (message.includes("foreign key constraint failed") || message.includes("comment_article_invalid")) return notFound();
  return new CommentOperationError("storage_error", "Comment storage is unavailable.", 503);
}

async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw repositoryError(error);
  }
}

const plusSeconds = (iso: string, seconds: number) => new Date(Date.parse(iso) + seconds * 1_000).toISOString();

function validActor(actor: CommentActor) {
  return actor.kind === "authenticated"
    ? Boolean(actor.userId) && actor.guestHash === null
    : actor.userId === null && hashPattern.test(actor.guestHash);
}

function validRateIdentity(actor: CommentActor) {
  return hashPattern.test(actor.actorRateHash) && hashPattern.test(actor.networkRateHash);
}

/** Whether the actor wrote the comment: the same user, or the same guest identity. */
function owns(actor: CommentActor, row: Pick<CommentRow, "author_kind" | "author_user_id" | "guest_identity_hash">) {
  return (
    (actor.kind === "authenticated" && row.author_kind === "authenticated" && row.author_user_id === actor.userId)
    || (row.author_kind === "guest" && row.guest_identity_hash === actor.guestOwnerHash)
  );
}

function normalizedText(value: string, min: number, max: number) {
  const text = value.trim();
  const length = [...text].length;
  if (length < min || length > max) throw invalidRequest();
  return text;
}

function createdComment(
  row: Pick<CommentRow, "id" | "parent_id" | "body" | "author_display_name" | "created_at">,
): CreatedComment {
  return {
    id: row.id,
    parentId: row.parent_id,
    body: row.body,
    displayName: row.author_display_name,
    status: "pending",
    createdAt: row.created_at,
    editUntil: plusSeconds(row.created_at, commentPolicy.editWindowSeconds),
    deleteUntil: plusSeconds(row.created_at, commentPolicy.deleteWindowSeconds),
    canEdit: true,
    canDelete: true,
  };
}

function publicComment(row: ListedRow): PublicComment {
  return {
    id: row.id,
    articleId: row.article_id,
    locale: row.locale,
    parentId: row.parent_id,
    body: row.body,
    displayName: row.author_display_name,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    replyCount: row.reply_count,
  };
}

function ownComment(row: ListedRow & { status: OwnComment["status"] }, now: string): OwnComment {
  const editUntil = plusSeconds(row.created_at, commentPolicy.editWindowSeconds);
  const deleteUntil = plusSeconds(row.created_at, commentPolicy.deleteWindowSeconds);
  const live = row.status === "pending" || row.status === "approved";
  return {
    ...publicComment(row),
    status: row.status,
    editUntil,
    deleteUntil,
    canEdit: live && now <= editUntil,
    canDelete: live && now <= deleteUntil,
  };
}

/** Rows fetched with `limit + 1`: the extra row only says that another page exists. */
function pageOf<Row extends { created_at: string; id: string }, Item>(
  rows: Row[],
  limit: number,
  map: (row: Row) => Item,
) {
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows.at(-1);
  return {
    items: pageRows.map(map),
    nextCursor: hasMore && last ? encodeCommentCursor({ createdAt: last.created_at, id: last.id }) : null,
  };
}

/** The `reply_count` column of the listings: approved replies of a root comment. */
const replyCountSql = `CASE WHEN c.parent_id IS NULL THEN (
    SELECT count(*) FROM comments reply WHERE reply.parent_id = c.id AND reply.status = 'approved'
  ) ELSE 0 END`;

const listedColumns = `c.id, c.article_id, c.locale, c.parent_id, c.body, c.author_display_name, c.status,
  c.created_at, c.edited_at, ${replyCountSql} AS reply_count`;

/** Same clamp as the Postgres listing functions: 1 to 25 rows, 13 when absent. */
const listLimit = (limit: number) => Math.min(Math.max(Number.isFinite(limit) ? Math.trunc(limit) : 13, 1), 25);

/** `(created_at, id) < cursor`, for a newest-first keyset page. */
function cursorFilter(cursor: { createdAt: string; id: string } | null) {
  return cursor
    ? { sql: " AND (c.created_at, c.id) < (?, ?)", binds: [new Date(cursor.createdAt).toISOString(), cursor.id] }
    : { sql: "", binds: [] as string[] };
}

/** The bucket key shared by every caller of the site-wide limits (the column holds a SHA-256 hex digest). */
const siteRateHash = "0".repeat(64);

export class D1CommentRepository implements CommentRepository {
  constructor(private readonly database: D1Database) {}

  private statement(sql: string, ...binds: unknown[]) {
    return this.database.prepare(sql).bind(...binds);
  }

  private async commentById(id: string) {
    return this.statement("SELECT * FROM comments WHERE id = ?", id).first<CommentRow>();
  }

  /**
   * The cleanup of old buckets and the counters of an operation; a counter over its limit aborts the batch. The
   * optional site-wide counter bounds what anonymous clients can write when no trusted network header keys them.
   */
  private rateLimits(
    now: string,
    actor: CommentActor,
    action: string,
    limits: {
      actor: [limit: number, windowSeconds: number];
      network: [limit: number, windowSeconds: number];
      site?: [limit: number, windowSeconds: number];
    },
  ) {
    const take = (hash: string, name: string, [limit, windowSeconds]: [number, number]) => {
      const windowMs = windowSeconds * 1_000;
      const start = Math.floor(Date.parse(now) / windowMs) * windowMs;
      return this.statement(
        `INSERT INTO comment_rate_limits (identity_hash, action, window_started_at, hits, max_hits, expires_at)
         VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT (identity_hash, action, window_started_at)
         DO UPDATE SET hits = hits + 1, max_hits = excluded.max_hits`,
        hash,
        name,
        new Date(start).toISOString(),
        limit,
        new Date(start + windowMs).toISOString(),
      );
    };
    return [
      this.statement(
        `DELETE FROM comment_rate_limits WHERE rowid IN (
           SELECT rowid FROM comment_rate_limits WHERE expires_at < ? ORDER BY expires_at LIMIT 50)`,
        plusSeconds(now, -24 * 60 * 60),
      ),
      take(actor.actorRateHash, `${action}_actor`, limits.actor),
      take(actor.networkRateHash, `${action}_network`, limits.network),
      ...(limits.site ? [take(siteRateHash, `${action}_site`, limits.site)] : []),
    ];
  }

  private audit(
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
  private async didApply(statements: D1PreparedStatement[], index: number) {
    const results = await this.database.batch(statements);
    return (results[index]?.meta.changes ?? 0) > 0;
  }

  async listApproved(query: PublicCommentQuery) {
    return guarded(async () => {
      const cursor = cursorFilter(query.cursor);
      const { results } = await this.statement(
        `SELECT ${listedColumns} FROM comments c
         WHERE c.article_id = ? AND c.locale = ? AND c.status = 'approved' AND c.parent_id IS ?
           AND (c.parent_id IS NULL OR EXISTS (
             SELECT 1 FROM comments parent WHERE parent.id = c.parent_id AND parent.status = 'approved'))
           AND EXISTS (
             SELECT 1 FROM articles a WHERE a.id = c.article_id AND a.locale = c.locale AND a.status = 'published')
           ${cursor.sql}
         ORDER BY c.created_at DESC, c.id DESC LIMIT ?`,
        query.articleId,
        query.locale,
        query.parentId,
        ...cursor.binds,
        listLimit(query.limit + 1),
      ).all<ListedRow>();
      return pageOf(results, query.limit, publicComment);
    });
  }

  async listOwn(query: OwnCommentQuery) {
    const { actor } = query;
    const ownerHashValid = actor.guestOwnerHash === null
      ? actor.kind === "authenticated"
      : hashPattern.test(actor.guestOwnerHash) && (actor.kind === "authenticated" || actor.guestOwnerHash === actor.guestHash);
    if (!commentLocales.includes(query.locale) || !validActor(actor) || !ownerHashValid) throw invalidRequest();

    return guarded(async () => {
      const cursor = cursorFilter(query.cursor);
      const { results } = await this.statement(
        `SELECT ${listedColumns} FROM comments c
         WHERE c.article_id = ? AND c.locale = ? AND c.parent_id IS ? AND c.status IN ('pending', 'approved', 'rejected')
           AND ((? = 'authenticated' AND c.author_kind = 'authenticated' AND c.author_user_id = ?)
             OR (c.author_kind = 'guest' AND c.guest_identity_hash = ?))
           ${cursor.sql}
         ORDER BY c.created_at DESC, c.id DESC LIMIT ?`,
        query.articleId,
        query.locale,
        query.parentId,
        actor.kind,
        actor.userId,
        actor.guestOwnerHash,
        ...cursor.binds,
        listLimit(query.limit + 1),
      ).all<ListedRow & { status: OwnComment["status"] }>();
      const now = new Date().toISOString();
      return pageOf(results, query.limit, (row) => ownComment(row, now));
    });
  }

  async create(input: CreateCommentInput) {
    const body = normalizedText(input.body, 2, commentPolicy.maxBodyCharacters);
    const displayName = normalizedText(input.displayName, 2, commentPolicy.maxDisplayNameCharacters);
    if (!commentLocales.includes(input.locale)) throw invalidRequest();
    if (!validActor(input.actor)) throw invalidRequest();
    if (!validRateIdentity(input.actor)) throw invalidRequest();
    const subscription = input.notifications ? this.subscriptionDraft(input) : null;

    return guarded(async () => {
      const now = new Date().toISOString();
      const publishedArticle = {
        sql: `EXISTS (SELECT 1 FROM articles a WHERE a.id = ? AND a.locale = ? AND a.status = 'published' AND a.published_at <= ?)`,
        binds: [input.articleId, input.locale, now],
      };
      const approvedRoot = {
        sql: `(? IS NULL OR EXISTS (
          SELECT 1 FROM comments parent
          WHERE parent.id = ? AND parent.article_id = ? AND parent.locale = ? AND parent.parent_id IS NULL AND parent.status = 'approved'))`,
        binds: [input.parentId, input.parentId, input.articleId, input.locale],
      };
      const article = await this.statement(
        `SELECT 1 AS found WHERE ${publishedArticle.sql}`,
        ...publishedArticle.binds,
      ).first();
      if (!article) throw notFound();
      const parent = await this.statement(`SELECT 1 AS found WHERE ${approvedRoot.sql}`, ...approvedRoot.binds).first();
      if (!parent) throw invalidRequest();

      const id = crypto.randomUUID();
      const { actor } = input;
      const statements = [
        ...this.rateLimits(now, actor, "create", { actor: [5, 600], network: [30, 600], site: [300, 600] }),
        this.statement(
          `INSERT INTO comments
             (id, article_id, locale, parent_id, body, author_display_name, author_kind, author_user_id,
              guest_identity_hash, status, created_at, updated_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?
           WHERE ${publishedArticle.sql} AND ${approvedRoot.sql}`,
          id,
          input.articleId,
          input.locale,
          input.parentId,
          body,
          displayName,
          actor.kind,
          actor.userId,
          actor.guestHash,
          now,
          now,
          ...publishedArticle.binds,
          ...approvedRoot.binds,
        ),
        this.audit(now, id, "created", actor, null, "pending", null, new Condition("1 = 1", [])),
      ];
      if (subscription) statements.push(...this.subscriptionStatements(input, subscription, id, now));

      // A lost race (the article or parent changed after the checks above) leaves the comment row out;
      // the audit insert then fails its foreign key and the batch, rate-limit hits included, rolls back.
      await this.database.batch(statements);
      return createdComment({ id, parent_id: input.parentId, body, author_display_name: displayName, created_at: now });
    });
  }

  /** The normalized notification preference of a new comment, validated like the Postgres function did. */
  private subscriptionDraft(input: CreateCommentInput) {
    const preference = input.notifications!;
    const email = preference.email.trim().toLowerCase();
    const onReplies = input.parentId === null ? preference.onReplies : false;
    if (
      email.length > 254
      || !emailPattern.test(email)
      || !hashPattern.test(preference.emailHash)
      || !hashPattern.test(preference.verificationTokenHash)
      || !(preference.onReplies || preference.onModeration)
      || !(onReplies || preference.onModeration)
    ) {
      throw invalidRequest();
    }
    return { email, onReplies };
  }

  private subscriptionStatements(
    input: CreateCommentInput,
    draft: { email: string; onReplies: boolean },
    commentId: string,
    now: string,
  ) {
    const preference = input.notifications!;
    return [
      this.statement(
        `INSERT INTO comment_notification_subscriptions
           (id, comment_id, email, email_hash, verification_token_hash, verification_expires_at,
            notify_on_replies, notify_on_moderation, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        preference.subscriptionId,
        commentId,
        draft.email,
        preference.emailHash,
        preference.verificationTokenHash,
        plusSeconds(now, commentPolicy.notificationVerificationSeconds),
        draft.onReplies ? 1 : 0,
        preference.onModeration ? 1 : 0,
        now,
        now,
      ),
      this.statement(
        `INSERT INTO comment_notifications
           (id, subscription_id, comment_id, kind, recipient_email, recipient_email_hash, locale, payload,
            dedupe_key, available_at, created_at)
         VALUES (?, ?, ?, 'verification', ?, ?, ?,
           json_object('subscriptionId', ?, 'commentId', ?, 'articleSlug', (SELECT slug FROM articles WHERE id = ?), 'locale', ?),
           ?, ?, ?)`,
        crypto.randomUUID(),
        preference.subscriptionId,
        commentId,
        draft.email,
        preference.emailHash,
        input.locale,
        preference.subscriptionId,
        commentId,
        input.articleId,
        input.locale,
        `comment-verification:${preference.subscriptionId}`,
        now,
        now,
      ),
    ];
  }

  /** Loads a comment the actor may change within `windowSeconds` of its creation, or throws like the Postgres functions. */
  private async ownedLiveComment(id: string, actor: CommentActor, windowSeconds: number, now: string) {
    const current = await this.commentById(id);
    if (!current) throw notFound();
    if (
      !owns(actor, current)
      || !(current.status === "pending" || current.status === "approved")
      || now > plusSeconds(current.created_at, windowSeconds)
    ) {
      throw notAllowed();
    }
    return current;
  }

  async editOwn(input: OwnCommentMutationInput) {
    const body = normalizedText(input.body, 2, commentPolicy.maxBodyCharacters);
    const displayName = normalizedText(input.displayName, 2, commentPolicy.maxDisplayNameCharacters);

    return guarded(async () => {
      const now = new Date().toISOString();
      const current = await this.ownedLiveComment(input.id, input.actor, commentPolicy.editWindowSeconds, now);
      const rateLimits = this.rateLimits(now, input.actor, "edit", { actor: [10, 3600], network: [40, 3600] });
      const applied = new Condition(
        "EXISTS (SELECT 1 FROM comments WHERE id = ? AND updated_at = ? AND status = 'pending')",
        [current.id, now],
      );
      const statements = [
        ...rateLimits,
        this.statement(
          `UPDATE comments SET body = ?, author_display_name = ?, status = 'pending', edited_at = ?, updated_at = ?
           WHERE id = ? AND status = ? AND created_at >= ?`,
          body,
          displayName,
          now,
          now,
          current.id,
          current.status,
          plusSeconds(now, -commentPolicy.editWindowSeconds),
        ),
        this.audit(now, current.id, "edited", input.actor, current.status, "pending", null, applied),
      ];
      if (!(await this.didApply(statements, rateLimits.length))) throw notAllowed();
      return createdComment({ ...current, body, author_display_name: displayName });
    });
  }

  async deleteOwn(id: string, actor: CommentActor) {
    await guarded(async () => {
      const now = new Date().toISOString();
      const current = await this.ownedLiveComment(id, actor, commentPolicy.deleteWindowSeconds, now);
      const rateLimits = this.rateLimits(now, actor, "delete", { actor: [10, 3600], network: [40, 3600] });
      const applied = new Condition(
        "EXISTS (SELECT 1 FROM comments WHERE id = ? AND updated_at = ? AND status = 'deleted')",
        [id, now],
      );
      const statements = [
        ...rateLimits,
        this.statement(
          `UPDATE comments SET body = '[deleted]', author_display_name = 'Deleted user', status = 'deleted',
             deleted_at = ?, updated_at = ?
           WHERE id = ? AND status = ? AND created_at >= ?`,
          now,
          now,
          id,
          current.status,
          plusSeconds(now, -commentPolicy.deleteWindowSeconds),
        ),
        this.statement(
          `UPDATE comment_notification_subscriptions SET unsubscribed_at = ?, updated_at = ?
           WHERE comment_id = ? AND unsubscribed_at IS NULL AND ${applied.sql}`,
          now,
          now,
          id,
          ...applied.binds,
        ),
        this.cancelNotifications(now, "subscription_id IN (SELECT id FROM comment_notification_subscriptions WHERE comment_id = ?)", [id], applied),
        this.audit(now, id, "owner_deleted", actor, current.status, "deleted", null, applied),
      ];
      if (!(await this.didApply(statements, rateLimits.length))) throw notAllowed();
    });
  }

  /** Cancels notifications that no worker has started sending yet. */
  private cancelNotifications(now: string, filter: string, filterBinds: unknown[], applied: Condition) {
    return this.statement(
      `UPDATE comment_notifications SET status = 'cancelled', processed_at = ?, locked_at = NULL, worker_id = NULL
       WHERE ${filter} AND status IN ${openNotificationStatuses} AND dispatch_started_at IS NULL AND ${applied.sql}`,
      now,
      ...filterBinds,
      ...applied.binds,
    );
  }

  async report(input: CommentReportInput) {
    const details = input.details?.trim() ?? "";
    if (!commentReportReasons.includes(input.reason) || [...details].length > 500) throw invalidRequest();

    await guarded(async () => {
      const target = await this.statement("SELECT * FROM comments WHERE id = ? AND status = 'approved'", input.commentId)
        .first<CommentRow>();
      if (!target) throw notFound();
      const { actor } = input;
      if (owns(actor, target)) throw notAllowed();

      const now = new Date().toISOString();
      const reportId = crypto.randomUUID();
      const rateLimits = this.rateLimits(now, actor, "report", { actor: [10, 3600], network: [50, 3600], site: [500, 3600] });
      const statements = [
        ...rateLimits,
        this.statement(
          `INSERT INTO comment_reports
             (id, comment_id, reporter_kind, reporter_user_id, reporter_guest_identity_hash, reason, details, created_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM comments WHERE id = ? AND status = 'approved')`,
          reportId,
          input.commentId,
          actor.kind,
          actor.userId,
          actor.guestHash,
          input.reason,
          details || null,
          now,
          input.commentId,
        ),
        this.audit(
          now,
          input.commentId,
          "reported",
          actor,
          "approved",
          "approved",
          input.reason,
          new Condition("EXISTS (SELECT 1 FROM comment_reports WHERE id = ?)", [reportId]),
        ),
      ];
      // A duplicate report breaks the unique index and rolls the batch back, rate-limit hits included.
      if (!(await this.didApply(statements, rateLimits.length))) throw notFound();
    });
  }

  async listModeration(query: ModerationCommentQuery) {
    return guarded(async () => {
      const cursor = cursorFilter(query.cursor);
      const { results } = await this.statement(
        `SELECT c.id, c.article_id, c.locale, c.parent_id, c.body, c.author_display_name, c.author_kind, c.status,
           c.created_at, c.updated_at, c.edited_at,
           (SELECT count(*) FROM comment_reports r WHERE r.comment_id = c.id AND r.status = 'open') AS report_count
         FROM comments c
         WHERE (? IS NULL OR c.status = ?) AND (? IS NULL OR c.locale = ?) ${cursor.sql}
         ORDER BY c.created_at DESC, c.id DESC LIMIT ?`,
        query.status,
        query.status,
        query.locale,
        query.locale,
        ...cursor.binds,
        query.limit + 1,
      ).all<CommentRow & { report_count: number }>();
      return pageOf(results, query.limit, (row): ModerationComment => ({
        id: row.id,
        articleId: row.article_id,
        locale: row.locale,
        parentId: row.parent_id,
        body: row.body,
        displayName: row.author_display_name,
        authorKind: row.author_kind,
        status: row.status,
        reportCount: row.report_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        editedAt: row.edited_at,
      }));
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
    const reason = input.reason.trim();
    if (!moderationTargetStatuses.includes(input.status) || [...reason].length < 2 || [...reason].length > 500) {
      throw new CommentOperationError("invalid_request", "Invalid comment request.", 400);
    }
    // The delivery layer decides who is a moderator (as it does for the service-role Supabase client);
    // here only the shape of the actor is checked.
    const { actor } = input;
    const actorValid = actor.kind === "user"
      ? Boolean(actor.userId)
      : actor.kind === "system" && actor.userId === null && systemLabelPattern.test(actor.label.trim());
    if (!actorValid) throw notAllowed();

    await guarded(async () => {
      const target = await this.commentById(input.id);
      if (!target) throw notFound();
      if (target.status === "deleted") throw notAllowed();
      const parentApproved = `(c.parent_id IS NULL OR EXISTS (
        SELECT 1 FROM comments parent WHERE parent.id = c.parent_id AND parent.status = 'approved'))`;
      if (input.status === "approved" && target.parent_id !== null) {
        const parent = await this.commentById(target.parent_id);
        if (parent?.status !== "approved") throw notAllowed();
      }

      const now = new Date().toISOString();
      const deleting = input.status === "deleted";
      const applied = new Condition(
        "EXISTS (SELECT 1 FROM comments WHERE id = ? AND updated_at = ? AND status = ?)",
        [target.id, now, input.status],
      );
      const statements = [
        this.statement(
          `UPDATE comments AS c SET status = ?,
             body = CASE WHEN ? THEN '[deleted]' ELSE body END,
             author_display_name = CASE WHEN ? THEN 'Deleted user' ELSE author_display_name END,
             deleted_at = CASE WHEN ? THEN ? ELSE NULL END,
             updated_at = ?
           WHERE c.id = ? AND c.status = ? AND (? <> 'approved' OR ${parentApproved})`,
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
      if (!(await this.didApply(statements, 0))) throw notAllowed();
    });
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
