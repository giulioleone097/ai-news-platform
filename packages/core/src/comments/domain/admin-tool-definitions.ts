import * as z from "zod/v4";
import {
  commentLocales,
  commentPolicy,
  moderationQueueStatuses,
  moderationTargetStatuses,
} from "./comment";
import { commentIdSchema, commentCursorSchema } from "./schemas";

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
