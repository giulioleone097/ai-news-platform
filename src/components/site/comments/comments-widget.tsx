"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type {
  CommentCapability,
  CommentLocale,
  CreatedComment,
  OwnComment,
  PublicComment,
} from "@/modules/comments/domain/comment";
import styles from "./comments.module.css";

type LoadStatus = "idle" | "loading" | "error";

type CommentPageResponse<Item> = {
  items: Item[];
  nextCursor: string | null;
  capability: CommentCapability;
};

export const commentCopy = {
  en: {
    eyebrow: "Community",
    title: "Join the conversation",
    intro: "Thoughtful comments are reviewed before publication.",
    loading: "Loading comments…",
    loadMore: "Load more comments",
    loadMoreReplies: "Load more replies",
    retry: "Try again",
    loadError: "Comments could not be loaded.",
    empty: "Be the first to add a thoughtful perspective.",
    end: "You’ve reached the end of the conversation.",
    name: "Display name",
    namePlaceholder: "How should we call you?",
    comment: "Comment",
    commentPlaceholder: "Add context, a question, or a useful perspective…",
    replyPlaceholder: "Write a constructive reply…",
    submit: "Submit for review",
    submitting: "Submitting…",
    submitted: "Submitted. It will appear after review.",
    unavailable: "Comment submissions are temporarily unavailable.",
    guidelines: "Keep it relevant, constructive, and free of private information.",
    notifications: "Email me about replies and moderation",
    moderationNotifications: "Email me when this reply is moderated",
    email: "Notification email",
    emailHint: "Private. We’ll send a verification link and never show it publicly.",
    pending: "Awaiting review",
    approved: "Published",
    rejected: "Not published",
    reply: "Reply",
    replies: "replies",
    oneReply: "1 reply",
    edited: "edited",
    edit: "Edit",
    save: "Save changes",
    cancel: "Cancel",
    remove: "Delete",
    deleting: "Deleting…",
    deleted: "Comment deleted",
    report: "Report",
    reportReason: "Why are you reporting this?",
    reportDetails: "Optional details",
    reportSubmit: "Send report",
    reported: "Report received. Thank you.",
    spam: "Spam",
    harassment: "Harassment",
    hate: "Hate speech",
    misinformation: "Misinformation",
    privacy: "Privacy concern",
    other: "Other",
  },
  it: {
    eyebrow: "Community",
    title: "Partecipa alla conversazione",
    intro: "I commenti vengono revisionati prima della pubblicazione.",
    loading: "Caricamento commenti…",
    loadMore: "Carica altri commenti",
    loadMoreReplies: "Carica altre risposte",
    retry: "Riprova",
    loadError: "Non è stato possibile caricare i commenti.",
    empty: "Aggiungi per primo un punto di vista utile.",
    end: "Hai raggiunto la fine della conversazione.",
    name: "Nome visualizzato",
    namePlaceholder: "Come vuoi essere chiamato?",
    comment: "Commento",
    commentPlaceholder: "Aggiungi contesto, una domanda o un punto di vista utile…",
    replyPlaceholder: "Scrivi una risposta costruttiva…",
    submit: "Invia per la revisione",
    submitting: "Invio…",
    submitted: "Inviato. Sarà visibile dopo la revisione.",
    unavailable: "L’invio dei commenti non è momentaneamente disponibile.",
    guidelines: "Resta in tema, sii costruttivo e non condividere dati privati.",
    notifications: "Avvisami via email su risposte e moderazione",
    moderationNotifications: "Avvisami quando questa risposta viene moderata",
    email: "Email per le notifiche",
    emailHint: "Privata. Invieremo un link di verifica e non sarà mai mostrata.",
    pending: "In attesa di revisione",
    approved: "Pubblicato",
    rejected: "Non pubblicato",
    reply: "Rispondi",
    replies: "risposte",
    oneReply: "1 risposta",
    edited: "modificato",
    edit: "Modifica",
    save: "Salva modifiche",
    cancel: "Annulla",
    remove: "Elimina",
    deleting: "Eliminazione…",
    deleted: "Commento eliminato",
    report: "Segnala",
    reportReason: "Perché vuoi segnalarlo?",
    reportDetails: "Dettagli facoltativi",
    reportSubmit: "Invia segnalazione",
    reported: "Segnalazione ricevuta. Grazie.",
    spam: "Spam",
    harassment: "Molestie",
    hate: "Incitamento all’odio",
    misinformation: "Disinformazione",
    privacy: "Problema di privacy",
    other: "Altro",
  },
} as const;

