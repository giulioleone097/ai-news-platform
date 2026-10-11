import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Inbox, Mail } from "lucide-react";
import { loadInbox, parseInboxStatus } from "@/components/studio/inbox/inbox-data";
import { MessageDeleteButton } from "@/components/studio/inbox/message-delete-button";
import styles from "@/components/studio/inbox/inbox.module.css";
import { StudioSubmitButton } from "@/components/studio/studio-submit-button";
import { isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { contactMessageStatuses } from "@atlasnews/core/support/domain/contact-message";
import { setContactStatusAction } from "./actions";
import { inboxCopy } from "./copy";

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = "force-dynamic";

const statusTone = { new: "review", handled: "published", archived: "unsubscribed" } as const;

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

  return (
    <>
      <header className="studio-page-header">
        <div>
          <p className="studio-kicker">{copy.kicker}</p>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
      </header>

      {search.updated ? <p className="studio-alert studio-alert--success" role="status">{copy.updated}</p> : null}
      {search.deleted ? <p className="studio-alert studio-alert--success" role="status">{copy.deleted}</p> : null}
      {search.error ? <p className="studio-alert studio-alert--error" role="alert">{copy.failed}</p> : null}

      <nav aria-label={copy.filterLabel} className={styles.filters}>
        <Link aria-current={status ? undefined : "page"} href={href()}>{copy.all}</Link>
        {contactMessageStatuses.map((value) => (
          <Link aria-current={status === value ? "page" : undefined} href={href({ status: value })} key={value}>
            {copy.statuses[value]}
            {value === "new" && inbox.ok ? <span className={styles.count}>{inbox.newCount}</span> : null}
          </Link>
        ))}
      </nav>

      {!inbox.ok ? (
        <p className="studio-alert studio-alert--error" role="alert">
          {inbox.reason === "unavailable" ? copy.unavailable : copy.loadError}
        </p>
      ) : inbox.page.items.length ? (
        <>
          <p className="sr-only">{copy.untrusted}</p>
          <section aria-label={copy.title} className={styles.list}>
            {inbox.page.items.map((message) => (
              <article aria-labelledby={`message-${message.id}`} className={styles.message} key={message.id}>
                <div className={styles.head}>
                  <h2 id={`message-${message.id}`}>{message.subject}</h2>
                  <span className={`studio-status studio-status--${statusTone[message.status]}`}>
                    {copy.statuses[message.status]}
                  </span>
                </div>
                <dl className={styles.meta}>
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
                <p className={styles.body}>{message.body}</p>
                <div className={styles.actions}>
                  <a
                    className="studio-button studio-button--primary"
                    href={`mailto:${message.email}?subject=${encodeURIComponent(`Re: ${message.subject}`)}`}
                  >
                    <Mail aria-hidden="true" size={16} />
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
                        className="studio-button studio-button--secondary"
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
            <div className={styles.more}>
              <Link className="studio-button studio-button--secondary" href={href({ status, cursor: inbox.page.nextCursor })}>
                {copy.older}
              </Link>
            </div>
          ) : null}
        </>
      ) : (
        <div className="studio-empty-state">
          <Inbox aria-hidden="true" size={28} />
          <h2>{copy.empty}</h2>
          <p>{copy.emptyDescription}</p>
        </div>
      )}
    </>
  );
}
