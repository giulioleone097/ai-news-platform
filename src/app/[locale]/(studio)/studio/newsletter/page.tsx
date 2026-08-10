import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight, Download, Mail, Search, Send, Users } from "lucide-react";
import { studioSupplementalCopy } from "@/components/studio/studio-copy";
import { getMessages, isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import {
  newsletterStatuses,
  type NewsletterStatus,
} from "@/modules/editorial/domain/editorial-operations";
import { getStudioEditorialRepositories } from "@/modules/editorial/infrastructure/container";
import { updateNewsletterSubscriptionAction } from "../actions";
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
  const copy = studioSupplementalCopy[locale];
  const firstResult = subscriptions.total ? subscriptions.offset + 1 : 0;
  const lastResult = subscriptions.offset + subscriptions.items.length;

  return (
    <>
      <header className="studio-page-header">
        <div>
          <p className="studio-kicker">{messages.studio.newsletter}</p>
          <h1>{copy.newsletterTitle}</h1>
          <p>{copy.newsletterDescription}</p>
        </div>
        <div className="studio-editor__actions">
          <Link className="studio-button studio-button--primary" href={`/${locale}/studio/newsletter/campaigns`}>
            <Send aria-hidden="true" size={16} />
            {copy.campaigns}
          </Link>
          <Link className="studio-button studio-button--secondary" href={`/${locale}/studio/newsletter/export`}>
            <Download aria-hidden="true" size={16} />
            {copy.exportAudience}
          </Link>
        </div>
      </header>

      {search.updated ? (
        <p className="studio-alert studio-alert--success" role="status">{copy.subscriberUpdated}</p>
      ) : null}
      {search.confirmation ? (
        <p className="studio-alert studio-alert--success" role="status">{copy.confirmationRequested}</p>
      ) : null}
      {search.error === "confirmation" ? (
        <p className="studio-alert studio-alert--error" role="alert">{copy.confirmationFailed}</p>
      ) : null}

      <section className="studio-newsletter-metrics" aria-label={copy.newsletterTitle}>
        <article>
          <span className="studio-capability-card__icon" aria-hidden="true"><Users size={24} /></span>
          <strong>{allSubscriptions.total}</strong>
          <p>{copy.allSubscribers}</p>
        </article>
        <article>
          <span className="studio-capability-card__icon" aria-hidden="true"><Mail size={24} /></span>
          <strong>{activeSubscriptions.total}</strong>
          <p>{copy.activeSubscribers}</p>
        </article>
      </section>

      <form className="studio-audience-filter" method="get">
        <label>
          <span className="sr-only">{copy.subscriberSearch}</span>
          <Search aria-hidden="true" size={18} />
          <input defaultValue={query} name="q" placeholder={copy.subscriberSearch} type="search" />
        </label>
        <select aria-label={copy.distributionStatus} defaultValue={status ?? ""} name="status">
          <option value="">{copy.allSubscribers}</option>
          <option value="active">{copy.activeSubscribers}</option>
          <option value="unsubscribed">{copy.unsubscribedSubscribers}</option>
        </select>
        <button className="studio-button studio-button--secondary" type="submit">{messages.search.submit}</button>
      </form>

      {subscriptions.items.length ? (
        <section className="studio-audience-list" aria-label={copy.newsletterTitle}>
          {subscriptions.items.map((subscription) => {
            return (
              <article key={subscription.id}>
                <div className="studio-audience-list__identity">
                  <strong>{subscription.email}</strong>
                  <span className={`studio-status studio-status--${subscription.status}`}>{subscription.status}</span>
                </div>
                <dl>
                  <div><dt>{copy.sourceLabel}</dt><dd>{subscription.source}</dd></div>
                  <div>
                    <dt>{copy.consentedLabel}</dt>
                    <dd><time dateTime={subscription.consentedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(subscription.consentedAt))}</time></dd>
                  </div>
                </dl>
                {subscription.status === "active" ? (
                  <form action={updateNewsletterSubscriptionAction}>
                    <input name="id" type="hidden" value={subscription.id} />
                    <input name="locale" type="hidden" value={locale} />
                    <input name="status" type="hidden" value="unsubscribed" />
                    <button className="studio-button studio-button--secondary" type="submit">{copy.unsubscribe}</button>
                  </form>
                ) : (
                  <form action={requestNewsletterReconfirmationAction}>
                    <input name="email" type="hidden" value={subscription.email} />
                    <input name="locale" type="hidden" value={locale} />
                    <button className="studio-button studio-button--secondary" type="submit">{copy.reactivate}</button>
                  </form>
                )}
              </article>
            );
          })}
        </section>
      ) : (
        <div className="studio-empty-state"><Mail aria-hidden="true" size={28} /><h2>{copy.noSubscribers}</h2></div>
      )}

      {subscriptions.total ? (
        <nav aria-label={copy.audiencePagination} className="studio-audience-pagination">
          <p>{copy.showingSubscribers} {firstResult}–{lastResult} / {subscriptions.total}</p>
          <div>
            {currentPage > 1 ? (
              <Link className="studio-button studio-button--secondary" href={pageHref(locale, query, status, currentPage - 1)}>
                <ArrowLeft aria-hidden="true" size={15} /> {copy.previousPage}
              </Link>
            ) : null}
            {subscriptions.hasMore ? (
              <Link className="studio-button studio-button--secondary" href={pageHref(locale, query, status, currentPage + 1)}>
                {copy.nextPage} <ArrowRight aria-hidden="true" size={15} />
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}

      <aside className="studio-boundary-note">
        <span>CONSENT / EXPORT</span>
        <p>{copy.newsletterBoundary}</p>
        <Link href={`/${locale}`} target="_blank">
          {copy.openBriefing}
          <ArrowUpRight aria-hidden="true" size={14} />
        </Link>
      </aside>
    </>
  );
}
