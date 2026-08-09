import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Send } from "lucide-react";
import { studioSupplementalCopy } from "@/components/studio/studio-copy";
import { getMessages, isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { toUtcDateTimeInput } from "@/lib/editorial-datetime";
import { socialChannels } from "@/modules/editorial/domain/article";
import { distributionStatuses } from "@/modules/editorial/domain/editorial-operations";
import { getStudioEditorialRepositories } from "@/modules/editorial/infrastructure/container";
import { updateDistributionAction } from "../actions";

export const metadata: Metadata = { robots: { index: false } };

export default async function StudioDistributionPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();

  await requireEditor(locale);
  const repositories = await getStudioEditorialRepositories();
  const publications = await repositories.distribution.listPublications(locale);
  const messages = getMessages(locale);
  const copy = studioSupplementalCopy[locale];

  return (
    <>
      <header className="studio-page-header">
        <div>
          <p className="studio-kicker">{messages.studio.distribution}</p>
          <h1>{copy.distributionTitle}</h1>
          <p>{copy.distributionDescription}</p>
        </div>
      </header>

      {query.updated ? (
        <p className="studio-alert studio-alert--success" role="status">{copy.distributionUpdated}</p>
      ) : query.error ? (
        <p className="studio-alert studio-alert--error" role="alert">{copy.distributionError}</p>
      ) : null}

      <section className="studio-channel-metrics" aria-label={copy.distributionTitle}>
        {socialChannels.map((channel, index) => {
          const count = publications.filter((item) => item.channel === channel).length;
          return (
            <article key={channel}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{count}</strong>
              <p>{channel}</p>
              <small>{copy.readyItems}</small>
            </article>
          );
        })}
      </section>

      {publications.length ? (
        <section className="studio-distribution-board" aria-label={copy.distributionTitle}>
          {publications.map((publication) => (
            <form action={updateDistributionAction} className="studio-distribution-card" key={publication.id}>
              <input name="id" type="hidden" value={publication.id} />
              <input name="locale" type="hidden" value={locale} />
              <div className="studio-distribution-card__header">
                <div>
                  <span className="studio-channel-pill">{publication.channel}</span>
                  <h2>{publication.articleTitle}</h2>
                </div>
                <Link href={`/${locale}/studio/articles/${publication.articleId}`}>
                  {copy.editStory}
                  <ArrowUpRight aria-hidden="true" size={15} />
                </Link>
              </div>
              <div className="studio-distribution-card__fields">
                <label className="studio-field">
                  <span>{copy.distributionStatus}</span>
                  <select defaultValue={publication.status} name="status">
                    {distributionStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
                <label className="studio-field">
                  <span>{copy.distributionSchedule} (UTC)</span>
                  <input defaultValue={toUtcDateTimeInput(publication.scheduledFor)} name="scheduledFor" type="datetime-local" />
                </label>
                <label className="studio-field studio-distribution-card__message">
                  <span>{copy.distributionMessage}</span>
                  <textarea defaultValue={publication.message} maxLength={1_000} name="message" rows={3} />
                </label>
                <label className="studio-field studio-distribution-card__url">
                  <span>{copy.distributionUrl}</span>
                  <input defaultValue={publication.externalUrl ?? ""} inputMode="url" name="externalUrl" placeholder="https://" type="url" />
                </label>
              </div>
              <div className="studio-distribution-card__footer">
                <span className={`studio-status studio-status--${publication.status}`}>{publication.status}</span>
                {publication.externalUrl ? (
                  <a href={publication.externalUrl} rel="noreferrer" target="_blank">
                    {copy.openPublication}
                    <ArrowUpRight aria-hidden="true" size={14} />
                  </a>
                ) : <span />}
                <button className="studio-button studio-button--primary" type="submit">{copy.saveDistribution}</button>
              </div>
            </form>
          ))}
        </section>
      ) : (
        <div className="studio-empty-state">
          <Send aria-hidden="true" size={28} />
          <h2>{copy.noDistribution}</h2>
          <Link className="studio-button studio-button--primary" href={`/${locale}/studio/articles`}>
            {messages.studio.articles}
          </Link>
        </div>
      )}
    </>
  );
}
