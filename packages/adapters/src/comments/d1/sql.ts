import { CommentOperationError } from "@atlasnews/core/comments/application/errors";
import {
  commentPolicy,
  moderationTargetStatuses,
  type CommentActor,
  type CommentStatus,
  type CreatedComment,
  type ModerateCommentInput,
  type ModerationComment,
  type OwnComment,
  type PublicComment,
} from "@atlasnews/core/comments/domain/comment";
import { encodeCommentCursor } from "@atlasnews/core/comments/domain/cursor";

export type CommentRow = {
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

export type ListedRow = Pick<
  CommentRow,
  "id" | "article_id" | "locale" | "parent_id" | "body" | "author_display_name" | "status" | "created_at" | "edited_at"
> & { reply_count: number };

export const hashPattern = /^[0-9a-f]{64}$/;
export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const systemLabelPattern = /^[a-zA-Z0-9:_-]{2,80}$/;
export const openNotificationStatuses = "('pending', 'failed', 'processing')";

/** A SQL predicate with its bound values, shared by the statements of one batch that depend on the same fact. */
export class Condition {
  constructor(
    readonly sql: string,
    readonly binds: unknown[],
  ) {}
}

export const invalidRequest = () => new CommentOperationError("invalid_request", "Invalid comment request.", 400);
export const notFound = () => new CommentOperationError("not_found", "Comment not found.", 404);
export const notAllowed = () =>
  new CommentOperationError("operation_not_allowed", "This comment operation is not allowed.", 403);
export const invalidToken = () =>
  new CommentOperationError("notification_token_invalid", "The notification link is invalid or expired.", 400);

export function errorText(error: unknown): string {
  const parts: string[] = [];
  for (let current = error; current instanceof Error; current = current.cause) parts.push(current.message);
  return parts.join(" ").toLowerCase();
}

/** The constraint and trigger messages that the batches rely on, mapped like the Supabase adapter maps its SQLSTATEs. */
export function repositoryError(error: unknown) {
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

export async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw repositoryError(error);
  }
}

export const plusSeconds = (iso: string, seconds: number) => new Date(Date.parse(iso) + seconds * 1_000).toISOString();

export function validActor(actor: CommentActor) {
  return actor.kind === "authenticated"
    ? Boolean(actor.userId) && actor.guestHash === null
    : actor.userId === null && hashPattern.test(actor.guestHash);
}

export function validRateIdentity(actor: CommentActor) {
  return hashPattern.test(actor.actorRateHash) && hashPattern.test(actor.networkRateHash);
}

/** Whether the actor wrote the comment: the same user, or the same guest identity. */
export function owns(actor: CommentActor, row: Pick<CommentRow, "author_kind" | "author_user_id" | "guest_identity_hash">) {
  return (
    (actor.kind === "authenticated" && row.author_kind === "authenticated" && row.author_user_id === actor.userId)
    || (row.author_kind === "guest" && row.guest_identity_hash === actor.guestOwnerHash)
  );
}

export function normalizedText(value: string, min: number, max: number) {
  const text = value.trim();
  const length = [...text].length;
  if (length < min || length > max) throw invalidRequest();
  return text;
}

export function createdComment(
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

export function publicComment(row: ListedRow): PublicComment {
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

export function ownComment(row: ListedRow & { status: OwnComment["status"] }, now: string): OwnComment {
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
export function pageOf<Row extends { created_at: string; id: string }, Item>(
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
export const replyCountSql = `CASE WHEN c.parent_id IS NULL THEN (
    SELECT count(*) FROM comments reply WHERE reply.parent_id = c.id AND reply.status = 'approved'
  ) ELSE 0 END`;

export const listedColumns = `c.id, c.article_id, c.locale, c.parent_id, c.body, c.author_display_name, c.status,
  c.created_at, c.edited_at, ${replyCountSql} AS reply_count`;

/** Same clamp as the Postgres listing functions: 1 to 25 rows, 13 when absent. */
export const listLimit = (limit: number) => Math.min(Math.max(Number.isFinite(limit) ? Math.trunc(limit) : 13, 1), 25);

/** `(created_at, id) < cursor`, for a newest-first keyset page. */
export function cursorFilter(cursor: { createdAt: string; id: string } | null) {
  return cursor
    ? { sql: " AND (c.created_at, c.id) < (?, ?)", binds: [new Date(cursor.createdAt).toISOString(), cursor.id] }
    : { sql: "", binds: [] as string[] };
}

export const moderationSelect = `SELECT c.id, c.article_id, c.locale, c.parent_id, c.body, c.author_display_name, c.author_kind,
           c.status, c.created_at, c.updated_at, c.edited_at,
           (SELECT count(*) FROM comment_reports r WHERE r.comment_id = c.id AND r.status = 'open') AS report_count
         FROM comments c`;

export type ModerationRow = CommentRow & { report_count: number };

export const toModerationComment = (row: ModerationRow): ModerationComment => ({
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
});

/** SQL: the comment aliased `alias` is a top-level comment or a reply under an approved one. */
export const parentApproved = (alias: string) => `(${alias}.parent_id IS NULL OR EXISTS (
  SELECT 1 FROM comments parent WHERE parent.id = ${alias}.parent_id AND parent.status = 'approved'))`;

/** The checks every moderation makes on its status, reason and actor; returns the trimmed reason. */
export function assertModeration(input: Pick<ModerateCommentInput, "status" | "reason" | "actor">) {
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
  return reason;
}

/** The bucket key shared by every caller of the site-wide limits (the column holds a SHA-256 hex digest). */
export const siteRateHash = "0".repeat(64);