type Copy = { [Key in keyof typeof commentCopy.en]: string };

function isCommentPage<Item>(value: unknown): value is CommentPageResponse<Item> {
  if (!value || typeof value !== "object") return false;
  const page = value as Partial<CommentPageResponse<Item>>;
  return Array.isArray(page.items)
    && (typeof page.nextCursor === "string" || page.nextCursor === null)
    && Boolean(page.capability && typeof page.capability.mutations === "boolean");
}

function useNearViewport<T extends HTMLElement>(rootMargin = "600px 0px") {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || near) return;
    if (typeof IntersectionObserver === "undefined") {
      const timer = setTimeout(() => setNear(true), 0);
      return () => clearTimeout(timer);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold: 0.01 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [near, rootMargin]);

  return [ref, near] as const;
}

function useCommentPage<Item extends PublicComment | OwnComment>({
  articleId,
  locale,
  parentId,
  enabled,
  scope,
}: {
  articleId: string;
  locale: CommentLocale;
  parentId: string | null;
  enabled: boolean;
  scope: "public" | "own";
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [capability, setCapability] = useState<CommentCapability | null>(null);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const loadingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  const loadMore = useCallback(async () => {
    if (!enabled || loadingRef.current || cursor === null) return;
    loadingRef.current = true;
    setStatus("loading");
    const controller = new AbortController();
    controllerRef.current = controller;
    const params = new URLSearchParams({ articleId, locale });
    params.set("scope", scope);
    if (parentId) params.set("parentId", parentId);
    if (cursor) params.set("cursor", cursor);

    try {
      const response = await fetch(`/api/comments?${params}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      const value = (await response.json()) as unknown;
      if (!response.ok || !isCommentPage<Item>(value)) {
        throw new Error(`Comment feed returned ${response.status}`);
      }
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...value.items.filter((item) => !known.has(item.id))];
      });
      setCapability(value.capability);
      setCursor(value.nextCursor);
      setStatus("idle");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setStatus("error");
      }
    } finally {
      loadingRef.current = false;
      controllerRef.current = null;
    }
  }, [articleId, cursor, enabled, locale, parentId, scope]);

  useEffect(() => {
    if (!enabled || cursor !== undefined) return;
    const timer = window.setTimeout(() => void loadMore(), 0);
    return () => window.clearTimeout(timer);
  }, [cursor, enabled, loadMore]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { capability, cursor, items, loadMore, status };
}

function AutoLoad({
  cursor,
  status,
  loadMore,
  label,
  loadingLabel,
}: {
  cursor: string | null | undefined;
  status: LoadStatus;
  loadMore: () => Promise<void>;
  label: string;
  loadingLabel: string;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !cursor || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadMore();
      },
      { rootMargin: "500px 0px", threshold: 0.01 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  if (!cursor) return null;
  return (
    <div className={styles.autoLoad} ref={sentinelRef}>
      <button
        className={styles.secondaryButton}
        disabled={status === "loading"}
        onClick={() => void loadMore()}
        type="button"
      >
        {status === "loading" ? loadingLabel : label}
      </button>
    </div>
  );
}

async function mutation(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = (await response.json()) as { message?: string; comment?: CreatedComment };
  if (!response.ok) throw new Error(value.message || "The request could not be completed.");
  return value;
}

export function CommentForm({
  articleId,
  locale,
  parentId,
  text,
  onCreated,
  notificationsEnabled,
}: {
  articleId: string;
  locale: CommentLocale;
  parentId: string | null;
  text: Copy;
  onCreated: (comment: CreatedComment) => void;
  notificationsEnabled: boolean;
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
      const value = await mutation("/api/comments", "POST", {
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
      setMessage(error instanceof Error ? error.message : text.unavailable);
    }
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <div className={styles.field}>
        <label htmlFor={nameId}>{text.name}</label>
        <input
          autoComplete="name"
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
        <button className={styles.primaryButton} disabled={status === "loading"} type="submit">
          {status === "loading" ? text.submitting : text.submit}
        </button>
      </div>
      <p
        className={status === "error" ? styles.error : styles.message}
        role={status === "error" ? "alert" : "status"}
      >
        {message}
      </p>
    </form>
  );
}

function OwnerManagement({
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
      const result = await mutation(`/api/comments/${comment.id}`, "PATCH", {
        displayName: data.get("displayName"),
        body: data.get("body"),
      });
      if (result.comment) onUpdated(result.comment);
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await mutation(`/api/comments/${comment.id}`, "DELETE");
      onDeleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delete failed.");
      setBusy(false);
    }
  }

  return (
    <div>
      {showStatus ? <span className={styles.pending}>{text[comment.status]}</span> : null}
      {editing ? (
        <form className={styles.inlineEdit} onSubmit={(event) => void save(event)}>
          <input defaultValue={comment.displayName} maxLength={60} minLength={2} name="displayName" required />
          <textarea defaultValue={comment.body} maxLength={4000} minLength={2} name="body" required rows={3} />
          <div className={styles.actions}>
            <button className={styles.primaryButton} disabled={busy} type="submit">{text.save}</button>
            <button className={styles.textButton} disabled={busy} onClick={() => setEditing(false)} type="button">{text.cancel}</button>
          </div>
        </form>
      ) : null}
      {!editing ? (
        <div className={styles.actions}>
          {canEdit && comment.canEdit ? <button className={styles.textButton} disabled={busy} onClick={() => setEditing(true)} type="button">{text.edit}</button> : null}
          {canDelete && comment.canDelete ? <button className={styles.dangerButton} disabled={busy} onClick={() => void remove()} type="button">{busy ? text.deleting : text.remove}</button> : null}
        </div>
      ) : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </div>
  );
}

function OwnCommentCard({
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

function ReportControl({ commentId, text }: { commentId: string; text: Copy }) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function report(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setState("loading");
    try {
      await mutation(`/api/comments/${commentId}/reports`, "POST", {
        reason: data.get("reason"),
        details: data.get("details"),
        website: data.get("website"),
      });
      setState("success");
      setMessage(text.reported);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : text.loadError);
    }
  }

  if (state === "success") return <span className={styles.message} role="status">{message}</span>;
  return (
    <details className={styles.report}>
      <summary>{text.report}</summary>
      <form onSubmit={(event) => void report(event)}>
        <label>
          {text.reportReason}
          <select defaultValue="spam" name="reason">
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
          <textarea maxLength={500} name="details" rows={2} />
        </label>
        <input className={styles.trap} aria-hidden="true" autoComplete="off" name="website" tabIndex={-1} />
        <button className={styles.secondaryButton} disabled={state === "loading"} type="submit">{text.reportSubmit}</button>
        {state === "error" ? <p className={styles.error} role="alert">{message}</p> : null}
      </form>
    </details>
  );
}

type ManagedComment = CreatedComment | OwnComment;

export function mergeOwnedComments(
  stored: OwnComment[],
  overrides: CreatedComment[],
  deletedIds: ReadonlySet<string>,
): ManagedComment[] {
  const merged = new Map<string, ManagedComment>();
  for (const comment of stored) {
    if (!deletedIds.has(comment.id)) merged.set(comment.id, comment);
  }
  for (const comment of overrides) {
    if (!deletedIds.has(comment.id)) merged.set(comment.id, comment);
  }
  return [...merged.values()].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

export function mergeCommentViews(
  published: PublicComment[],
  owned: ManagedComment[],
  hiddenIds: ReadonlySet<string>,
) {
  const ownershipById = new Map(owned.map((comment) => [comment.id, comment]));
  const matchedOwnership = new Set<string>();
  const publicEntries = published.flatMap((comment) => {
    if (hiddenIds.has(comment.id)) return [];
    const ownership = ownershipById.get(comment.id) ?? null;
    if (ownership && ownership.status !== "approved") return [];
    if (ownership) matchedOwnership.add(ownership.id);
    return [{ comment, ownership }];
  });
  return {
    publicEntries,
    standaloneOwned: owned.filter(
      (comment) => !hiddenIds.has(comment.id) && !matchedOwnership.has(comment.id),
    ),
  };
}

function CommentCard({
  articleId,
  comment,
  locale,
  text,
  mutationsEnabled,
  notificationsEnabled,
  ownership = null,
  onOwnershipDeleted,
  onOwnershipUpdated,
}: {
  articleId: string;
  comment: PublicComment;
  locale: CommentLocale;
  text: Copy;
  mutationsEnabled: boolean;
  notificationsEnabled: boolean;
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
        {!isReply && mutationsEnabled ? <button className={styles.textButton} onClick={() => {
          setReplying((value) => !value);
          setShowReplies(true);
        }} type="button">{text.reply}</button> : null}
        {!isReply && comment.replyCount > 0 ? (
          <button className={styles.textButton} onClick={() => setShowReplies((value) => !value)} type="button" aria-expanded={showReplies}>
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
          <CommentForm articleId={articleId} locale={locale} notificationsEnabled={notificationsEnabled} parentId={comment.id} text={text} onCreated={(created) => {
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
              text={text}
            />
          ))}
          {replies.status === "error" || ownReplies.status === "error" ? <p className={styles.error} role="alert">{text.loadError}</p> : null}
          <AutoLoad cursor={replies.cursor} label={replies.status === "error" ? text.retry : text.loadMoreReplies} loadMore={replies.loadMore} loadingLabel={text.loading} status={replies.status} />
          <AutoLoad cursor={ownReplies.cursor} label={ownReplies.status === "error" ? text.retry : text.loadMoreReplies} loadMore={ownReplies.loadMore} loadingLabel={text.loading} status={ownReplies.status} />
        </div>
      ) : null}
    </article>
  );
}

function LoadedComments({ articleId, locale }: { articleId: string; locale: CommentLocale }) {
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
  const [ownOverrides, setOwnOverrides] = useState<CreatedComment[]>([]);
  const [deletedOwnIds, setDeletedOwnIds] = useState<string[]>([]);
  const deletedIds = new Set(deletedOwnIds);
  const ownComments = mergeOwnedComments(ownFeed.items, ownOverrides, deletedIds);
  const commentViews = mergeCommentViews(feed.items, ownComments, deletedIds);
  const loaded = feed.cursor !== undefined;

  return (
    <>
      {feed.capability?.mutations ? (
        <CommentForm articleId={articleId} locale={locale} notificationsEnabled={feed.capability.notifications} parentId={null} text={text} onCreated={(comment) => setOwnOverrides((current) => [comment, ...current.filter((item) => item.id !== comment.id)])} />
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
            text={text}
          />
        ))}
        {loaded && feed.items.length === 0 && ownComments.length === 0 && feed.status !== "error" ? <p className={styles.empty}>{text.empty}</p> : null}
        {feed.status === "error" ? <p className={styles.error} role="alert">{text.loadError}</p> : null}
        {feed.status === "error" && feed.cursor === undefined ? (
          <div className={styles.autoLoad}>
            <button className={styles.secondaryButton} onClick={() => void feed.loadMore()} type="button">{text.retry}</button>
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

export function CommentsWidget({
  articleId,
  locale,
}: {
  articleId: string;
  locale: CommentLocale;
}) {
  const text = commentCopy[locale];
  const [sectionRef, activated] = useNearViewport<HTMLElement>();
  const titleId = useId();

  return (
    <section className={styles.shell} ref={sectionRef} aria-labelledby={titleId}>
      <header className={styles.header}>
        <p>{text.eyebrow}</p>
        <h2 id={titleId}>{text.title}</h2>
        <span>{text.intro}</span>
      </header>
      {activated ? <LoadedComments articleId={articleId} locale={locale} /> : (
        <div className={styles.skeleton} aria-label={text.loading} aria-busy="true">
          <span />
          <span />
          <span />
        </div>
      )}
    </section>
  );
}
