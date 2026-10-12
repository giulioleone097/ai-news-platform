import * as z from "zod/v4";

import { commentAdminToolDefinitions } from "@atlasnews/core/comments/domain/admin-tool-definitions";
import {
  commentReportReasons,
  commentStatuses,
  moderationTargetStatuses,
} from "@atlasnews/core/comments/domain/comment";

import { dispatch } from "../annotations";
import { defineSpec } from "../capability";
import { contentTrustSchema, untrustedDescription } from "../untrusted";
import { batchNote, editorLocaleSchema } from "./editorial";
import { deliveryBatchOutputSchema, operationsBase, workerBase } from "./operations";
import { batchOutput } from "./shared";

// Comment moderation: the titles, input schemas and hints are owned by the comments context.
const comments = commentAdminToolDefinitions;

const moderationCommentSchema = z.object({
  id: z.string(),
  articleId: z.string(),
  locale: editorLocaleSchema,
  parentId: z.string().nullable().describe("The comment this one replies to; null for a top-level comment."),
  body: z.string(),
  displayName: z.string(),
  authorKind: z.enum(["authenticated", "guest"]),
  status: z.enum(commentStatuses),
  reportCount: z.number().int().nonnegative().describe("Open reports from readers."),
  createdAt: z.string(),
  updatedAt: z.string(),
  editedAt: z.string().nullable(),
});

const reportSchema = z.object({
  id: z.string(),
  commentId: z.string(),
  reason: z.enum(commentReportReasons),
  details: z.string().nullable(),
  status: z.enum(["open", "resolved", "dismissed"]),
  createdAt: z.string(),
});

const auditEventSchema = z.object({
  id: z.number().int(),
  commentId: z.string().nullable(),
  action: z.string(),
  actorKind: z.string(),
  actorLabel: z.string().nullable(),
  previousStatus: z.enum(commentStatuses).nullable(),
  nextStatus: z.enum(commentStatuses).nullable(),
  reason: z.string().nullable(),
  createdAt: z.string(),
});

const pageOf = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), nextCursor: z.string().nullable() });

export const adminListComments = defineSpec({
  ...operationsBase,
  name: "admin_list_comments",
  title: comments.admin_list_comments.title,
  description: comments.admin_list_comments.description + untrustedDescription,
  input: comments.admin_list_comments.inputSchema,
  output: z.object({ page: pageOf(moderationCommentSchema), contentTrust: contentTrustSchema }),
  annotations: comments.admin_list_comments.annotations,
  scopes: ["newsroom.read"],
});

export const adminGetComment = defineSpec({
  ...operationsBase,
  name: "admin_get_comment",
  title: comments.admin_get_comment.title,
  description: comments.admin_get_comment.description + untrustedDescription,
  input: comments.admin_get_comment.inputSchema,
  output: z.object({ comment: moderationCommentSchema, contentTrust: contentTrustSchema }),
  annotations: comments.admin_get_comment.annotations,
  scopes: ["newsroom.read"],
});

export const adminListCommentReports = defineSpec({
  ...operationsBase,
  name: "admin_list_comment_reports",
  title: comments.admin_list_comment_reports.title,
  description: comments.admin_list_comment_reports.description + untrustedDescription,
  input: comments.admin_list_comment_reports.inputSchema,
  output: z.object({ reports: z.object({ items: z.array(reportSchema) }), contentTrust: contentTrustSchema }),
  annotations: comments.admin_list_comment_reports.annotations,
  scopes: ["newsroom.read"],
});

export const adminModerateComment = defineSpec({
  ...operationsBase,
  name: "admin_moderate_comment",
  title: comments.admin_moderate_comment.title,
  description: comments.admin_moderate_comment.description,
  input: comments.admin_moderate_comment.inputSchema,
  output: z.object({ result: z.object({ moderatedId: z.string(), status: z.enum(moderationTargetStatuses) }) }),
  annotations: comments.admin_moderate_comment.annotations,
  scopes: ["newsroom.write"],
  confirmation: { question: ({ id, status }) => `Mark comment ${id} as ${status}?` },
});

export const adminModerateComments = defineSpec({
  ...operationsBase,
  name: "admin_moderate_comments",
  title: comments.admin_moderate_comments.title,
  description: comments.admin_moderate_comments.description + batchNote("comment ids"),
  input: comments.admin_moderate_comments.inputSchema,
  output: batchOutput(z.literal("moderated"), { id: z.string(), status: z.enum(moderationTargetStatuses) }),
  annotations: comments.admin_moderate_comments.annotations,
  scopes: ["newsroom.write"],
  confirmation: {
    question: ({ ids, status }) => `Mark ${ids.length} comment${ids.length === 1 ? "" : "s"} as ${status}?`,
  },
});

export const adminListCommentAudit = defineSpec({
  ...operationsBase,
  name: "admin_list_comment_audit",
  title: comments.admin_list_comment_audit.title,
  description: comments.admin_list_comment_audit.description,
  input: comments.admin_list_comment_audit.inputSchema,
  output: z.object({ page: pageOf(auditEventSchema) }),
  annotations: comments.admin_list_comment_audit.annotations,
  scopes: ["newsroom.read"],
});

export const adminCommentProcessNotifications = defineSpec({
  ...workerBase,
  name: "admin_comment_process_notifications",
  title: "Process comment notification outbox",
  description: "Process one leased notification batch through the configured real email provider. This sends email.",
  input: z.object({ limit: z.number().int().min(1).max(50).default(10) }),
  output: z.object({ batch: deliveryBatchOutputSchema }),
  annotations: dispatch,
  scopes: ["newsroom.publish"],
  confirmation: { question: ({ limit }) => `Send up to ${limit} queued comment notification emails now?` },
});

export const commentSpecs = [
  adminListComments, adminGetComment, adminListCommentReports, adminModerateComment, adminModerateComments,
  adminListCommentAudit, adminCommentProcessNotifications,
] as const;
