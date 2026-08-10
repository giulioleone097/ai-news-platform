import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OwnComment, PublicComment } from "@/modules/comments/domain/comment";
import {
  CommentForm,
  commentCopy,
  mergeCommentViews,
} from "./comments-widget";

const articleId = "f0d16765-a03d-4c55-9e1c-fd6c6c87557f";

function published(id: string): PublicComment {
  return {
    id,
    articleId,
    locale: "en",
    parentId: null,
    body: "Published body",
    displayName: "Ada",
    createdAt: "2026-08-10T09:00:00.000Z",
    editedAt: null,
    replyCount: 2,
  };
}

function owned(id: string, status: OwnComment["status"]): OwnComment {
  return {
    ...published(id),
    status,
    editUntil: "2026-08-10T09:15:00.000Z",
    deleteUntil: "2026-08-11T09:00:00.000Z",
    canEdit: status !== "rejected",
    canDelete: status !== "rejected",
  };
}

describe("comment owner UX", () => {
  it("does not offer notification opt-in when delivery is unavailable", () => {
    const unavailable = renderToStaticMarkup(
      <CommentForm
        articleId={articleId}
        locale="en"
        notificationsEnabled={false}
        onCreated={() => undefined}
        parentId={null}
        text={commentCopy.en}
      />,
    );
    const available = renderToStaticMarkup(
      <CommentForm
        articleId={articleId}
        locale="en"
        notificationsEnabled
        onCreated={() => undefined}
        parentId={null}
        text={commentCopy.en}
      />,
    );

    expect(unavailable).not.toContain(commentCopy.en.notifications);
    expect(unavailable).not.toContain('type="checkbox"');
    expect(available).toContain(commentCopy.en.notifications);
    expect(available).toContain('type="checkbox"');
  });

  it("keeps approved ownership on the public card and standalone non-public states", () => {
    const approvedId = "014fb7a4-97db-4566-9200-13bf795c78fd";
    const pendingId = "e44aeccf-94bd-40e8-8364-e430a6ba20a5";
    const otherId = "b0af7658-a69f-4c1f-b983-6dd944d308c2";
    const views = mergeCommentViews(
      [published(approvedId), published(pendingId), published(otherId)],
      [owned(approvedId, "approved"), owned(pendingId, "pending")],
      new Set(),
    );

    expect(views.publicEntries.map(({ comment }) => comment.id)).toEqual([approvedId, otherId]);
    expect(views.publicEntries[0]?.ownership?.status).toBe("approved");
    expect(views.standaloneOwned.map((comment) => comment.id)).toEqual([pendingId]);
  });
});
