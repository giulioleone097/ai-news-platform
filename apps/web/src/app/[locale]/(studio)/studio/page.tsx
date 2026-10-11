import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";
import { ArticleList } from "@/components/studio/article-list";
import { countActiveSubscribers, countPendingComments } from "@/components/studio/dashboard-counts";
import { countNewContactMessages } from "@/components/studio/inbox/inbox-data";
import { Note } from "@/components/studio/note";
import { PageHead } from "@/components/studio/page-head";
import { studioSupplementalCopy } from "@/components/studio/studio-copy";
import { getMessages, isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { getStudioEditorialRepositories } from "@/server/composition";

export const metadata: Metadata = { robots: { index: false } };

export default async function StudioDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  await requireEditor(locale);
  const repositories = await getStudioEditorialRepositories();
  const [articles, pendingComments, subscribers, newMessages] = await Promise.all([
    repositories.articles.listForStudio(locale),
    countPendingComments(),
    countActiveSubscribers(repositories.newsletter),
    countNewContactMessages(),
  ]);
  const messages = getMessages(locale);
  const copy = studioSupplementalCopy[locale];
  // A figure that is unavailable (its feature is not configured) is left out, not shown as a dash.
  const stats = [
    { label: copy.totalStories, value: articles.length },
    { label: copy.publishedStories, value: articles.filter((article) => article.status === "published").length },
    { label: copy.scheduledStories, value: articles.filter((article) => article.status === "scheduled").length },
    {
      label: copy.draftStories,
      value: articles.filter((article) => ["draft", "review"].includes(article.status)).length,
    },
    ...(subscribers === null ? [] : [{ label: messages.studio.activeSubscribers, value: subscribers }]),
  ];
  const attention = [
    { href: `/${locale}/studio/comments?status=pending`, label: messages.studio.pendingComments, value: pendingComments },
    { href: `/${locale}/studio/inbox?status=new`, label: messages.studio.newContactMessages, value: newMessages },
  ].filter((item) => item.value);

  return (
    <>
      <PageHead title={messages.studio.dashboard}>
        <Link className="button button--primary" href={`/${locale}/studio/articles/new`}>
          <Plus aria-hidden="true" />
          {messages.studio.newArticle}
        </Link>
      </PageHead>

      {repositories.mode === "demo" ? <Note tone="warning">{messages.studio.demoDescription}</Note> : null}

      <dl className="studio-stats">
        {stats.map((stat) => (
          <div data-zero={stat.value === 0} key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>

      <section className="studio-section" aria-labelledby="recent-stories-title">
        <div className="studio-section__head">
          <h2 className="studio-section__title" id="recent-stories-title">{copy.recentStories}</h2>
          <Link className="studio-link" href={`/${locale}/studio/articles`}>
            {messages.common.viewAll}
            <ArrowRight aria-hidden="true" size={14} />
          </Link>
        </div>
        <ArticleList articles={articles} limit={6} locale={locale} messages={messages} />
      </section>

      {attention.length ? (
        <section className="studio-section" aria-labelledby="attention-title">
          <h2 className="studio-section__title" id="attention-title">{copy.needsAttention}</h2>
          <div className="studio-links">
            {attention.map((item) => (
              <Link href={item.href} key={item.href}>
                <span>
                  <strong>{item.value}</strong> {item.label.toLowerCase()}
                </span>
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
