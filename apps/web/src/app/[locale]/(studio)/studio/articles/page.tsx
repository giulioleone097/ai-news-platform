import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { ArticleList } from "@/components/studio/article-list";
import { Note } from "@/components/studio/note";
import { PageHead } from "@/components/studio/page-head";
import { studioSupplementalCopy } from "@/components/studio/studio-copy";
import { getMessages, isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { getStudioEditorialRepositories } from "@/server/composition";

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
      <PageHead description={copy.articlesDescription} title={messages.studio.articles}>
        <Link className="button button--primary" href={`/${locale}/studio/articles/new`}>
          <Plus aria-hidden="true" />
          {messages.studio.newArticle}
        </Link>
      </PageHead>

      {query.deleted ? <Note tone="success">{locale === "it" ? "Articolo eliminato." : "Article deleted."}</Note> : null}

      <section aria-label={messages.studio.articleList} className="studio-stack">
        <ArticleList articles={articles} bulk locale={locale} messages={messages} />
      </section>
    </>
  );
}
