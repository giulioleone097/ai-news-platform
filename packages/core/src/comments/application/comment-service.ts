import {
  assertBatchSize,
  batchLimit,
  EditorialRuleError,
  rejectRepeats,
  validateEach,
} from "../../editorial/domain/errors";
import {
  commentPolicy,
  type CommentActor,
  type CommentStatus,
  type CommentReportInput,
  type CreateCommentInput,
  type ModerateCommentInput,
  type ModerateCommentsInput,
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

  getModeration(id: string) {
    return this.repository.getModeration(id);
  }

  countByStatus(status: CommentStatus) {
    return this.repository.countByStatus(status);
  }

  listReports(commentId: string) {
    return this.repository.listReports(commentId);
  }

  moderate(input: ModerateCommentInput) {
    return this.repository.moderate(input);
  }

  /**
   * One status for several comments, all or nothing: every comment is checked first and every one that
   * cannot take the status is reported by its position, then the repository writes them in one transaction.
   * A reply is approved under a parent that is already approved, so the order of the ids does not matter.
   */
  async moderateMany(input: ModerateCommentsInput) {
    assertBatchSize(input.ids.length, batchLimit, "comment");
    rejectRepeats(input.ids, (id) => id, (id) => `The comment "${id}" appears twice`);
    await validateEach(
      input.ids,
      async (id) => {
        const comment = await this.repository.getModeration(id);
        if (!comment) throw new EditorialRuleError("Comment not found.");
        if (comment.status === "deleted") throw new EditorialRuleError("The comment is deleted and cannot be moderated.");
        if (input.status === "approved" && comment.parentId) {
          const parent = await this.repository.getModeration(comment.parentId);
          if (parent?.status !== "approved") {
            throw new EditorialRuleError("A reply can only be approved under a comment that is approved.");
          }
        }
      },
      (id) => id,
    );
    await this.repository.moderateMany(input);
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
