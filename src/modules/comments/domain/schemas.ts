import * as z from "zod/v4";
import {
  commentLocales,
  commentPolicy,
  commentReportReasons,
  moderationQueueStatuses,
  moderationTargetStatuses,
} from "./comment";

export const commentIdSchema = z.string().uuid();
export const commentLocaleSchema = z.enum(commentLocales);
export const commentCursorSchema = z.string().trim().min(1).max(512);
export const commentDisplayNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(commentPolicy.maxDisplayNameCharacters)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), "Display name contains control characters.");
export const commentBodySchema = z
  .string()
  .trim()
  .min(2)
  .max(commentPolicy.maxBodyCharacters)
  .refine((value) => !value.includes("\u0000"), "Comment contains an invalid character.");

export const publicCommentQuerySchema = z.object({
  articleId: commentIdSchema,
  locale: commentLocaleSchema,
  parentId: commentIdSchema.optional(),
  cursor: commentCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(commentPolicy.maxPublicPageSize).optional(),
  scope: z.enum(["public", "own"]).default("public"),
});

const notificationPreferenceSchema = z
  .object({
    email: z.email().trim().max(254),
    onReplies: z.boolean().default(true),
    onModeration: z.boolean().default(true),
  })
  .refine((value) => value.onReplies || value.onModeration, {
    message: "Select at least one notification preference.",
  });

export const createCommentRequestSchema = z.object({
  articleId: commentIdSchema,
  locale: commentLocaleSchema,
  parentId: commentIdSchema.nullish().transform((value) => value ?? null),
  body: commentBodySchema,
  displayName: commentDisplayNameSchema,
  website: z.string().max(200).default(""),
  notifications: notificationPreferenceSchema.nullish().transform((value) => value ?? null),
});

export const editCommentRequestSchema = z.object({
  body: commentBodySchema,
  displayName: commentDisplayNameSchema,
});

export const reportCommentRequestSchema = z.object({
  reason: z.enum(commentReportReasons),
  details: z.string().trim().max(500).nullish().transform((value) => value || null),
  website: z.string().max(200).default(""),
});

export const moderationQuerySchema = z.object({
  status: z.enum(moderationQueueStatuses).optional(),
  locale: commentLocaleSchema.optional(),
  cursor: commentCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(commentPolicy.maxModerationPageSize).optional(),
});

export const moderateCommentRequestSchema = z.object({
  status: z.enum(moderationTargetStatuses),
  reason: z.string().trim().min(2).max(500),
});

export const notificationTokenSchema = z.string().trim().min(80).max(256);

export const publicCommentRowSchema = z.object({
  id: commentIdSchema,
  article_id: commentIdSchema,
  locale: commentLocaleSchema,
  parent_id: commentIdSchema.nullable(),
  body: z.string(),
  author_display_name: z.string(),
  created_at: z.iso.datetime({ offset: true }),
  edited_at: z.iso.datetime({ offset: true }).nullable(),
  reply_count: z.coerce.number().int().nonnegative(),
});

export const createdCommentRowSchema = z.object({
  id: commentIdSchema,
  parent_id: commentIdSchema.nullable(),
  body: z.string(),
  author_display_name: z.string(),
  status: z.literal("pending"),
  created_at: z.iso.datetime({ offset: true }),
});

export const ownCommentRowSchema = publicCommentRowSchema.extend({
  status: z.enum(["pending", "approved", "rejected"]),
  edit_until: z.iso.datetime({ offset: true }),
  delete_until: z.iso.datetime({ offset: true }),
  can_edit: z.boolean(),
  can_delete: z.boolean(),
});

export const moderationCommentRowSchema = z.object({
  id: commentIdSchema,
  article_id: commentIdSchema,
  locale: commentLocaleSchema,
  parent_id: commentIdSchema.nullable(),
  body: z.string(),
  author_display_name: z.string(),
  author_kind: z.enum(["authenticated", "guest"]),
  status: z.enum(moderationQueueStatuses),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  edited_at: z.iso.datetime({ offset: true }).nullable(),
});

export const moderationAuditRowSchema = z.object({
  id: z.coerce.number().int().positive(),
  comment_id: commentIdSchema.nullable(),
  action: z.string(),
  actor_kind: z.string(),
  actor_label: z.string().nullable(),
  previous_status: z.enum(moderationQueueStatuses).nullable(),
  next_status: z.enum(moderationQueueStatuses).nullable(),
  reason: z.string().nullable(),
  created_at: z.iso.datetime({ offset: true }),
});

export const moderationReportRowSchema = z.object({
  id: commentIdSchema,
  comment_id: commentIdSchema,
  reason: z.enum(commentReportReasons),
  details: z.string().nullable(),
  status: z.enum(["open", "resolved", "dismissed"]),
  created_at: z.iso.datetime({ offset: true }),
});
