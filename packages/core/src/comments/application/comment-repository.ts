import type {
  CommentLocale,
  CommentCursor,
  CommentReportInput,
  CommentStatus,
  CreateCommentInput,
  CreatedComment,
  ModerateCommentInput,
  ModerateCommentsInput,
  ModerationAuditPage,
  ModerationComment,
  ModerationCommentPage,
  ModerationReport,
  OwnCommentPage,
  OwnCommentMutationInput,
  PublicCommentPage,
} from "../domain/comment";

export type PublicCommentQuery = {
  articleId: string;
  locale: CommentLocale;
  parentId: string | null;
  cursor: CommentCursor | null;
  limit: number;
};

export type OwnCommentQuery = PublicCommentQuery & {
  actor: OwnCommentMutationInput["actor"];
};

export type ModerationCommentQuery = {
  status: CommentStatus | null;
  locale: CommentLocale | null;
  cursor: CommentCursor | null;
  limit: number;
};

export type ModerationAuditQuery = {
  beforeId: number | null;
  limit: number;
};

/** What a reader does with comments: read the thread, post, edit and delete their own, report. */
export interface CommentThreadRepository {
  listApproved(query: PublicCommentQuery): Promise<PublicCommentPage>;
  listOwn(query: OwnCommentQuery): Promise<OwnCommentPage>;
  create(input: CreateCommentInput): Promise<CreatedComment>;
  editOwn(input: OwnCommentMutationInput): Promise<CreatedComment>;
  deleteOwn(id: string, actor: OwnCommentMutationInput["actor"]): Promise<void>;
  report(input: CommentReportInput): Promise<void>;
}

/** What a moderator does: the queue, the reports, the decisions and the audit trail. */
export interface CommentModerationRepository {
  listModeration(query: ModerationCommentQuery): Promise<ModerationCommentPage>;
  /** One comment as the moderation queue shows it, or null when no comment has this id. */
  getModeration(id: string): Promise<ModerationComment | null>;
  /** How many comments are in `status`, for the moderation badge. */
  countByStatus(status: CommentStatus): Promise<number>;
  listReports(commentId: string): Promise<ModerationReport[]>;
  moderate(input: ModerateCommentInput): Promise<void>;
  /** One transaction: every comment takes the status, or none does. */
  moderateMany(input: ModerateCommentsInput): Promise<void>;
  listAudit(query: ModerationAuditQuery): Promise<ModerationAuditPage>;
}

/** The links in a notification email that confirm or end a reader's subscription to replies. */
export interface CommentNotificationSubscriptionRepository {
  verifyNotificationSubscription(subscriptionId: string, tokenHash: string): Promise<void>;
  unsubscribeNotificationSubscription(subscriptionId: string, tokenHash: string): Promise<void>;
}

/** Everything a backend stores for comments; the service takes it whole, adapters implement it a port at a time. */
export type CommentRepository = CommentThreadRepository
  & CommentModerationRepository
  & CommentNotificationSubscriptionRepository;
