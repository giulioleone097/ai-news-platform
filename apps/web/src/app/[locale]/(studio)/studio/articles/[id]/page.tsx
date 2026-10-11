import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleForm } from "@/components/studio/article-form";
import { Note } from "@/components/studio/note";
import { getMessages, isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { getStudioEditorialRepositories } from "@/server/composition";

export const metadata: Metadata = { robots: { index: false } };

export default async function EditArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const [{ locale, id }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();

  await requireEditor(locale);
  const repositories = await getStudioEditorialRepositories();
  const [article, currentCategories, media, entities] = await Promise.all([
    repositories.articles.findById(id, locale),
    repositories.articles.listCategories(locale),
    repositories.media.listAssets(),
    repositories.entities.listEntities(locale),
  ]);
  if (!article) notFound();

  return (
    <>
      {query.saved ? <Note tone="success">{locale === "it" ? "Articolo salvato." : "Article saved."}</Note> : null}
      <ArticleForm
        article={article}
        categories={{
          en: locale === "en" ? currentCategories : [],
          it: locale === "it" ? currentCategories : [],
        }}
        entities={entities}
        locale={locale}
        media={media}
        messages={getMessages(locale)}
      />
    </>
  );
}
