import Link from "next/link";
import { MessageSquareText, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import {
  moderationQueueStatuses,
  moderationTargetStatuses,
  type CommentStatus,
} from "@/modules/comments/domain/comment";
import { createMutationCommentService } from "@/modules/comments/infrastructure/container";
import { decodeCommentCursor } from "@/modules/comments/infrastructure/cursor";
import { moderateCommentAction } from "./actions";
import styles from "./comments.module.css";

export const dynamic = "force-dynamic";

const copy = {
  en: {
    kicker: "Community",
    title: "Comment moderation",
    description: "Review conversations, reports and the append-only moderation trail.",
    status: "Status",
    allStatuses: "All statuses",
    filter: "Filter",
    empty: "No comments match this view",
    reason: "Required moderation reason",
    reports: "Reports",
    noDetails: "No additional details",
    next: "Next page",
    audit: "Recent moderation audit",
    system: "System",
    unavailable: "Comment moderation is not configured.",
    actions: { approved: "Approve", rejected: "Reject", spam: "Mark spam", deleted: "Delete" },
  },
  it: {
    kicker: "Community",
    title: "Moderazione commenti",
    description: "Revisiona conversazioni, segnalazioni e registro immutabile di moderazione.",
    status: "Stato",
    allStatuses: "Tutti gli stati",
    filter: "Filtra",
    empty: "Nessun commento corrisponde a questa vista",
    reason: "Motivazione obbligatoria",
    reports: "Segnalazioni",
    noDetails: "Nessun dettaglio aggiuntivo",
    next: "Pagina successiva",
    audit: "Audit moderazione recente",
    system: "Sistema",
    unavailable: "La moderazione commenti non è configurata.",
    actions: { approved: "Approva", rejected: "Rifiuta", spam: "Segna spam", deleted: "Elimina" },
  },
} as const;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function StudioCommentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: rawLocale }, search] = await Promise.all([params, searchParams]);
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale;
  await requireEditor(locale);
  const labels = copy[locale];
  const service = createMutationCommentService();

  if (!service) {
    return (
      <>
        <header className="studio-page-header">
          <div>
            <p className="studio-kicker">{labels.kicker}</p>
            <h1>{labels.title}</h1>
            <p>{labels.description}</p>
          </div>
        </header>
        <p className="studio-alert studio-alert--error" role="status">{labels.unavailable}</p>
      </>
    );
  }

  const requestedStatus = first(search.status);
  const status = moderationQueueStatuses.includes(requestedStatus as CommentStatus)
    ? requestedStatus as CommentStatus
    : null;
  const encodedCursor = first(search.cursor);
  const cursor = encodedCursor ? decodeCommentCursor(encodedCursor) : null;
  const [page, audit] = await Promise.all([
    service.listModeration({ status, locale, cursor, limit: 30 }),
    service.listAudit({ beforeId: null, limit: 20 }),
  ]);
  const reports = new Map(await Promise.all(page.items.map(async (comment) => [
    comment.id,
    comment.reportCount ? await service.listReports(comment.id) : [],
  ] as const)));

  return (
    <>
      <header className="studio-page-header">
        <div>
          <p className="studio-kicker">{labels.kicker}</p>
          <h1>{labels.title}</h1>
          <p>{labels.description}</p>
        </div>
      </header>

      <form className={styles.filters} method="get">
        <select aria-label={labels.status} defaultValue={status ?? ""} name="status">
          <option value="">{labels.allStatuses}</option>
          {moderationQueueStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <input name="locale" type="hidden" value={locale} />
        <button className="studio-button studio-button--secondary" type="submit">{labels.filter}</button>
      </form>

      {page.items.length ? (
        <section className={styles.queue} aria-label={labels.title}>
          {page.items.map((comment) => (
            <article className={styles.card} key={comment.id}>
              <div className={styles.meta}>
                <strong>{comment.displayName}</strong>
                <span className={`studio-status studio-status--${comment.status}`}>{comment.status}</span>
                <span>{comment.authorKind}</span>
                <time dateTime={comment.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(comment.createdAt))} UTC</time>
                <span>{comment.reportCount} {labels.reports.toLowerCase()}</span>
              </div>
              <p className={styles.body}>{comment.body}</p>
              {reports.get(comment.id)?.length ? (
                <div className={styles.reports}>
                  {reports.get(comment.id)?.map((report) => (
                    <p key={report.id}><strong>{report.reason}</strong> · {report.details || labels.noDetails}</p>
                  ))}
                </div>
              ) : null}
              <form action={moderateCommentAction} className={styles.moderation}>
                <input name="id" type="hidden" value={comment.id} />
                <input name="locale" type="hidden" value={locale} />
                <label>
                  <span className="sr-only">{labels.reason}</span>
                  <input maxLength={500} minLength={2} name="reason" placeholder={labels.reason} required />
                </label>
                <div className={styles.actions}>
                  {moderationTargetStatuses.map((target) => (
                    <button className={target === "deleted" ? "studio-button studio-button--danger" : "studio-button studio-button--secondary"} name="status" type="submit" value={target} key={target}>
                      {labels.actions[target]}
                    </button>
                  ))}
                </div>
              </form>
            </article>
          ))}
        </section>
      ) : (
        <div className="studio-empty-state"><MessageSquareText aria-hidden="true" size={28} /><h2>{labels.empty}</h2></div>
      )}

      {page.nextCursor ? (
        <Link className="studio-button studio-button--secondary" href={`/${locale}/studio/comments?status=${status ?? ""}&cursor=${encodeURIComponent(page.nextCursor)}`}>{labels.next}</Link>
      ) : null}

      <section className={styles.audit} aria-labelledby="comment-audit-title">
        <header className="studio-section__header"><div><ShieldCheck aria-hidden="true" size={20} /><h2 id="comment-audit-title">{labels.audit}</h2></div></header>
        {audit.items.map((event) => (
          <article key={event.id}>
            <strong>{event.action}</strong>
            <div className={styles.auditMeta}>
              <span>{event.actorLabel || labels.system}</span>
              <span>{event.previousStatus || "—"} → {event.nextStatus || "—"}</span>
              <time dateTime={event.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(event.createdAt))} UTC</time>
            </div>
            {event.reason ? <p>{event.reason}</p> : null}
          </article>
        ))}
      </section>
    </>
  );
}
