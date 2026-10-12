import { useEffect, useState } from "react";
import type { CreatedComment, OwnComment } from "@atlasnews/core/comments/domain/comment";
import { commentErrorMessage, sendComment } from "./comment-api";
import type { Copy } from "./comment-copy";
import styles from "./comments.module.css";

/** The two fields have no room for a visible label, so each carries one for assistive technology. */
export function InlineEditForm({
  comment,
  text,
  busy,
  onSubmit,
  onCancel,
}: {
  comment: CreatedComment | OwnComment;
  text: Copy;
  busy: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form className={styles.inlineEdit} onSubmit={onSubmit}>
      <input aria-label={text.name} className="input" defaultValue={comment.displayName} maxLength={60} minLength={2} name="displayName" required />
      <textarea aria-label={text.comment} className="input" defaultValue={comment.body} maxLength={4000} minLength={2} name="body" required rows={3} />
      <div className={styles.actions}>
        <button className="button button--primary" disabled={busy} type="submit">{text.save}</button>
        <button className="button button--ghost button--small" disabled={busy} onClick={onCancel} type="button">{text.cancel}</button>
      </div>
    </form>
  );
}

export function OwnerManagement({
  comment,
  text,
  onUpdated,
  onDeleted,
  showStatus = true,
}: {
  comment: CreatedComment | OwnComment;
  text: Copy;
  onUpdated: (comment: CreatedComment) => void;
  onDeleted: () => void;
  showStatus?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [canEdit, setCanEdit] = useState(comment.canEdit);
  const [canDelete, setCanDelete] = useState(comment.canDelete);

  useEffect(() => {
    const now = Date.now();
    const editDelay = new Date(comment.editUntil).getTime() - now;
    const deleteDelay = new Date(comment.deleteUntil).getTime() - now;
    const editTimer = comment.canEdit && editDelay > 0
      ? window.setTimeout(() => setCanEdit(false), editDelay)
      : null;
    const deleteTimer = comment.canDelete && deleteDelay > 0
      ? window.setTimeout(() => setCanDelete(false), deleteDelay)
      : null;
    return () => {
      if (editTimer) window.clearTimeout(editTimer);
      if (deleteTimer) window.clearTimeout(deleteTimer);
    };
  }, [comment.canDelete, comment.canEdit, comment.deleteUntil, comment.editUntil]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await sendComment(`/api/comments/${comment.id}`, "PATCH", {
        displayName: data.get("displayName"),
        body: data.get("body"),
      });
      if (result.comment) onUpdated(result.comment);
      setEditing(false);
    } catch (cause) {
      setError(commentErrorMessage(cause, text, text.updateFailed));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await sendComment(`/api/comments/${comment.id}`, "DELETE");
      onDeleted();
    } catch (cause) {
      setError(commentErrorMessage(cause, text, text.deleteFailed));
      setBusy(false);
    }
  }

  return (
    <div>
      {showStatus ? <span className={styles.pending}>{text[comment.status]}</span> : null}
      {editing ? (
        <InlineEditForm
          busy={busy}
          comment={comment}
          onCancel={() => setEditing(false)}
          onSubmit={(event) => void save(event)}
          text={text}
        />
      ) : null}
      {!editing ? (
        <div className={styles.actions}>
          {canEdit && comment.canEdit ? <button className="button button--ghost button--small" disabled={busy} onClick={() => setEditing(true)} type="button">{text.edit}</button> : null}
          {canDelete && comment.canDelete ? <button className="button button--small button--danger" disabled={busy} onClick={() => void remove()} type="button">{busy ? text.deleting : text.remove}</button> : null}
        </div>
      ) : null}
      {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
    </div>
  );
}

export function OwnCommentCard({
  comment,
  text,
  onUpdated,
  onDeleted,
}: {
  comment: CreatedComment | OwnComment;
  text: Copy;
  onUpdated: (comment: CreatedComment) => void;
  onDeleted: () => void;
}) {
  return (
    <article className={`${styles.comment} ${styles.ownComment}`}>
      <div className={styles.commentMeta}>
        <strong>{comment.displayName}</strong>
        <span className={styles.pending}>{text[comment.status]}</span>
      </div>
      <p className={styles.body}>{comment.body}</p>
      <OwnerManagement
        comment={comment}
        onDeleted={onDeleted}
        onUpdated={onUpdated}
        showStatus={false}
        text={text}
      />
    </article>
  );
}
