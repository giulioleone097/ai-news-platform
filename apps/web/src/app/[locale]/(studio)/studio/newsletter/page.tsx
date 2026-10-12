import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Search, Send } from "lucide-react";
import { Badge } from "@/components/studio/badge";
import { Note } from "@/components/studio/note";
import { PageHead } from "@/components/studio/page-head";
import { Pagination } from "@/components/studio/pagination";
import { studioSupplementalCopy } from "@/components/studio/studio-copy";
import { plural } from "@/components/studio/studio-format";
import { getMessages, isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import {
  newsletterEditorActions,
  newsletterStatuses,
  type NewsletterStatus,
} from "@atlasnews/core/editorial/domain/editorial-operations";
import { getStudioEditorialRepositories } from "@/server/composition";
import { updateNewsletterSubscriptionAction } from "../actions";
import { subscriberStatusLabels, subscriberStatusTone, suppressedHint } from "./subscriber-status";
import { requestNewsletterReconfirmationAction } from "./subscription-actions";

export const metadata: Metadata = { robots: { index: false } };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(locale: string, query: string | undefined, status: NewsletterStatus | undefined, page: number) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (status) params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return `/${locale}/studio/newsletter${search ? `?${search}` : ""}`;
}

export default async function StudioNewsletterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, search] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();

  await requireEditor(locale);
  const repositories = await getStudioEditorialRepositories();
  const query = first(search.q)?.trim().slice(0, 120) || undefined;
  const requestedStatus = first(search.status);
  const status = newsletterStatuses.includes(requestedStatus as NewsletterStatus)
    ? requestedStatus as NewsletterStatus
    : undefined;
  const parsedPage = Number.parseInt(first(search.page) ?? "1", 10);
  const currentPage = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const pageSize = 50;
  const [subscriptions, allSubscriptions, activeSubscriptions] = await Promise.all([
    repositories.newsletter.listSubscriptions({
      locale,
      query,
      status,
      limit: pageSize,
      offset: (currentPage - 1) * pageSize,
    }),
    repositories.newsletter.listSubscriptions({ locale, limit: 1 }),
    repositories.newsletter.listSubscriptions({ locale, status: "active", limit: 1 }),
  ]);
  const messages = getMessages(locale);
  const statusLabels = subscriberStatusLabels[locale];
  const copy = studioSupplementalCopy[locale];
  const firstResult = subscriptions.total ? subscriptions.offset + 1 : 0;
  const lastResult = subscriptions.offset + subscriptions.items.length;

  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  // One quiet line of the figures that are not zero.
  const summary = [
    allSubscriptions.total ? plural(locale, messages.studio.counts.subscribers, allSubscriptions.total) : "",
    activeSubscriptions.total ? copy.activeSubscribers.replace("{count}", String(activeSubscriptions.total)) : "",
  ].filter(Boolean).join(", ");

  return (
    <>
      <PageHead description={copy.newsletterDescription} scope={messages.studio.scope.newsletter} title={messages.studio.newsletter}>
        <Link className="button button--quiet" href={`/${locale}/studio/newsletter/export`}>
          <Download aria-hidden="true" />
          {copy.exportAudience}
        </Link>
        <Link className="button button--quiet" href={`/${locale}/studio/newsletter/campaigns`}>
          <Send aria-hidden="true" />
          {copy.campaigns}
        </Link>
      </PageHead>

      {search.updated ? <Note tone="success">{copy.subscriberUpdated}</Note> : null}
      {search.confirmation ? <Note tone="success">{copy.confirmationRequested}</Note> : null}
      {search.error === "confirmation" ? <Note tone="error">{copy.confirmationFailed}</Note> : null}

      {summary ? <p className="studio-muted">{summary}</p> : null}

      <section className="studio-stack" aria-label={messages.studio.newsletter}>
        {allSubscriptions.total || query || status ? (
          <form className="studio-toolbar" method="get">
            <label className="studio-search">
              <span className="sr-only">{copy.subscriberSearch}</span>
              <Search aria-hidden="true" size={16} />
              <input className="studio-control" defaultValue={query} name="q" placeholder={copy.subscriberSearch} type="search" />
            </label>
            <select aria-label={messages.studio.statusLabel} className="studio-control" defaultValue={status ?? ""} name="status">
              <option value="">{copy.allSubscribers}</option>
              {newsletterStatuses.map((value) => (
                <option key={value} value={value}>{statusLabels[value]}</option>
              ))}
            </select>
            <button className="button button--quiet" type="submit">{messages.studio.apply}</button>
          </form>
        ) : null}

        {subscriptions.items.length ? (
          <div className="studio-table-wrap">
            <table className="studio-table">
              <thead>
                <tr>
                  <th>{copy.emailLabel}</th>
                  <th>{messages.studio.statusLabel}</th>
                  <th>{copy.sourceLabel}</th>
                  <th>{copy.consentedLabel}</th>
                  <th>
                    <span className="sr-only">{messages.studio.actionsLabel}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.items.map((subscription) => {
                  const actions = newsletterEditorActions(subscription.status);
                  return (
                    <tr key={subscription.id}>
                      <td className="studio-table__main">
                        <div className="studio-cell">
                          <strong>{subscription.email}</strong>
                          {subscription.status === "suppressed" ? <small>{suppressedHint[locale]}</small> : null}
                        </div>
                      </td>
                      <td data-label={messages.studio.statusLabel}>
                        <Badge tone={subscriberStatusTone[subscription.status]}>{statusLabels[subscription.status]}</Badge>
                      </td>
                      <td data-label={copy.sourceLabel}>{subscription.source}</td>
                      <td data-label={copy.consentedLabel}>
                        <time dateTime={subscription.consentedAt}>{when.format(new Date(subscription.consentedAt))}</time>
                      </td>
                      <td className="studio-table__actions">
                        <span className="studio-actions">
                          {actions.includes("unsubscribe") ? (
                            <form action={updateNewsletterSubscriptionAction}>
                              <input name="id" type="hidden" value={subscription.id} />
                              <input name="locale" type="hidden" value={locale} />
                              <input name="status" type="hidden" value="unsubscribed" />
                              <button className="button button--small button--quiet" type="submit">{copy.unsubscribe}</button>
                            </form>
                          ) : null}
                          {actions.includes("reconfirm") ? (
                            <form action={requestNewsletterReconfirmationAction}>
                              <input name="email" type="hidden" value={subscription.email} />
                              <input name="locale" type="hidden" value={locale} />
                              <button className="button button--small button--quiet" type="submit">{copy.reactivate}</button>
                            </form>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : query || status ? (
          <div className="empty-state">
            <h2>{copy.noSubscribers}</h2>
          </div>
        ) : (
          <div className="empty-state">
            <h2>{copy.noSubscribersYet}</h2>
            <Link className="button button--quiet" href={`/${locale}#newsletter`} target="_blank">
              {copy.openBriefing}
            </Link>
          </div>
        )}

        <Pagination
          copy={messages.studio.pagination}
          from={firstResult}
          nextHref={subscriptions.hasMore ? pageHref(locale, query, status, currentPage + 1) : undefined}
          previousHref={currentPage > 1 ? pageHref(locale, query, status, currentPage - 1) : undefined}
          to={lastResult}
          total={subscriptions.total}
        />
      </section>
    </>
  );
}
