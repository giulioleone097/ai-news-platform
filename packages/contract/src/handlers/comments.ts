import type { ModerationActor } from "@atlasnews/core/comments/domain/comment";
import { createCommentAdminToolHandlers } from "@atlasnews/core/comments/application/admin-tools";

import { CapabilityFailure, implement, type Principal } from "../capability";
import type { CapabilityPorts } from "../ports";
import { markUntrusted } from "../untrusted";
import {
  adminCommentProcessNotifications,
  adminGetComment,
  adminListCommentAudit,
  adminListCommentReports,
  adminListComments,
  adminModerateComment,
  adminModerateComments,
} from "../specs/comments";

/**
 * A signed-in editor (profile found, so `authorId` is set) leaves the same trail on the Studio, MCP and
 * the page: a user actor. The shared API key names no person, so it stays a system actor with its label.
 */
function moderationActor(principal: Principal): ModerationActor {
  return principal.kind === "editor" && principal.authorId
    ? { kind: "user", userId: principal.subject, label: null }
    : { kind: "system", userId: null, label: principal.kind === "editor" ? principal.subject : "anonymous" };
}

async function commentHandlers(ports: CapabilityPorts, principal: Principal) {
  return createCommentAdminToolHandlers(await ports.moderation(), moderationActor(principal));
}

/** Moderating comments: the moderation queue and the notification worker. Visitors' reads are in `public.ts`. */
export const commentCapabilities = [
  implement(adminListComments, async (ports, input, principal) => markUntrusted({
    page: await (await commentHandlers(ports, principal)).admin_list_comments(input),
  }, ["page.items[].body", "page.items[].displayName"])),
  implement(adminGetComment, async (ports, input, principal) => {
    const comment = await (await commentHandlers(ports, principal)).admin_get_comment(input);
    if (!comment) throw new CapabilityFailure("Comment not found.");
    return markUntrusted({ comment }, ["comment.body", "comment.displayName"]);
  }),
  implement(adminListCommentReports, async (ports, input, principal) => markUntrusted({
    reports: await (await commentHandlers(ports, principal)).admin_list_comment_reports(input),
  }, ["reports.items[].details"])),
  implement(adminModerateComment, async (ports, input, principal) => ({
    result: await (await commentHandlers(ports, principal)).admin_moderate_comment(input),
  })),
  implement(adminModerateComments, async (ports, input, principal) => {
    const { moderatedIds, status } = await (await commentHandlers(ports, principal)).admin_moderate_comments(input);
    return {
      count: moderatedIds.length,
      items: moderatedIds.map((id, index) => ({ index, action: "moderated" as const, id, status })),
    };
  }),
  implement(adminListCommentAudit, async (ports, input, principal) => ({
    page: await (await commentHandlers(ports, principal)).admin_list_comment_audit(input),
  })),
  implement(adminCommentProcessNotifications, async (ports, { limit }) => ({
    batch: await (await ports.commentNotifications()).processBatch({ limit }),
  })),
];
