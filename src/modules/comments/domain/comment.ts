export const commentLocales = ["en", "it"] as const;
export const commentStatuses = [
  "pending",
  "approved",
  "rejected",
  "spam",
  "deleted",
] as const;
export const commentReportReasons = [
  "spam",
  "harassment",
  "hate",
  "misinformation",
  "privacy",
  "other",
] as const;
export const moderationQueueStatuses = ["pending", "approved", "rejected", "spam", "deleted"] as const;
export const moderationTargetStatuses = ["approved", "rejected", "spam", "deleted"] as const;
export const commentNotificationKinds = ["verification", "reply", "moderation"] as const;

export type CommentLocale = (typeof commentLocales)[number];
export type CommentStatus = (typeof commentStatuses)[number];
export type CommentReportReason = (typeof commentReportReasons)[number];
export type ModerationTargetStatus = (typeof moderationTargetStatuses)[number];
export type CommentNotificationKind = (typeof commentNotificationKinds)[number];

export type CommentCursor = {
  createdAt: string;
  id: string;
};

export const commentPolicy = {
  maxDepth: 1,
  maxBodyCharacters: 4_000,
  maxDisplayNameCharacters: 60,
  editWindowSeconds: 15 * 60,
  deleteWindowSeconds: 24 * 60 * 60,
  publicPageSize: 12,
  maxPublicPageSize: 24,
  moderationPageSize: 30,
  maxModerationPageSize: 60,
  notificationVerificationSeconds: 24 * 60 * 60,
} as const;

export type PublicComment = {
  id: string;
  articleId: string;
  locale: CommentLocale;
  parentId: string | null;
  body: string;
  displayName: string;
  createdAt: string;
  editedAt: string | null;
  replyCount: number;
};

export type PublicCommentPage = {
  items: PublicComment[];
  nextCursor: string | null;
};

export type OwnComment = PublicComment & {
  status: "pending" | "approved" | "rejected";
  editUntil: string;
  deleteUntil: string;
  canEdit: boolean;
  canDelete: boolean;
};

export type OwnCommentPage = {
  items: OwnComment[];
  nextCursor: string | null;
};

export type CommentNotificationPreference = {
  email: string;
  emailHash: string;
  onReplies: boolean;
  onModeration: boolean;
  subscriptionId: string;
  verificationTokenHash: string;
};

export type CommentActor =
  | {
      kind: "authenticated";
      userId: string;
      guestHash: null;
      guestOwnerHash: string | null;
      actorRateHash: string;
      networkRateHash: string;
    }
  | {
      kind: "guest";
      userId: null;
      guestHash: string;
      guestOwnerHash: string;
      actorRateHash: string;
      networkRateHash: string;
    };

export type CreateCommentInput = {
  articleId: string;
  locale: CommentLocale;
  parentId: string | null;
  body: string;
  displayName: string;
  actor: CommentActor;
  notifications: CommentNotificationPreference | null;
};

export type OwnCommentMutationInput = {
  id: string;
  body: string;
  displayName: string;
  actor: CommentActor;
};

export type CreatedComment = {
  id: string;
  parentId: string | null;
  body: string;
  displayName: string;
  status: "pending";
  createdAt: string;
  editUntil: string;
  deleteUntil: string;
  canEdit: boolean;
  canDelete: boolean;
};

export type CommentReportInput = {
  commentId: string;
  reason: CommentReportReason;
  details: string | null;
  actor: CommentActor;
};

export type ModerationActor =
  | { kind: "user"; userId: string; label: null }
  | { kind: "system"; userId: null; label: string };

export type ModerateCommentInput = {
  id: string;
  status: ModerationTargetStatus;
  reason: string;
  actor: ModerationActor;
};

export type ModerationComment = {
  id: string;
  articleId: string;
  locale: CommentLocale;
  parentId: string | null;
  body: string;
  displayName: string;
  authorKind: "authenticated" | "guest";
  status: CommentStatus;
  reportCount: number;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
};

export type ModerationCommentPage = {
  items: ModerationComment[];
  nextCursor: string | null;
};

export type ModerationAuditEvent = {
  id: number;
  commentId: string | null;
  action: string;
  actorKind: string;
  actorLabel: string | null;
  previousStatus: CommentStatus | null;
  nextStatus: CommentStatus | null;
  reason: string | null;
  createdAt: string;
};

export type ModerationAuditPage = {
  items: ModerationAuditEvent[];
  nextCursor: string | null;
};

export type ModerationReport = {
  id: string;
  commentId: string;
  reason: CommentReportReason;
  details: string | null;
  status: "open" | "resolved" | "dismissed";
  createdAt: string;
};

export type CommentCapability = {
  readable: boolean;
  mutations: boolean;
  guestIdentity: boolean;
  moderation: boolean;
  notifications: boolean;
  reason: "supabase_unavailable" | "mutation_configuration_missing" | null;
  policy: typeof commentPolicy;
};

export type CommentNotificationEvent = {
  id: string;
  subscriptionId: string;
  commentId: string | null;
  kind: CommentNotificationKind;
  recipientEmail: string;
  locale: CommentLocale;
  payload: Record<string, unknown>;
  attempts: number;
};
