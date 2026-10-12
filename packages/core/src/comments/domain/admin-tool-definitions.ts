import * as z from "zod/v4";
import { batchLimit } from "../../editorial/domain/errors";
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
const getSchema = z.object({ id: commentIdSchema });
const reportsSchema = z.object({ commentId: commentIdSchema });
const moderateFields = {
  status: z.enum(moderationTargetStatuses),
  reason: z.string().trim().min(2).max(500),
};
const moderateSchema = z.object({ id: commentIdSchema, ...moderateFields });
const moderateManySchema = z.object({ ids: z.array(commentIdSchema).min(1).max(batchLimit), ...moderateFields });
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
  admin_get_comment: {
    title: "Get a comment",
    description: "Get one persisted comment as the moderation queue shows it: its status, author kind and open report count.",
    inputSchema: getSchema,
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
  admin_moderate_comments: {
    title: "Moderate many comments",
    description:
      "Approve, reject, mark as spam, or soft-delete several persisted comments with one status and one audit reason. "
      + "A reply can only be approved under a comment that is already approved.",
    inputSchema: moderateManySchema,
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
