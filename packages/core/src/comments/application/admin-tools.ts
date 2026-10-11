import type { ModerationActor } from "../domain/comment";
import { commentAdminToolDefinitions as tools } from "../domain/admin-tool-definitions";
import { decodeAuditCursor, decodeCommentCursor } from "../domain/cursor";
import { CommentOperationError } from "./errors";
import type { CommentService } from "./comment-service";

export function createCommentAdminToolHandlers(
  service: CommentService,
  actor: ModerationActor,
) {
  return {
    async admin_list_comments(input: unknown) {
      const parsed = tools.admin_list_comments.inputSchema.parse(input);
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
      const parsed = tools.admin_list_comment_reports.inputSchema.parse(input);
      return { items: await service.listReports(parsed.commentId) };
    },
    async admin_moderate_comment(input: unknown) {
      const parsed = tools.admin_moderate_comment.inputSchema.parse(input);
      await service.moderate({ ...parsed, actor });
      return { moderatedId: parsed.id, status: parsed.status };
    },
    async admin_list_comment_audit(input: unknown) {
      const parsed = tools.admin_list_comment_audit.inputSchema.parse(input);
      const beforeId = parsed.cursor ? decodeAuditCursor(parsed.cursor) : null;
      if (parsed.cursor && !beforeId) {
        throw new CommentOperationError("invalid_cursor", "Invalid audit cursor.", 400);
      }
      return service.listAudit({ beforeId, limit: parsed.limit });
    },
  };
}
