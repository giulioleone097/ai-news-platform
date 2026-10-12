import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/studio/badge";
import { Note, OffNote } from "@/components/studio/note";
import { PageHead } from "@/components/studio/page-head";
import { getMessages, isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { getStudioEditorialRepositories } from "@/server/composition";
import {
  isSocialProvider,
} from "@atlasnews/core/social-publishing/application/validation";
import {
  publicSocialOutboxJob,
  socialOutboxStatuses,
  socialProviders,
  type SocialOutboxJob,
  type SocialOutboxStatus,
  type SocialProvider,
} from "@atlasnews/core/social-publishing/domain/social-publication";
import { createSocialPublishingRuntime } from "@/server/composition";
import { socialDistributionCopy, socialPageCopy } from "./copy";
import { QueueActionButton } from "./queue-action-button";
import { SocialComposer } from "./social-composer";

export const metadata: Metadata = { robots: { index: false } };

function queryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function outboxStatus(value: unknown): SocialOutboxStatus | undefined {
  return typeof value === "string" && socialOutboxStatuses.includes(value as SocialOutboxStatus)
    ? value as SocialOutboxStatus
    : undefined;
}

function safeProviderUrl(provider: SocialProvider, value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const allowed = provider === "linkedin"
      ? url.hostname === "www.linkedin.com"
      : provider === "x" && url.hostname === "x.com";
    return url.protocol === "https:" && allowed ? url.toString() : null;
  } catch {
    return null;
  }
}

function formatUtc(value: string | null, locale: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date) + " UTC";
}

const statusTone: Record<SocialOutboxStatus, BadgeTone> = {
  pending: "info",
  processing: "info",
  sent: "success",
  failed: "danger",
  cancelled: "neutral",
};

