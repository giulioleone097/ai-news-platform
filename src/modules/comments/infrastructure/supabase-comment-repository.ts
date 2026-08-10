import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import * as z from "zod/v4";
import { CommentOperationError } from "../application/errors";
import type {
  CommentRepository,
  ModerationAuditQuery,
  ModerationCommentQuery,
  OwnCommentQuery,
  PublicCommentQuery,
} from "../application/comment-repository";
import {
  commentPolicy,
  type CommentActor,
  type CommentReportInput,
  type CreateCommentInput,
  type CreatedComment,
  type ModerateCommentInput,
  type ModerationAuditEvent,
  type ModerationComment,
  type ModerationReport,
  type OwnComment,
  type OwnCommentMutationInput,
  type PublicComment,
} from "../domain/comment";
import {
  createdCommentRowSchema,
  moderationAuditRowSchema,
  moderationCommentRowSchema,
  moderationReportRowSchema,
  ownCommentRowSchema,
  publicCommentRowSchema,
} from "../domain/schemas";
import {
  encodeAuditCursor,
  encodeCommentCursor,
} from "./cursor";

type SupabaseFailure = { code?: string; message?: string; details?: string };

function repositoryError(error: SupabaseFailure | null) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  if (message.includes("comment_rate_limited")) {
    return new CommentOperationError("rate_limited", "Too many requests. Try again later.", 429);
  }
  if (message.includes("comment_already_reported")) {
    return new CommentOperationError("already_reported", "This comment was already reported.", 409);
  }
  if (
    message.includes("comment_input_invalid")
    || message.includes("comment_parent_invalid")
    || message.includes("comment_actor_invalid")
    || message.includes("comment_rate_identity_invalid")
    || message.includes("comment_report_invalid")
    || message.includes("comment_moderation_invalid")
    || message.includes("comment_notification_invalid")
    || error?.code === "22023"
    || error?.code === "23514"
  ) {
    return new CommentOperationError("invalid_request", "Invalid comment request.", 400);
  }
  if (message.includes("comment_notification_token_invalid")) {
    return new CommentOperationError(
      "notification_token_invalid",
      "The notification link is invalid or expired.",
      400,
    );
  }
  if (message.includes("comment_not_found") || error?.code === "P0002") {
    return new CommentOperationError("not_found", "Comment not found.", 404);
  }
  if (
    message.includes("comment_operation_not_allowed")
    || message.includes("comment_moderator_required")
    || error?.code === "42501"
  ) {
    return new CommentOperationError(
      "operation_not_allowed",
      "This comment operation is not allowed.",
      403,
    );
  }
  return new CommentOperationError("storage_error", "Comment storage is unavailable.", 503);
}

function requireRows<T>(
  data: unknown,
  schema: z.ZodType<T>,
): T[] {
  const result = z.array(schema).safeParse(data ?? []);
  if (!result.success) {
    throw new CommentOperationError("storage_error", "Invalid comment storage response.", 503);
  }
  return result.data;
}

