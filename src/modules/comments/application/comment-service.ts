import {
  commentPolicy,
  type CommentActor,
  type CommentReportInput,
  type CreateCommentInput,
  type ModerateCommentInput,
  type ModerationAuditPage,
  type ModerationCommentPage,
  type OwnCommentPage,
  type OwnCommentMutationInput,
  type PublicCommentPage,
} from "../domain/comment";
import type {
  CommentRepository,
  ModerationAuditQuery,
  ModerationCommentQuery,
  OwnCommentQuery,
  PublicCommentQuery,
} from "./comment-repository";

export class CommentService {
  constructor(private readonly repository: CommentRepository) {}

  listApproved(query: PublicCommentQuery): Promise<PublicCommentPage> {
    return this.repository.listApproved(query);
  }

  listOwn(query: OwnCommentQuery): Promise<OwnCommentPage> {
    return this.repository.listOwn(query);
  }

  create(input: CreateCommentInput) {
    return this.repository.create(input);
  }

  editOwn(input: OwnCommentMutationInput) {
    return this.repository.editOwn(input);
  }

  deleteOwn(id: string, actor: CommentActor) {
    return this.repository.deleteOwn(id, actor);
  }

  report(input: CommentReportInput) {
    return this.repository.report(input);
  }

  listModeration(query: ModerationCommentQuery): Promise<ModerationCommentPage> {
    return this.repository.listModeration(query);
  }

  listReports(commentId: string) {
    return this.repository.listReports(commentId);
  }

  moderate(input: ModerateCommentInput) {
    return this.repository.moderate(input);
  }

  listAudit(query: ModerationAuditQuery): Promise<ModerationAuditPage> {
    return this.repository.listAudit(query);
  }

  verifyNotificationSubscription(subscriptionId: string, tokenHash: string) {
    return this.repository.verifyNotificationSubscription(subscriptionId, tokenHash);
  }

  unsubscribeNotificationSubscription(subscriptionId: string, tokenHash: string) {
    return this.repository.unsubscribeNotificationSubscription(subscriptionId, tokenHash);
  }

  static policy = commentPolicy;
}
