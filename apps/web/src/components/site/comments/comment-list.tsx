import { useState } from "react";
import type {
  CommentLocale,
  CreatedComment,
  OwnComment,
  PublicComment,
} from "@atlasnews/core/comments/domain/comment";
import { AutoLoad } from "./auto-load";
import { CommentCard } from "./comment-card";
import { commentCopy } from "./comment-copy";
import { CommentForm } from "./comment-form";
import { mergeCommentViews, mergeOwnedComments } from "./comment-views";
import styles from "./comments.module.css";
import { OwnCommentCard } from "./owner-management";
import { ReaderAccount, useReaderSession } from "./reader-account";
import { useCommentPage } from "./use-comment-page";

/** The form and the list of an article's comments, loaded page by page. */
export function CommentList({ articleId, locale }: { articleId: string; locale: CommentLocale }) {
  const text = commentCopy[locale];
  const feed = useCommentPage<PublicComment>({
    articleId,
    locale,
    parentId: null,
    enabled: true,
    scope: "public",
  });
  const ownFeed = useCommentPage<OwnComment>({
    articleId,
    locale,
    parentId: null,
    enabled: Boolean(feed.capability?.mutations),
    scope: "own",
  });
  const session = useReaderSession();
  const readerName = session?.user?.displayName;
  const [ownOverrides, setOwnOverrides] = useState<CreatedComment[]>([]);
  const [deletedOwnIds, setDeletedOwnIds] = useState<string[]>([]);
  const deletedIds = new Set(deletedOwnIds);
  const ownComments = mergeOwnedComments(ownFeed.items, ownOverrides, deletedIds);
  const commentViews = mergeCommentViews(feed.items, ownComments, deletedIds);
  const loaded = feed.cursor !== undefined;

  return (
    <>
      {feed.capability?.mutations && session ? <ReaderAccount session={session} text={text} /> : null}
      {feed.capability?.mutations ? (
        <CommentForm articleId={articleId} defaultName={readerName} key={readerName ?? "guest"} locale={locale} notificationsEnabled={feed.capability.notifications} parentId={null} text={text} onCreated={(comment) => setOwnOverrides((current) => [comment, ...current.filter((item) => item.id !== comment.id)])} />
      ) : loaded ? <p className={styles.unavailable}>{text.unavailable}</p> : null}
      <div className={styles.list} aria-busy={feed.status === "loading" || ownFeed.status === "loading"}>
        {commentViews.standaloneOwned.map((comment) => (
          <OwnCommentCard
            comment={comment}
            key={comment.id}
            onDeleted={() => setDeletedOwnIds((current) => [...current, comment.id])}
            onUpdated={(updated) => setOwnOverrides((current) => [updated, ...current.filter((item) => item.id !== updated.id)])}
            text={text}
          />
        ))}
        {commentViews.publicEntries.map(({ comment, ownership }) => (
          <CommentCard
            articleId={articleId}
            comment={comment}
            key={comment.id}
            locale={locale}
            mutationsEnabled={Boolean(feed.capability?.mutations)}
            notificationsEnabled={Boolean(feed.capability?.notifications)}
            onOwnershipDeleted={ownership ? () => setDeletedOwnIds((current) => [...current, ownership.id]) : undefined}
            onOwnershipUpdated={ownership ? (updated) => setOwnOverrides((current) => [updated, ...current.filter((item) => item.id !== updated.id)]) : undefined}
            ownership={ownership}
            readerName={readerName}
            text={text}
          />
        ))}
        {loaded && feed.items.length === 0 && ownComments.length === 0 && feed.status !== "error" ? <p className={styles.empty}>{text.empty}</p> : null}
        {feed.status === "error" ? <p className={styles.unavailable} role="alert">{text.loadError}</p> : null}
        {feed.status === "error" && feed.cursor === undefined ? (
          <div className={styles.autoLoad}>
            <button className="button button--quiet" onClick={() => void feed.loadMore()} type="button">{text.retry}</button>
          </div>
        ) : null}
        <AutoLoad cursor={feed.cursor} label={feed.status === "error" ? text.retry : text.loadMore} loadMore={feed.loadMore} loadingLabel={text.loading} status={feed.status} />
        <AutoLoad cursor={ownFeed.cursor} label={ownFeed.status === "error" ? text.retry : text.loadMore} loadMore={ownFeed.loadMore} loadingLabel={text.loading} status={ownFeed.status} />
        {loaded && feed.cursor === null && ownFeed.cursor === null && (feed.items.length > 0 || ownComments.length > 0) ? <p className={styles.end}>{text.end}</p> : null}
      </div>
      <span className={styles.visuallyHidden} aria-live="polite" role="status">
        {feed.status === "loading" ? text.loading : feed.status === "error" ? text.loadError : ""}
      </span>
    </>
  );
}
