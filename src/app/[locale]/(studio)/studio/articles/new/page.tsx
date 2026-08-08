import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleForm } from "@/components/studio/article-form";
import { getMessages, isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { getStudioEditorialRepositories } from "@/modules/editorial/infrastructure/container";

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
  const [englishCategories, italianCategories] = await Promise.all([
    repositories.articles.listCategories("en"),
    repositories.articles.listCategories("it"),
  ]);

  return (
    <ArticleForm
      categories={{ en: englishCategories, it: italianCategories }}
      locale={locale}
      messages={getMessages(locale)}
    />
  );
}
