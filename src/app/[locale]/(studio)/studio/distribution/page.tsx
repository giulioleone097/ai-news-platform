import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Send } from "lucide-react";
import { studioSupplementalCopy } from "@/components/studio/studio-copy";
import { getMessages, isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { socialChannels } from "@/modules/editorial/domain/article";
import { getStudioEditorialRepositories } from "@/modules/editorial/infrastructure/container";

export const metadata: Metadata = { robots: { index: false } };

export default async function StudioDistributionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  await requireEditor(locale);
  const repositories = await getStudioEditorialRepositories();
  const articles = await repositories.articles.listForStudio(locale);
  const messages = getMessages(locale);
  const copy = studioSupplementalCopy[locale];
  const queued = articles.flatMap((article) =>
    article.distribution.map((channel) => ({ article, channel })),
  );

  return (
    <>
      <header className="studio-page-header">
        <div>
          <p className="studio-kicker">{messages.studio.distribution}</p>
          <h1>{copy.distributionTitle}</h1>
          <p>{copy.distributionDescription}</p>
        </div>
      </header>

      <section className="studio-channel-metrics" aria-label={copy.distributionTitle}>
        {socialChannels.map((channel, index) => {
          const count = queued.filter((item) => item.channel === channel).length;
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

      {queued.length ? (
        <section className="studio-section" aria-labelledby="queue-title">
          <div className="studio-section__header">
            <div>
              <p className="studio-kicker">{messages.common.now}</p>
              <h2 id="queue-title">{copy.distributionTitle}</h2>
            </div>
          </div>
          <div className="studio-distribution-list">
            {queued.map(({ article, channel }) => (
              <article key={`${article.id}-${channel}`}>
                <span className="studio-channel-pill">{channel}</span>
                <div>
                  <strong>{article.title}</strong>
                  <p>{article.excerpt}</p>
                </div>
                <Link aria-label={`${copy.editStory}: ${article.title}`} href={`/${locale}/studio/articles/${article.id}`}>
                  <ArrowRight aria-hidden="true" size={17} />
                </Link>
              </article>
            ))}
          </div>
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
