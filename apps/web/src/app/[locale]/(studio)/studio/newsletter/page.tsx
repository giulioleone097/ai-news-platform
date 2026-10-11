import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Download, Search, Send } from "lucide-react";
import { Badge } from "@/components/studio/badge";
import { Note } from "@/components/studio/note";
import { PageHead } from "@/components/studio/page-head";
import { studioSupplementalCopy } from "@/components/studio/studio-copy";
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
  const stats = [
    { label: copy.totalSubscribers, value: allSubscriptions.total },
    { label: copy.activeSubscribers, value: activeSubscriptions.total },
  ];

  return (
    <>
      <PageHead description={copy.newsletterDescription} title={messages.studio.newsletter}>
        <Link className="button button--quiet" href={`/${locale}/studio/newsletter/export`}>
          <Download aria-hidden="true" />
          {copy.exportAudience}
        </Link>
        <Link className="button button--primary" href={`/${locale}/studio/newsletter/campaigns`}>
          <Send aria-hidden="true" />
          {copy.campaigns}
        </Link>
      </PageHead>

      {search.updated ? <Note tone="success">{copy.subscriberUpdated}</Note> : null}
      {search.confirmation ? <Note tone="success">{copy.confirmationRequested}</Note> : null}
      {search.error === "confirmation" ? <Note tone="error">{copy.confirmationFailed}</Note> : null}

      <dl aria-label={copy.newsletterTitle} className="studio-stats">
        {stats.map((stat) => (
          <div data-zero={stat.value === 0} key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>

      <section className="studio-stack" aria-label={copy.newsletterTitle}>
        <form className="studio-toolbar" method="get">
          <label className="studio-search">
            <span className="sr-only">{copy.subscriberSearch}</span>
            <Search aria-hidden="true" size={16} />
            <input className="studio-control" defaultValue={query} name="q" placeholder={copy.subscriberSearch} type="search" />
          </label>
          <select aria-label={copy.distributionStatus} className="studio-control" defaultValue={status ?? ""} name="status">
            <option value="">{copy.allSubscribers}</option>
            {newsletterStatuses.map((value) => (
              <option key={value} value={value}>{statusLabels[value]}</option>
            ))}
          </select>
          <button className="button button--quiet" type="submit">{messages.search.submit}</button>
        </form>

        {subscriptions.items.length ? (
          <div className="studio-table-wrap">
            <table className="studio-table">
              <thead>
                <tr>
                  <th>Email</th>
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
        ) : (
          <div className="empty-state">
            <h2>{copy.noSubscribers}</h2>
          </div>
        )}

        {subscriptions.total ? (
          <nav aria-label={copy.audiencePagination} className="studio-pagination">
            <p>{copy.showingSubscribers} {firstResult}–{lastResult} / {subscriptions.total}</p>
            <div>
              {currentPage > 1 ? (
                <Link className="button button--small button--quiet" href={pageHref(locale, query, status, currentPage - 1)}>
                  <ArrowLeft aria-hidden="true" /> {copy.previousPage}
                </Link>
              ) : null}
              {subscriptions.hasMore ? (
                <Link className="button button--small button--quiet" href={pageHref(locale, query, status, currentPage + 1)}>
                  {copy.nextPage} <ArrowRight aria-hidden="true" />
                </Link>
              ) : null}
            </div>
          </nav>
        ) : null}
      </section>

      <Note>
        {copy.newsletterBoundary}{" "}
        <Link href={`/${locale}`} target="_blank">
          {copy.openBriefing}
        </Link>
      </Note>
    </>
  );
}
