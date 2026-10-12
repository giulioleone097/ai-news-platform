import { useId, useState } from "react";
import type { CommentLocale, CreatedComment } from "@atlasnews/core/comments/domain/comment";
import { commentErrorMessage, sendComment } from "./comment-api";
import type { Copy } from "./comment-copy";
import styles from "./comments.module.css";

export function CommentForm({
  articleId,
  locale,
  parentId,
  text,
  onCreated,
  notificationsEnabled,
  defaultName,
}: {
  articleId: string;
  locale: CommentLocale;
  parentId: string | null;
  text: Copy;
  onCreated: (comment: CreatedComment) => void;
  notificationsEnabled: boolean;
  /** The signed-in reader's name, to prefill the display name. */
  defaultName?: string;
}) {
  const nameId = useId();
  const bodyId = useId();
  const emailId = useId();
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [notify, setNotify] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus("loading");
    setMessage("");
    try {
      const value = await sendComment("/api/comments", "POST", {
        articleId,
        locale,
        parentId,
        displayName: data.get("displayName"),
        body: data.get("body"),
        website: data.get("website"),
        notifications: notify && notificationsEnabled
          ? {
              email: data.get("email"),
              onReplies: parentId === null,
              onModeration: true,
            }
          : null,
      });
      if (value.comment) onCreated(value.comment);
      form.reset();
      setNotify(false);
      setStatus("success");
      setMessage(text.submitted);
    } catch (error) {
      setStatus("error");
      setMessage(commentErrorMessage(error, text, text.unavailable));
    }
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <div className={styles.field}>
        <label htmlFor={nameId}>{text.name}</label>
        <input
          className="input"
          autoComplete="name"
          defaultValue={defaultName}
          disabled={status === "loading"}
          id={nameId}
          maxLength={60}
          minLength={2}
          name="displayName"
          placeholder={text.namePlaceholder}
          required
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={bodyId}>{text.comment}</label>
        <textarea
          className="input"
          disabled={status === "loading"}
          id={bodyId}
          maxLength={4000}
          minLength={2}
          name="body"
          placeholder={parentId ? text.replyPlaceholder : text.commentPlaceholder}
          required
          rows={parentId ? 3 : 4}
        />
      </div>
      <div className={styles.trap} aria-hidden="true">
        <label>
          Website
          <input autoComplete="off" name="website" tabIndex={-1} />
        </label>
      </div>
      {notificationsEnabled ? (
        <>
          <label className={styles.check}>
            <input
              checked={notify}
              disabled={status === "loading"}
              onChange={(event) => setNotify(event.target.checked)}
              type="checkbox"
            />
            <span>{parentId ? text.moderationNotifications : text.notifications}</span>
          </label>
          {notify ? (
            <div className={styles.field}>
              <label htmlFor={emailId}>{text.email}</label>
              <input
                className="input"
                autoComplete="email"
                disabled={status === "loading"}
                id={emailId}
                maxLength={254}
                name="email"
                required
                type="email"
              />
              <small>{text.emailHint}</small>
            </div>
          ) : null}
        </>
      ) : null}
      <div className={styles.formFooter}>
        <p>{text.guidelines}</p>
        <button className="button button--primary" disabled={status === "loading"} type="submit">
          {status === "loading" ? text.submitting : text.submit}
        </button>
      </div>
      <p
        className={`form-message form-message--${status === "error" ? "error" : "success"}`}
        role={status === "error" ? "alert" : "status"}
      >
        {message}
      </p>
    </form>
  );
}
