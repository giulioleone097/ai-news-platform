import { useState } from "react";
import { commentErrorMessage, sendComment } from "./comment-api";
import type { Copy } from "./comment-copy";
import styles from "./comments.module.css";

export function ReportControl({ commentId, text }: { commentId: string; text: Copy }) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function report(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setState("loading");
    try {
      await sendComment(`/api/comments/${commentId}/reports`, "POST", {
        reason: data.get("reason"),
        details: data.get("details"),
        website: data.get("website"),
      });
      setState("success");
      setMessage(text.reported);
    } catch (error) {
      setState("error");
      setMessage(commentErrorMessage(error, text, text.errorGeneric));
    }
  }

  if (state === "success") return <span className="form-message form-message--success" role="status">{message}</span>;
  return (
    <details className={styles.report}>
      <summary>{text.report}</summary>
      <form onSubmit={(event) => void report(event)}>
        <label>
          {text.reportReason}
          <select className="input" defaultValue="spam" name="reason">
            <option value="spam">{text.spam}</option>
            <option value="harassment">{text.harassment}</option>
            <option value="hate">{text.hate}</option>
            <option value="misinformation">{text.misinformation}</option>
            <option value="privacy">{text.privacy}</option>
            <option value="other">{text.other}</option>
          </select>
        </label>
        <label>
          {text.reportDetails}
          <textarea className="input" maxLength={500} name="details" rows={2} />
        </label>
        <input className={styles.trap} aria-hidden="true" autoComplete="off" name="website" tabIndex={-1} />
        <button className="button button--quiet" disabled={state === "loading"} type="submit">{text.reportSubmit}</button>
        {state === "error" ? <p className="form-message form-message--error" role="alert">{message}</p> : null}
      </form>
    </details>
  );
}
