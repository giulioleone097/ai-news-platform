import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleForm } from "@/components/studio/article-form";
import { getMessages, isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { getStudioEditorialRepositories } from "@/server/composition";

export const metadata: Metadata = { robots: { index: false } };

export default async function NewArticlePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  await requireEditor(locale);
  const repositories = await getStudioEditorialRepositories();
  const [englishCategories, italianCategories, media, entities] = await Promise.all([
    repositories.articles.listCategories("en"),
    repositories.articles.listCategories("it"),
    repositories.media.listAssets(),
    repositories.entities.listEntities(locale),
  ]);

  return (
    <ArticleForm
      categories={{ en: englishCategories, it: italianCategories }}
      entities={entities}
      locale={locale}
      media={media}
      messages={getMessages(locale)}
    />
  );
}
