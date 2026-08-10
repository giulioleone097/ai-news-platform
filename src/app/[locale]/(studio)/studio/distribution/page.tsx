import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  RotateCcw,
  Send,
  ShieldAlert,
} from "lucide-react";
import { getMessages, isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { getStudioEditorialRepositories } from "@/modules/editorial/infrastructure/container";
import {
  isSocialProvider,
} from "@/modules/social-publishing/application/validation";
import {
  publicSocialOutboxJob,
  socialOutboxStatuses,
  socialProviders,
  type SocialOutboxJob,
  type SocialOutboxStatus,
  type SocialProvider,
} from "@/modules/social-publishing/domain/social-publication";
import { createSocialPublishingRuntime } from "@/modules/social-publishing/infrastructure/runtime";
import { socialDistributionCopy } from "./copy";
import styles from "./distribution.module.css";
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

function statusIcon(status: SocialOutboxStatus) {
  if (status === "sent") return CheckCircle2;
  if (status === "failed") return ShieldAlert;
  if (status === "cancelled") return RotateCcw;
  return Clock3;
}

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

  return (
    <>
      <header className={`studio-page-header ${styles.hero}`}>
        <div>
          <p className="studio-kicker">{messages.studio.distribution}</p>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
        <div className={`${styles.connection} ${queueAvailable ? styles.connectionReady : styles.connectionOffline}`}>
          <DatabaseZap aria-hidden="true" size={18} />
          <span>{queueAvailable ? copy.configured : copy.unavailable}</span>
        </div>
      </header>

      {queueUpdated === "cancel" ? (
        <p className="studio-alert studio-alert--success" role="status">{copy.cancelled}</p>
      ) : queueUpdated === "retry" ? (
        <p className="studio-alert studio-alert--success" role="status">{copy.retried}</p>
      ) : queueError ? (
        <p className="studio-alert studio-alert--error" role="alert">{copy.mutationError}</p>
      ) : null}

      {queueAvailable && configuredProviders.length ? (
        <SocialComposer
          configuredProviders={configuredProviders}
          copy={copy}
          publications={composerPublications}
        />
      ) : (
        <section className={styles.unavailable} role="status">
          <ShieldAlert aria-hidden="true" size={24} />
          <div>
            <strong>{copy.unavailable}</strong>
            <p>{copy.composerDescription}</p>
          </div>
        </section>
      )}

      <section className={styles.queue} aria-labelledby="social-queue-title">
        <div className={styles.sectionHeading}>
          <span className={styles.sectionNumber}>02</span>
          <div>
            <h2 id="social-queue-title">{copy.queueTitle}</h2>
            <p>{copy.queueDescription}</p>
          </div>
        </div>

        <form className={styles.filters} method="get">
          <label>
            <span>{copy.channel}</span>
            <select defaultValue={provider ?? ""} name="provider">
              <option value="">{copy.allProviders}</option>
              {socialProviders.map((candidate) => (
                <option key={candidate} value={candidate}>{candidate === "x" ? "X" : candidate[0].toUpperCase() + candidate.slice(1)}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{copy.delivery}</span>
            <select defaultValue={status ?? ""} name="status">
              <option value="">{copy.allStatuses}</option>
              {socialOutboxStatuses.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
            </select>
          </label>
          <button className="studio-button studio-button--secondary" type="submit">{copy.filter}</button>
        </form>

        {jobs.length ? (
          <div className={styles.queueList}>
            {jobs.map((job) => {
              const publication = publicationById.get(job.publicationId)!;
              const StatusIcon = statusIcon(job.status);
              const providerUrl = safeProviderUrl(job.provider, job.providerUrl);
              return (
                <article className={styles.queueCard} key={job.id}>
                  <div className={styles.queueCardTop}>
                    <span className={styles.providerBadge}>{job.provider === "x" ? "X" : job.provider}</span>
                    <span className={`${styles.statusBadge} ${styles[`status_${job.status}`]}`}>
                      <StatusIcon aria-hidden="true" size={13} />{job.status}
                    </span>
                  </div>
                  <div className={styles.queueCardBody}>
                    <div>
                      <h3>{publication.articleTitle}</h3>
                      <Link href={`/${locale}/studio/articles/${publication.articleId}`}>
                        {messages.studio.articles}<ArrowUpRight aria-hidden="true" size={13} />
                      </Link>
                    </div>
                    <dl>
                      <div><dt>{copy.scheduledAt}</dt><dd>{formatUtc(job.availableAt, locale)}</dd></div>
                      <div><dt>{copy.attempted}</dt><dd>{job.attempts}/{job.maxAttempts}</dd></div>
                      <div><dt>{copy.delivery}</dt><dd>{job.providerStatus ?? job.lastErrorCode ?? "—"}</dd></div>
                    </dl>
                  </div>
                  <footer className={styles.queueCardFooter}>
                    {providerUrl ? (
                      <a href={providerUrl} rel="noopener noreferrer" target="_blank">
                        {copy.openPost}<ArrowUpRight aria-hidden="true" size={13} />
                      </a>
                    ) : <span />}
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
                  </footer>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyQueue}>
            <Send aria-hidden="true" size={25} />
            <strong>{copy.emptyQueue}</strong>
          </div>
        )}
        <p className={styles.limitNote}>{copy.latestLimit}</p>
      </section>
    </>
  );
}
