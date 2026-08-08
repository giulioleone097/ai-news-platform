import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";
import { ArticleList } from "@/components/studio/article-list";
import { studioSupplementalCopy } from "@/components/studio/studio-copy";
import { getMessages, isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { getStudioEditorialRepositories } from "@/modules/editorial/infrastructure/container";

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
  const articles = await repositories.articles.listForStudio(locale);
  const messages = getMessages(locale);
  const copy = studioSupplementalCopy[locale];
  const counts = {
    total: articles.length,
    published: articles.filter((article) => article.status === "published").length,
    scheduled: articles.filter((article) => article.status === "scheduled").length,
    inProgress: articles.filter((article) => ["draft", "review"].includes(article.status)).length,
  };

  return (
    <>
      <header className="studio-page-header">
        <div>
          <p className="studio-kicker">{copy.dashboardKicker}</p>
          <h1>{messages.studio.overviewTitle}</h1>
          <p>{messages.studio.overviewDescription}</p>
        </div>
        <Link className="studio-button studio-button--primary" href={`/${locale}/studio/articles/new`}>
          <Plus aria-hidden="true" size={17} />
          {messages.studio.createArticle}
        </Link>
      </header>

      <section className="studio-metrics" aria-label={messages.studio.overviewTitle}>
        <article>
          <span>01</span>
          <strong>{counts.total}</strong>
          <p>{copy.totalStories}</p>
        </article>
        <article>
          <span>02</span>
          <strong>{counts.published}</strong>
          <p>{copy.publishedStories}</p>
        </article>
        <article>
          <span>03</span>
          <strong>{counts.scheduled}</strong>
          <p>{copy.scheduledStories}</p>
        </article>
        <article>
          <span>04</span>
          <strong>{counts.inProgress}</strong>
          <p>{copy.draftStories}</p>
        </article>
      </section>

      <section className="studio-section" aria-labelledby="recent-stories-title">
        <div className="studio-section__header">
          <div>
            <p className="studio-kicker">{messages.common.now}</p>
            <h2 id="recent-stories-title">{copy.recentStories}</h2>
          </div>
          <Link className="studio-text-link" href={`/${locale}/studio/articles`}>
            {messages.common.viewAll}
            <ArrowRight aria-hidden="true" size={15} />
          </Link>
        </div>
        <ArticleList articles={articles} limit={6} locale={locale} messages={messages} />
      </section>

      <aside className={`studio-mode-banner studio-mode-banner--${repositories.mode}`}>
        <span className="studio-dot" />
        <div>
          <strong>
            {repositories.mode === "demo" ? messages.studio.demoMode : messages.studio.authenticatedMode}
          </strong>
          <p>
            {repositories.mode === "demo"
              ? messages.studio.demoDescription
              : messages.studio.authenticatedDescription}
          </p>
        </div>
      </aside>
    </>
  );
}