function publicComment(row: z.infer<typeof publicCommentRowSchema>): PublicComment {
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

function createdComment(row: z.infer<typeof createdCommentRowSchema>): CreatedComment {
  const createdAt = new Date(row.created_at).getTime();
  return {
    id: row.id,
    parentId: row.parent_id,
    body: row.body,
    displayName: row.author_display_name,
    status: row.status,
    createdAt: row.created_at,
    editUntil: new Date(createdAt + commentPolicy.editWindowSeconds * 1_000).toISOString(),
    deleteUntil: new Date(createdAt + commentPolicy.deleteWindowSeconds * 1_000).toISOString(),
    canEdit: true,
    canDelete: true,
  };
}

function ownComment(row: z.infer<typeof ownCommentRowSchema>): OwnComment {
  return {
    id: row.id,
    articleId: row.article_id,
    locale: row.locale,
    parentId: row.parent_id,
    body: row.body,
    displayName: row.author_display_name,
    status: row.status,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    replyCount: row.reply_count,
    editUntil: row.edit_until,
    deleteUntil: row.delete_until,
    canEdit: row.can_edit,
    canDelete: row.can_delete,
  };
}

function actorRpc(actor: CommentActor) {
  return {
    p_actor_kind: actor.kind,
    p_actor_user_id: actor.userId,
    p_guest_identity_hash: actor.guestHash,
    p_actor_rate_hash: actor.actorRateHash,
    p_network_rate_hash: actor.networkRateHash,
  };
}

export class SupabaseCommentRepository implements CommentRepository {
  constructor(
    private readonly readClient: SupabaseClient,
    private readonly serviceClient: SupabaseClient | null,
  ) {}

  private service() {
    if (!this.serviceClient) {
      throw new CommentOperationError(
        "configuration_unavailable",
        "Comment mutations are unavailable.",
        503,
      );
    }
    return this.serviceClient;
  }

  async listApproved(query: PublicCommentQuery) {
    const { data, error } = await this.readClient.rpc("list_approved_comments", {
      p_article_id: query.articleId,
      p_locale: query.locale,
      p_parent_id: query.parentId,
      p_cursor_created_at: query.cursor?.createdAt ?? null,
      p_cursor_id: query.cursor?.id ?? null,
      p_limit: query.limit + 1,
    });
    if (error) throw repositoryError(error);

    const rows = requireRows(data, publicCommentRowSchema);
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const last = pageRows.at(-1);
    return {
      items: pageRows.map(publicComment),
      nextCursor: hasMore && last
        ? encodeCommentCursor({ createdAt: last.created_at, id: last.id })
        : null,
    };
  }

  async listOwn(query: OwnCommentQuery) {
    const { data, error } = await this.service().rpc("list_own_comments", {
      p_article_id: query.articleId,
      p_locale: query.locale,
      p_parent_id: query.parentId,
      p_actor_kind: query.actor.kind,
      p_actor_user_id: query.actor.userId,
      p_guest_identity_hash: query.actor.guestHash,
      p_owner_guest_identity_hash: query.actor.guestOwnerHash,
      p_cursor_created_at: query.cursor?.createdAt ?? null,
      p_cursor_id: query.cursor?.id ?? null,
      p_limit: query.limit + 1,
    });
    if (error) throw repositoryError(error);

    const rows = requireRows(data, ownCommentRowSchema);
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const last = pageRows.at(-1);
    return {
      items: pageRows.map(ownComment),
      nextCursor: hasMore && last
        ? encodeCommentCursor({ createdAt: last.created_at, id: last.id })
        : null,
    };
  }

  async create(input: CreateCommentInput) {
    const { data, error } = await this.service().rpc("create_comment", {
      p_article_id: input.articleId,
      p_locale: input.locale,
      p_parent_id: input.parentId,
      p_body: input.body,
      p_author_display_name: input.displayName,
      ...actorRpc(input.actor),
      p_notification_subscription_id: input.notifications?.subscriptionId ?? null,
      p_notification_email: input.notifications?.email ?? null,
      p_notification_email_hash: input.notifications?.emailHash ?? null,
      p_notification_on_replies: input.notifications?.onReplies ?? false,
      p_notification_on_moderation: input.notifications?.onModeration ?? false,
      p_notification_token_hash: input.notifications?.verificationTokenHash ?? null,
    });
    if (error) throw repositoryError(error);
    const row = requireRows(data, createdCommentRowSchema)[0];
    if (!row) throw repositoryError(null);
    return createdComment(row);
  }

  async editOwn(input: OwnCommentMutationInput) {
    const { data, error } = await this.service().rpc("edit_own_comment", {
      p_comment_id: input.id,
      p_body: input.body,
      p_author_display_name: input.displayName,
      ...actorRpc(input.actor),
    });
    if (error) throw repositoryError(error);
    const row = requireRows(data, createdCommentRowSchema)[0];
    if (!row) throw repositoryError(null);
    return createdComment(row);
  }

  async deleteOwn(id: string, actor: CommentActor) {
    const { error } = await this.service().rpc("delete_own_comment", {
      p_comment_id: id,
      ...actorRpc(actor),
      p_owner_guest_identity_hash: actor.guestOwnerHash,
    });
    if (error) throw repositoryError(error);
  }

  async report(input: CommentReportInput) {
    const { error } = await this.service().rpc("report_comment", {
      p_comment_id: input.commentId,
      p_reason: input.reason,
      p_details: input.details,
      ...actorRpc(input.actor),
      p_owner_guest_identity_hash: input.actor.guestOwnerHash,
    });
    if (error) throw repositoryError(error);
  }

  async listModeration(query: ModerationCommentQuery) {
    let request = this.service()
      .from("comments")
      .select(
        "id,article_id,locale,parent_id,body,author_display_name,author_kind,status,created_at,updated_at,edited_at",
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(query.limit + 1);
    if (query.status) request = request.eq("status", query.status);
    if (query.locale) request = request.eq("locale", query.locale);
    if (query.cursor) {
      request = request.or(
        `created_at.lt.${query.cursor.createdAt},and(created_at.eq.${query.cursor.createdAt},id.lt.${query.cursor.id})`,
      );
    }

    const { data, error } = await request;
    if (error) throw repositoryError(error);
    const rows = requireRows(data, moderationCommentRowSchema);
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const ids = pageRows.map((row) => row.id);
    const counts = new Map<string, number>();

    if (ids.length) {
      const { data: reports, error: reportError } = await this.service()
        .from("comment_reports")
        .select("comment_id")
        .eq("status", "open")
        .in("comment_id", ids);
      if (reportError) throw repositoryError(reportError);
      for (const report of reports ?? []) {
        const commentId = String(report.comment_id);
        counts.set(commentId, (counts.get(commentId) ?? 0) + 1);
      }
    }

    const items: ModerationComment[] = pageRows.map((row) => ({
      id: row.id,
      articleId: row.article_id,
      locale: row.locale,
      parentId: row.parent_id,
      body: row.body,
      displayName: row.author_display_name,
      authorKind: row.author_kind,
      status: row.status,
      reportCount: counts.get(row.id) ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      editedAt: row.edited_at,
    }));
    const last = pageRows.at(-1);
    return {
      items,
      nextCursor: hasMore && last
        ? encodeCommentCursor({ createdAt: last.created_at, id: last.id })
        : null,
    };
  }

  async moderate(input: ModerateCommentInput) {
    const { error } = await this.service().rpc("moderate_comment", {
      p_comment_id: input.id,
      p_status: input.status,
      p_reason: input.reason,
      p_actor_kind: input.actor.kind,
      p_actor_user_id: input.actor.userId,
      p_actor_label: input.actor.label,
    });
    if (error) throw repositoryError(error);
  }

  async listReports(commentId: string) {
    const { data, error } = await this.service()
      .from("comment_reports")
      .select("id,comment_id,reason,details,status,created_at")
      .eq("comment_id", commentId)
      .order("created_at", { ascending: false });
    if (error) throw repositoryError(error);
    const rows = requireRows(data, moderationReportRowSchema);
    const reports: ModerationReport[] = rows.map((row) => ({
      id: row.id,
      commentId: row.comment_id,
      reason: row.reason,
      details: row.details,
      status: row.status,
      createdAt: row.created_at,
    }));
    return reports;
  }

  async listAudit(query: ModerationAuditQuery) {
    let request = this.service()
      .from("comment_moderation_audit")
      .select("id,comment_id,action,actor_kind,actor_label,previous_status,next_status,reason,created_at")
      .order("id", { ascending: false })
      .limit(query.limit + 1);
    if (query.beforeId) request = request.lt("id", query.beforeId);

    const { data, error } = await request;
    if (error) throw repositoryError(error);
    const rows = requireRows(data, moderationAuditRowSchema);
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const items: ModerationAuditEvent[] = pageRows.map((row) => ({
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
    return {
      items,
      nextCursor: hasMore ? encodeAuditCursor(pageRows.at(-1)?.id ?? null) : null,
    };
  }

  async verifyNotificationSubscription(subscriptionId: string, tokenHash: string) {
    const { error } = await this.service().rpc("verify_comment_notification_subscription", {
      p_subscription_id: subscriptionId,
      p_token_hash: tokenHash,
    });
    if (error) throw repositoryError(error);
  }

  async unsubscribeNotificationSubscription(subscriptionId: string, tokenHash: string) {
    const { error } = await this.service().rpc("unsubscribe_comment_notifications", {
      p_subscription_id: subscriptionId,
      p_token_hash: tokenHash,
    });
    if (error) throw repositoryError(error);
  }
}