const providerLabel = (provider: SocialProvider) =>
  provider === "x" ? "X" : provider === "linkedin" ? "LinkedIn" : "WhatsApp";

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

  const messages = getMessages(locale);
  const copy = socialDistributionCopy[locale];
  const page = socialPageCopy[locale];
  const providerValue = queryValue(query.provider);
  const provider = isSocialProvider(providerValue) ? providerValue : undefined;
  const status = outboxStatus(queryValue(query.status));
  const repositories = await getStudioEditorialRepositories();
  const publicationsPromise = repositories.distribution.listPublications(locale);

  let runtime: ReturnType<typeof createSocialPublishingRuntime> | null = null;
  let queuePromise: Promise<{ items: SocialOutboxJob[]; available: boolean }> = Promise.resolve({
    items: [],
    available: false,
  });
  try {
    runtime = createSocialPublishingRuntime();
    queuePromise = runtime.service
      .list({ limit: 200 })
      .then((result) => ({ items: result.items, available: true }))
      .catch(() => ({ items: [], available: false }));
  } catch {
    runtime = null;
  }

  const [allPublications, queueResult] = await Promise.all([
    publicationsPromise,
    queuePromise,
  ]);
  const socialPublications = allPublications.filter((publication) => isSocialProvider(publication.channel));
  const publicationById = new Map(socialPublications.map((publication) => [publication.id, publication]));
  const ownedJobs = queueResult.items.filter((job) => publicationById.has(job.publicationId));
  const jobs = ownedJobs
    .filter((job) => (!provider || job.provider === provider) && (!status || job.status === status))
    .map(publicSocialOutboxJob);
  const recoverableByPublication = new Map(ownedJobs
    .filter((job) => job.status === "cancelled" || (job.status === "failed" && job.retrySafe))
    .map((job) => [job.publicationId, { id: job.id, expectedRevision: job.revision }]));

  const configuredProviders: SocialProvider[] = [];
  if (runtime) {
    for (const candidate of socialProviders) {
      try {
        runtime.providers.get(candidate);
        configuredProviders.push(candidate);
      } catch {
        // Provider stays unavailable without exposing configuration details.
      }
    }
  }
  const queueAvailable = Boolean(runtime && queueResult.available);
  const composerPublications = socialPublications.map((publication) => ({
    id: publication.id,
    provider: publication.channel as SocialProvider,
    articleTitle: publication.articleTitle,
    defaultText: publication.message || publication.articleTitle,
    recoverableJob: recoverableByPublication.get(publication.id) ?? null,
  }));

  const queueUpdated = queryValue(query.queueUpdated);
  const queueError = queryValue(query.queueError);

  // Off: say so once, with the next step. No composer, filters or queue to look at.
  if (!queueAvailable || !configuredProviders.length) {
    return (
      <>
        <PageHead description={copy.description} scope={messages.studio.scope.social} title={messages.studio.distribution} />
        <OffNote body={page.offBody} next={page.offNext} title={page.offTitle} />
      </>
    );
  }

  return (
    <>
      <PageHead description={copy.description} scope={messages.studio.scope.social} title={messages.studio.distribution} />

      {queueUpdated === "cancel" ? (
        <Note tone="success">{copy.cancelled}</Note>
      ) : queueUpdated === "retry" ? (
        <Note tone="success">{copy.retried}</Note>
      ) : queueError ? (
        <Note tone="error">{copy.mutationError}</Note>
      ) : null}

      <SocialComposer
        configuredProviders={configuredProviders}
        copy={copy}
        publications={composerPublications}
      />

      <section className="studio-stack" aria-labelledby="social-queue-title">
        <div className="studio-section__head">
          <h2 className="studio-section__title" id="social-queue-title">{copy.queueTitle}</h2>
          <p>{copy.queueDescription}</p>
        </div>

        <form className="studio-toolbar" method="get">
          <select aria-label={copy.channel} className="studio-control" defaultValue={provider ?? ""} name="provider">
            <option value="">{copy.allProviders}</option>
            {socialProviders.map((candidate) => (
              <option key={candidate} value={candidate}>{providerLabel(candidate)}</option>
            ))}
          </select>
          <select aria-label={messages.studio.statusLabel} className="studio-control" defaultValue={status ?? ""} name="status">
            <option value="">{copy.allStatuses}</option>
            {socialOutboxStatuses.map((candidate) => <option key={candidate} value={candidate}>{page.statuses[candidate]}</option>)}
          </select>
          <button className="button button--quiet" type="submit">{messages.studio.apply}</button>
        </form>

        {jobs.length ? (
          <div className="studio-table-wrap">
            <table className="studio-table">
              <thead>
                <tr>
                  <th>{copy.story}</th>
                  <th>{copy.channel}</th>
                  <th>{messages.studio.statusLabel}</th>
                  <th>{copy.scheduledAt}</th>
                  <th>{copy.attempted}</th>
                  <th>{copy.delivery}</th>
                  <th>
                    <span className="sr-only">{messages.studio.actionsLabel}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const publication = publicationById.get(job.publicationId)!;
                  const providerUrl = safeProviderUrl(job.provider, job.providerUrl);
                  return (
                    <tr key={job.id}>
                      <td className="studio-table__main">
                        <Link className="studio-cell" href={`/${locale}/studio/articles/${publication.articleId}`}>
                          <strong>{publication.articleTitle}</strong>
                        </Link>
                      </td>
                      <td data-label={copy.channel}>{providerLabel(job.provider)}</td>
                      <td data-label={messages.studio.statusLabel}>
                        <Badge tone={statusTone[job.status]}>{page.statuses[job.status]}</Badge>
                      </td>
                      <td data-label={copy.scheduledAt}>{formatUtc(job.availableAt, locale)}</td>
                      <td data-label={copy.attempted}>{job.attempts}/{job.maxAttempts}</td>
                      <td data-label={copy.delivery}>{job.providerStatus ?? job.lastErrorCode ?? "—"}</td>
                      <td className="studio-table__actions">
                        <span className="studio-actions">
                          {providerUrl ? (
                            <a
                              aria-label={copy.openPost}
                              className="studio-icon-button"
                              href={providerUrl}
                              rel="noopener noreferrer"
                              target="_blank"
                              title={copy.openPost}
                            >
                              <ArrowUpRight aria-hidden="true" />
                            </a>
                          ) : null}
                          {job.status === "pending" ? (
                            <QueueActionButton
                              confirmMessage={copy.cancelConfirm}
                              id={job.id}
                              intent="cancel"
                              label={copy.cancel}
                              locale={locale}
                            />
                          ) : job.status === "failed" && job.retrySafe ? (
                            <QueueActionButton
                              confirmMessage={copy.retryConfirm}
                              id={job.id}
                              intent="retry"
                              label={copy.retry}
                              locale={locale}
                            />
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
            <h2>{copy.emptyQueue}</h2>
          </div>
        )}
        {queueResult.items.length >= 200 ? <p className="studio-muted">{copy.latestLimit}</p> : null}
      </section>
    </>
  );
}
