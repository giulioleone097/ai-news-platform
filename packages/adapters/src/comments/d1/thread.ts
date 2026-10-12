import type {
  CommentThreadRepository,
  OwnCommentQuery,
  PublicCommentQuery,
} from "@atlasnews/core/comments/application/comment-repository";
import { D1CommentAccess } from "./access";
import {
  type CommentRow,
  type ListedRow,
  hashPattern,
  emailPattern,
  Condition,
  invalidRequest,
  notFound,
  notAllowed,
  guarded,
  plusSeconds,
  validActor,
  validRateIdentity,
  owns,
  normalizedText,
  createdComment,
  publicComment,
  ownComment,
  pageOf,
  listedColumns,
  listLimit,
  cursorFilter,
  siteRateHash,
} from "./sql";
import {
  commentLocales,
  commentPolicy,
  commentReportReasons,
  type CommentActor,
  type CommentReportInput,
  type CreateCommentInput,
  type OwnComment,
  type OwnCommentMutationInput,
} from "@atlasnews/core/comments/domain/comment";

/** The reader's side of comments: the thread, posting, editing and deleting one's own, reporting. */
export class D1CommentThreadRepository extends D1CommentAccess implements CommentThreadRepository {
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
}
