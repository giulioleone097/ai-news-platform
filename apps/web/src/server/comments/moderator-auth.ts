import "server-only";

import { CommentOperationError } from "@atlasnews/core/comments/application/errors";
import type { ModerationActor } from "@atlasnews/core/comments/domain/comment";
import { getEditorIdentity, isSignedIn } from "@/lib/editor-auth";

export async function requireCommentModerator(): Promise<ModerationActor> {
  const editor = await getEditorIdentity();
  // The demo editor has no persistent comments to moderate.
  if (editor?.isDemo) {
    throw new CommentOperationError("configuration_unavailable", "Comment moderation is unavailable.", 503);
  }
  if (!editor) {
    throw await isSignedIn()
      ? new CommentOperationError("operation_not_allowed", "Moderator permission required.", 403)
      : new CommentOperationError("operation_not_allowed", "Moderator authentication required.", 401);
  }
  return { kind: "user", userId: editor.userId, label: null };
}
