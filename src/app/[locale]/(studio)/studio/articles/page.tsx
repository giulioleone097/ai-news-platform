import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { ArticleList } from "@/components/studio/article-list";
import { studioSupplementalCopy } from "@/components/studio/studio-copy";
import { getMessages, isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { getStudioEditorialRepositories } from "@/modules/editorial/infrastructure/container";

export const metadata: Metadata = { robots: { index: false } };

export default async function StudioArticlesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ deleted?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();

  await requireEditor(locale);
  const repositories = await getStudioEditorialRepositories();
  const articles = await repositories.articles.listForStudio(locale);
  const messages = getMessages(locale);
  const copy = studioSupplementalCopy[locale];

  return (
    <>
      <header className="studio-page-header">
        <div>
          <p className="studio-kicker">{messages.studio.articleList}</p>
          <h1>{messages.studio.articles}</h1>
          <p>{copy.articlesDescription}</p>
        </div>
        <Link className="studio-button studio-button--primary" href={`/${locale}/studio/articles/new`}>
          <Plus aria-hidden="true" size={17} />
          {messages.studio.newArticle}
        </Link>
      </header>

      {query.deleted ? (
        <p className="studio-alert studio-alert--success" role="status">
          {locale === "it" ? "Articolo eliminato." : "Article deleted."}
        </p>
      ) : null}

      <section className="studio-section" aria-label={messages.studio.articleList}>
        <ArticleList articles={articles} locale={locale} messages={messages} />
      </section>
    </>
  );
}
