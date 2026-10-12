import { useState } from "react";
import type {
  CommentLocale,
  CreatedComment,
  OwnComment,
  PublicComment,
} from "@atlasnews/core/comments/domain/comment";
import { AutoLoad } from "./auto-load";
import { CommentForm } from "./comment-form";
import type { Copy } from "./comment-copy";
import { mergeCommentViews, mergeOwnedComments, type ManagedComment } from "./comment-views";
import styles from "./comments.module.css";
import { OwnCommentCard, OwnerManagement } from "./owner-management";
import { ReportControl } from "./report-control";
import { useCommentPage } from "./use-comment-page";

/** A published comment with its actions, its replies and, when the reader wrote it, the way to edit or delete it. */
export function CommentCard({
  articleId,
  comment,
  locale,
  text,
  mutationsEnabled,
  notificationsEnabled,
  ownership = null,
  onOwnershipDeleted,
  onOwnershipUpdated,
  readerName,
}: {
  articleId: string;
  comment: PublicComment;
  locale: CommentLocale;
  text: Copy;
  mutationsEnabled: boolean;
  notificationsEnabled: boolean;
  readerName?: string;
  ownership?: ManagedComment | null;
  onOwnershipDeleted?: () => void;
  onOwnershipUpdated?: (comment: CreatedComment) => void;
}) {
  const [replying, setReplying] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [ownOverrides, setOwnOverrides] = useState<CreatedComment[]>([]);
  const [deletedOwnIds, setDeletedOwnIds] = useState<string[]>([]);
  const replies = useCommentPage<PublicComment>({
    articleId,
    locale,
    parentId: comment.id,
    enabled: showReplies,
    scope: "public",
  });
  const ownReplies = useCommentPage<OwnComment>({
    articleId,
    locale,
    parentId: comment.id,
    enabled: showReplies && mutationsEnabled,
    scope: "own",
  });
  const deletedIds = new Set(deletedOwnIds);
  const managedReplies = mergeOwnedComments(ownReplies.items, ownOverrides, deletedIds);
  const replyViews = mergeCommentViews(replies.items, managedReplies, deletedIds);
  const replyLabel = comment.replyCount === 1 ? text.oneReply : `${comment.replyCount} ${text.replies}`;
  const isReply = comment.parentId !== null;

  return (
    <article className={styles.comment}>
      <div className={styles.commentMeta}>
        <strong>{comment.displayName}</strong>
        <time dateTime={comment.createdAt}>
          {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(comment.createdAt))}
        </time>
        {comment.editedAt ? <span>· {text.edited}</span> : null}
      </div>
      <p className={styles.body}>{comment.body}</p>
      <div className={styles.actions}>
        {!isReply && mutationsEnabled ? <button className="button button--ghost button--small" onClick={() => {
          setReplying((value) => !value);
          setShowReplies(true);
        }} type="button">{text.reply}</button> : null}
        {!isReply && comment.replyCount > 0 ? (
          <button className="button button--ghost button--small" onClick={() => setShowReplies((value) => !value)} type="button" aria-expanded={showReplies}>
            {replyLabel}
          </button>
        ) : null}
        {!ownership ? <ReportControl commentId={comment.id} text={text} /> : null}
      </div>
      {ownership && onOwnershipDeleted && onOwnershipUpdated ? (
        <OwnerManagement
          comment={ownership}
          onDeleted={onOwnershipDeleted}
          onUpdated={onOwnershipUpdated}
          text={text}
        />
      ) : null}
      {!isReply && replying ? (
        <div className={styles.replyComposer}>
          <CommentForm articleId={articleId} defaultName={readerName} key={readerName ?? "guest"} locale={locale} notificationsEnabled={notificationsEnabled} parentId={comment.id} text={text} onCreated={(created) => {
            setOwnOverrides((current) => [created, ...current.filter((item) => item.id !== created.id)]);
            setReplying(false);
            setShowReplies(true);
          }} />
        </div>
      ) : null}
      {!isReply && showReplies ? (
        <div className={styles.replies} aria-busy={replies.status === "loading" || ownReplies.status === "loading"}>
          {replyViews.standaloneOwned.map((reply) => (
            <OwnCommentCard
              comment={reply}
              key={reply.id}
              onDeleted={() => setDeletedOwnIds((current) => [...current, reply.id])}
              onUpdated={(updated) => setOwnOverrides((current) => [updated, ...current.filter((item) => item.id !== updated.id)])}
              text={text}
            />
          ))}
          {replyViews.publicEntries.map(({ comment: reply, ownership }) => (
            <CommentCard
              articleId={articleId}
              comment={reply}
              key={reply.id}
              locale={locale}
              mutationsEnabled={mutationsEnabled}
              notificationsEnabled={notificationsEnabled}
              onOwnershipDeleted={ownership ? () => setDeletedOwnIds((current) => [...current, ownership.id]) : undefined}
              onOwnershipUpdated={ownership ? (updated) => setOwnOverrides((current) => [updated, ...current.filter((item) => item.id !== updated.id)]) : undefined}
              ownership={ownership}
              readerName={readerName}
              text={text}
            />
          ))}
          {replies.status === "error" || ownReplies.status === "error" ? <p className="form-message form-message--error" role="alert">{text.loadError}</p> : null}
          <AutoLoad cursor={replies.cursor} label={replies.status === "error" ? text.retry : text.loadMoreReplies} loadMore={replies.loadMore} loadingLabel={text.loading} status={replies.status} />
          <AutoLoad cursor={ownReplies.cursor} label={ownReplies.status === "error" ? text.retry : text.loadMoreReplies} loadMore={ownReplies.loadMore} loadingLabel={text.loading} status={ownReplies.status} />
        </div>
      ) : null}
    </article>
  );
}
