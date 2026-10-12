import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, sentenceCase, type BadgeTone } from "@/components/studio/badge";
import { OffNote } from "@/components/studio/note";
import { PageHead } from "@/components/studio/page-head";
import { getMessages, isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import {
  moderationQueueStatuses,
  moderationTargetStatuses,
  type CommentStatus,
} from "@atlasnews/core/comments/domain/comment";
import { createMutationCommentService } from "@/server/composition";
import { decodeCommentCursor } from "@atlasnews/core/comments/domain/cursor";
import { moderateCommentAction } from "./actions";

export const dynamic = "force-dynamic";

const copy = {
  en: {
    description: "Review conversations, reports and the append-only moderation trail.",
    status: "Status",
    allStatuses: "All statuses",
    empty: "No comments match this view",
    reason: "Required moderation reason",
    reports: "Reports",
    noDetails: "No additional details",
    next: "Next page",
    audit: "Recent moderation audit",
    action: "Action",
    actor: "By",
    change: "Change",
    date: "Date",
    system: "System",
    statuses: { approved: "Approved", pending: "Pending", rejected: "Rejected", spam: "Spam", deleted: "Deleted" },
    authorKinds: { authenticated: "Signed in", guest: "Guest" },
    offTitle: "Comments are off",
    offBody: "Readers can comment on articles, and you moderate the conversations here.",
    offNext: "An admin turns them on in the Site settings.",
    actions: { approved: "Approve", rejected: "Reject", spam: "Mark spam", deleted: "Delete" },
  },
  it: {
    description: "Revisiona conversazioni, segnalazioni e registro immutabile di moderazione.",
    status: "Stato",
    allStatuses: "Tutti gli stati",
    empty: "Nessun commento corrisponde a questa vista",
    reason: "Motivazione obbligatoria",
    reports: "Segnalazioni",
    noDetails: "Nessun dettaglio aggiuntivo",
    next: "Pagina successiva",
    audit: "Audit moderazione recente",
    action: "Azione",
    actor: "Da",
    change: "Modifica",
    date: "Data",
    system: "Sistema",
    statuses: { approved: "Approvato", pending: "In attesa", rejected: "Rifiutato", spam: "Spam", deleted: "Eliminato" },
    authorKinds: { authenticated: "Registrato", guest: "Ospite" },
    offTitle: "I commenti sono disattivati",
    offBody: "I lettori possono commentare gli articoli e qui moderi le conversazioni.",
    offNext: "Un amministratore li attiva nelle Impostazioni del sito.",
    actions: { approved: "Approva", rejected: "Rifiuta", spam: "Segna spam", deleted: "Elimina" },
  },
} as const;

const statusTone: Record<string, BadgeTone> = {
  approved: "success",
  pending: "warning",
  rejected: "danger",
  spam: "danger",
  deleted: "neutral",
};

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
  const { studio } = getMessages(locale);
  const title = studio.comments;
  const service = createMutationCommentService();

  if (!service) {
    return (
      <>
        <PageHead description={labels.description} title={title} />
        <OffNote body={labels.offBody} next={labels.offNext} title={labels.offTitle} />
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
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

  return (
    <>
      <PageHead description={labels.description} title={title} />

      <form className="studio-toolbar" method="get">
        <select aria-label={labels.status} className="studio-control" defaultValue={status ?? ""} name="status">
          <option value="">{labels.allStatuses}</option>
          {moderationQueueStatuses.map((item) => <option key={item} value={item}>{labels.statuses[item]}</option>)}
        </select>
        <input name="locale" type="hidden" value={locale} />
        <button className="button button--quiet" type="submit">{studio.apply}</button>
      </form>

      {page.items.length ? (
        <section className="studio-feed" aria-label={title}>
          {page.items.map((comment) => (
            <article key={comment.id}>
              <div className="studio-feed__head">
                <strong>{comment.displayName}</strong>
                <Badge tone={statusTone[comment.status] ?? "neutral"}>{labels.statuses[comment.status as keyof typeof labels.statuses]}</Badge>
                <span className="studio-meta">
                  <span>{labels.authorKinds[comment.authorKind]}</span>
                  <time dateTime={comment.createdAt}>{when.format(new Date(comment.createdAt))} UTC</time>
                  {comment.reportCount ? <span>{comment.reportCount} {labels.reports.toLowerCase()}</span> : null}
                </span>
              </div>
              <p className="studio-text">{comment.body}</p>
              {reports.get(comment.id)?.length ? (
                <div className="studio-quote">
                  {reports.get(comment.id)?.map((report) => (
                    <p key={report.id}><strong>{report.reason}</strong> · {report.details || labels.noDetails}</p>
                  ))}
                </div>
              ) : null}
              <form action={moderateCommentAction} className="studio-inline">
                <input name="id" type="hidden" value={comment.id} />
                <input name="locale" type="hidden" value={locale} />
                <label className="studio-inline__reason">
                  <span className="sr-only">{labels.reason}</span>
                  <input className="studio-control" maxLength={500} minLength={2} name="reason" placeholder={labels.reason} required />
                </label>
                {moderationTargetStatuses.map((target) => (
                  <button
                    className={target === "deleted" ? "button button--small button--danger" : "button button--small button--quiet"}
                    key={target}
                    name="status"
                    type="submit"
                    value={target}
                  >
                    {labels.actions[target]}
                  </button>
                ))}
              </form>
            </article>
          ))}
        </section>
      ) : (
        <div className="empty-state"><h2>{labels.empty}</h2></div>
      )}

      {page.nextCursor ? (
        <div>
          <Link className="button button--quiet" href={`/${locale}/studio/comments?status=${status ?? ""}&cursor=${encodeURIComponent(page.nextCursor)}`}>{labels.next}</Link>
        </div>
      ) : null}

      <section className="studio-stack" aria-labelledby="comment-audit-title">
        <h2 className="studio-section__title" id="comment-audit-title">{labels.audit}</h2>
        <div className="studio-table-wrap">
          <table className="studio-table">
            <thead>
              <tr>
                <th>{labels.action}</th>
                <th>{labels.actor}</th>
                <th>{labels.change}</th>
                <th>{labels.date}</th>
              </tr>
            </thead>
            <tbody>
              {audit.items.map((event) => (
                <tr key={event.id}>
                  <td className="studio-table__main">
                    <div className="studio-cell">
                      <strong>{sentenceCase(event.action.replaceAll("_", " "))}</strong>
                      {event.reason ? <small>{event.reason}</small> : null}
                    </div>
                  </td>
                  <td data-label={labels.actor}>{event.actorLabel || labels.system}</td>
                  <td data-label={labels.change}>{event.previousStatus ? labels.statuses[event.previousStatus as keyof typeof labels.statuses] ?? event.previousStatus : "—"} → {event.nextStatus ? labels.statuses[event.nextStatus as keyof typeof labels.statuses] ?? event.nextStatus : "—"}</td>
                  <td data-label={labels.date}>
                    <time dateTime={event.createdAt}>{when.format(new Date(event.createdAt))} UTC</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
