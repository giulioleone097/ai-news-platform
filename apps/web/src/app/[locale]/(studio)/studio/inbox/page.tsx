import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail } from "lucide-react";
import { loadInbox, parseInboxStatus } from "@/components/studio/inbox/inbox-data";
import { MessageDeleteButton } from "@/components/studio/inbox/message-delete-button";
import { Badge, type BadgeTone } from "@/components/studio/badge";
import { Note, OffNote } from "@/components/studio/note";
import { PageHead } from "@/components/studio/page-head";
import { StudioSubmitButton } from "@/components/studio/studio-submit-button";
import { getMessages, isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { contactMessageStatuses } from "@atlasnews/core/support/domain/contact-message";
import { setContactStatusAction } from "./actions";
import { inboxCopy } from "./copy";

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = "force-dynamic";

const statusTone: Record<string, BadgeTone> = { new: "warning", handled: "success", archived: "neutral" };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function StudioInboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, search] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();

  await requireEditor(locale);
  const copy = inboxCopy[locale];
  const status = parseInboxStatus(first(search.status));
  const cursor = first(search.cursor)?.slice(0, 512) || undefined;
  const inbox = await loadInbox({ status, cursor });
  const base = `/${locale}/studio/inbox`;
  const href = (next?: { status?: string; cursor?: string | null }) => {
    const query = new URLSearchParams();
    if (next?.status) query.set("status", next.status);
    if (next?.cursor) query.set("cursor", next.cursor);
    return query.size ? `${base}?${query}` : base;
  };
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
  const title = getMessages(locale).studio.inbox;

  if (!inbox.ok && inbox.reason === "unavailable") {
    return (
      <>
        <PageHead description={copy.description} title={title} />
        <OffNote body={copy.offBody} next={copy.offNext} title={copy.offTitle} />
      </>
    );
  }

  return (
    <>
      <PageHead description={copy.description} title={title} />

      {search.updated ? <Note tone="success">{copy.updated}</Note> : null}
      {search.deleted ? <Note tone="success">{copy.deleted}</Note> : null}
      {search.error ? <Note tone="error">{copy.failed}</Note> : null}

      <nav aria-label={copy.filterLabel} className="studio-segmented">
        <Link aria-current={status ? undefined : "page"} href={href()}>{copy.all}</Link>
        {contactMessageStatuses.map((value) => (
          <Link aria-current={status === value ? "page" : undefined} href={href({ status: value })} key={value}>
            {copy.statuses[value]}
            {value === "new" && inbox.ok && inbox.newCount ? <span>({inbox.newCount})</span> : null}
          </Link>
        ))}
      </nav>

      {!inbox.ok ? (
        <Note tone="error">{copy.loadError}</Note>
      ) : inbox.page.items.length ? (
        <>
          <p className="sr-only">{copy.untrusted}</p>
          <section aria-label={title} className="studio-feed">
            {inbox.page.items.map((message) => (
              <article aria-labelledby={`message-${message.id}`} key={message.id}>
                <div className="studio-feed__head">
                  <h2 id={`message-${message.id}`}>{message.subject}</h2>
                  <Badge tone={statusTone[message.status] ?? "neutral"}>{copy.statuses[message.status]}</Badge>
                </div>
                <dl className="studio-meta">
                  <div>
                    <dt className="sr-only">{copy.from}</dt>
                    <dd>{message.name} · <a href={`mailto:${message.email}`}>{message.email}</a></dd>
                  </div>
                  <div>
                    <dt className="sr-only">{copy.language}</dt>
                    <dd>{message.locale.toUpperCase()}</dd>
                  </div>
                  <div>
                    <dt className="sr-only">{copy.received}</dt>
                    <dd><time dateTime={message.createdAt}>{when.format(new Date(message.createdAt))} UTC</time></dd>
                  </div>
                </dl>
                <p className="studio-text">{message.body}</p>
                <div className="studio-inline">
                  <a
                    className="button button--small button--quiet"
                    href={`mailto:${message.email}?subject=${encodeURIComponent(`Re: ${message.subject}`)}`}
                  >
                    <Mail aria-hidden="true" />
                    {copy.reply}
                  </a>
                  {contactMessageStatuses.filter((next) => next !== message.status).map((next) => (
                    <form action={setContactStatusAction} key={next}>
                      <input name="locale" type="hidden" value={locale} />
                      <input name="id" type="hidden" value={message.id} />
                      <input name="status" type="hidden" value={next} />
                      {status ? <input name="filter" type="hidden" value={status} /> : null}
                      <StudioSubmitButton
                        ariaLabel={`${copy.actions[next]}: ${message.subject}`}
                        className="button button--small button--quiet"
                        idleLabel={copy.actions[next]}
                        pendingLabel={copy.actions[next]}
                      />
                    </form>
                  ))}
                  <MessageDeleteButton filter={status} id={message.id} locale={locale} subject={message.subject} />
                </div>
              </article>
            ))}
          </section>
          {inbox.page.nextCursor ? (
            <div>
              <Link className="button button--quiet" href={href({ status, cursor: inbox.page.nextCursor })}>
                {copy.older}
              </Link>
            </div>
          ) : null}
        </>
      ) : (
        <div className="empty-state">
          <h2>{copy.empty}</h2>
          <p>{copy.emptyDescription}</p>
        </div>
      )}
    </>
  );
}
