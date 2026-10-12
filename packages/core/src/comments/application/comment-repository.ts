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

export interface CommentRepository {
  listApproved(query: PublicCommentQuery): Promise<PublicCommentPage>;
  listOwn(query: OwnCommentQuery): Promise<OwnCommentPage>;
  create(input: CreateCommentInput): Promise<CreatedComment>;
  editOwn(input: OwnCommentMutationInput): Promise<CreatedComment>;
  deleteOwn(id: string, actor: OwnCommentMutationInput["actor"]): Promise<void>;
  report(input: CommentReportInput): Promise<void>;
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
  verifyNotificationSubscription(subscriptionId: string, tokenHash: string): Promise<void>;
  unsubscribeNotificationSubscription(subscriptionId: string, tokenHash: string): Promise<void>;
}
