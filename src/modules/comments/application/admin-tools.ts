import * as z from "zod/v4";
import {
  commentLocales,
  commentPolicy,
  moderationQueueStatuses,
  moderationTargetStatuses,
  type ModerationActor,
} from "../domain/comment";
import { commentIdSchema, commentCursorSchema } from "../domain/schemas";
import { decodeAuditCursor, decodeCommentCursor } from "../infrastructure/cursor";
import { CommentOperationError } from "./errors";
import type { CommentService } from "./comment-service";

const listSchema = z.object({
  status: z.enum(moderationQueueStatuses).optional(),
  locale: z.enum(commentLocales).optional(),
  cursor: commentCursorSchema.optional(),
  limit: z.number().int().min(1).max(commentPolicy.maxModerationPageSize).default(30),
});
const reportsSchema = z.object({ commentId: commentIdSchema });
const moderateSchema = z.object({
  id: commentIdSchema,
  status: z.enum(moderationTargetStatuses),
  reason: z.string().trim().min(2).max(500),
});
const auditSchema = z.object({
  cursor: commentCursorSchema.optional(),
  limit: z.number().int().min(1).max(commentPolicy.maxModerationPageSize).default(30),
});

export const commentAdminToolDefinitions = {
  admin_list_comments: {
    title: "List comment moderation queue",
    description: "List persisted comments by moderation status with report counts and keyset pagination.",
    inputSchema: listSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  admin_list_comment_reports: {
    title: "List reports for a comment",
    description: "List private moderation reports without exposing reporter identity.",
    inputSchema: reportsSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  admin_moderate_comment: {
    title: "Moderate a comment",
    description: "Approve, reject, mark as spam, or soft-delete one persisted comment with an audit reason.",
    inputSchema: moderateSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  admin_list_comment_audit: {
    title: "List comment moderation audit",
    description: "List append-only comment moderation events with keyset pagination.",
    inputSchema: auditSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
} as const;

export function createCommentAdminToolHandlers(
  service: CommentService,
  actor: ModerationActor,
) {
  return {
    async admin_list_comments(input: unknown) {
      const parsed = listSchema.parse(input);
      const cursor = parsed.cursor ? decodeCommentCursor(parsed.cursor) : null;
      if (parsed.cursor && !cursor) {
        throw new CommentOperationError("invalid_cursor", "Invalid comment cursor.", 400);
      }
      return service.listModeration({
        status: parsed.status ?? null,
        locale: parsed.locale ?? null,
        cursor,
        limit: parsed.limit,
      });
    },
    async admin_list_comment_reports(input: unknown) {
      const parsed = reportsSchema.parse(input);
      return { items: await service.listReports(parsed.commentId) };
    },
    async admin_moderate_comment(input: unknown) {
      const parsed = moderateSchema.parse(input);
      await service.moderate({ ...parsed, actor });
      return { moderatedId: parsed.id, status: parsed.status };
    },
    async admin_list_comment_audit(input: unknown) {
      const parsed = auditSchema.parse(input);
      const beforeId = parsed.cursor ? decodeAuditCursor(parsed.cursor) : null;
      if (parsed.cursor && !beforeId) {
        throw new CommentOperationError("invalid_cursor", "Invalid audit cursor.", 400);
      }
      return service.listAudit({ beforeId, limit: parsed.limit });
    },
  };
}
