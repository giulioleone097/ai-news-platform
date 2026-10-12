import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";
import { ArticleList } from "@/components/studio/article-list";
import {
  countActiveSubscribers,
  countFailedSocialPosts,
  countPendingComments,
} from "@/components/studio/dashboard-counts";
import { countNewContactMessages } from "@/components/studio/inbox/inbox-data";
import { PageHead } from "@/components/studio/page-head";
import { plural, whenLabel, type PluralPair } from "@/components/studio/studio-format";
import { getMessages, isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import type { Article } from "@atlasnews/core/editorial/domain/article";
import { getStudioEditorialRepositories } from "@/server/composition";

export const metadata: Metadata = { robots: { index: false } };

const day = 86_400_000;

export default async function StudioDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  await requireEditor(locale);
  const repositories = await getStudioEditorialRepositories();
  const [articles, pendingComments, subscribers, newMessages, failedPosts] = await Promise.all([
    repositories.articles.listForStudio(locale),
    countPendingComments(),
    countActiveSubscribers(repositories.newsletter),
    countNewContactMessages(),
    countFailedSocialPosts(repositories.distribution, locale),
  ]);
  const messages = getMessages(locale);
  const { studio } = messages;
  const now = new Date().getTime();
  const base = `/${locale}/studio`;

  const withStatus = (status: Article["status"]) => articles.filter((article) => article.status === status);
  const [drafts, inReview, published] = [withStatus("draft"), withStatus("review"), withStatus("published")];
  const scheduled = withStatus("scheduled");
  const publishingSoon = scheduled.filter((article) => {
    const at = article.scheduledFor ? new Date(article.scheduledFor).getTime() : NaN;
    return at >= now && at < now + day;
  });

  // One quiet sentence of the figures that are not zero. A feature that is off has no figure.
  const figures: Array<[PluralPair, number | null]> = [
    [studio.counts.articles, articles.length],
    [studio.counts.published, published.length],
    [studio.counts.scheduled, scheduled.length],
    [studio.counts.review, inReview.length],
    [studio.counts.drafts, drafts.length],
    [studio.counts.subscribers, subscribers],
  ];
  const summary = figures
    .filter((figure): figure is [PluralPair, number] => Boolean(figure[1]))
    .map(([pair, count]) => plural(locale, pair, count))
    .join(", ");

  const oldest = (list: Article[]) =>
    studio.attention.oldest.replace(
      "{age}",
      whenLabel(list.map((article) => article.updatedAt).sort()[0], locale, now).text,
    );
  const attention = [
    { href: `${base}/articles?status=draft`, pair: studio.attention.drafts, value: drafts.length, detail: oldest(drafts) },
    { href: `${base}/articles?status=review`, pair: studio.attention.review, value: inReview.length, detail: oldest(inReview) },
    { href: `${base}/articles?status=scheduled`, pair: studio.attention.scheduledSoon, value: publishingSoon.length },
    { href: `${base}/distribution?status=failed`, pair: studio.attention.failedSocial, value: failedPosts },
    { href: `${base}/comments?status=pending`, pair: studio.attention.pendingComments, value: pendingComments },
    { href: `${base}/inbox?status=new`, pair: studio.attention.newMessages, value: newMessages },
  ].filter((row) => row.value);

  return (
    <>
      <PageHead description={summary} title={studio.dashboard}>
        <Link className="button button--primary" href={`${base}/articles/new`}>
          <Plus aria-hidden="true" />
          {studio.newArticle}
        </Link>
      </PageHead>

      <section className="studio-section" aria-labelledby="attention-title">
        <h2 className="studio-section__title" id="attention-title">{studio.attention.title}</h2>
        {attention.length ? (
          <div className="studio-links">
            {attention.map((row) => (
              <Link href={row.href} key={row.href}>
                <span>{plural(locale, row.pair, row.value as number)}</span>
                {row.detail ? <small className="studio-muted">{row.detail}</small> : null}
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            ))}
          </div>
        ) : (
          <p className="studio-muted">{studio.attention.none}</p>
        )}
      </section>

      <section className="studio-section" aria-labelledby="recent-articles-title">
        <div className="studio-section__head">
          <h2 className="studio-section__title" id="recent-articles-title">{studio.recentArticles}</h2>
          <Link className="studio-link" href={`${base}/articles`}>
            {messages.common.viewAll}
            <ArrowRight aria-hidden="true" size={14} />
          </Link>
        </div>
        <ArticleList articles={articles} limit={6} locale={locale} messages={messages} now={now} />
      </section>
    </>
  );
}
