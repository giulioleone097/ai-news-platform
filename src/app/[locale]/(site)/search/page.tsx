import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleArchive } from "@/components/site/article-archive";
import { getAlternates, getMessages, isLocale } from "@/i18n";
import {
  getPublicCategories,
  searchPublishedArticles,
} from "@/modules/editorial/application/queries";
import { publicArchivePageSize } from "@/modules/editorial/application/public-feed";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const messages = getMessages(locale);
  return {
    title: messages.metadata.searchTitle,
    description: messages.metadata.searchDescription,
    alternates: getAlternates("/search", locale),
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ locale }, { q = "" }] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();

  const messages = getMessages(locale);
  const normalizedQuery = q.trim().slice(0, 120);
  const [page, categories] = await Promise.all([
    normalizedQuery
      ? searchPublishedArticles({
          locale,
          query: normalizedQuery,
          limit: publicArchivePageSize,
        })
      : Promise.resolve({ items: [], nextCursor: null }),
    getPublicCategories(locale),
  ]);
  const title = normalizedQuery
    ? `${messages.search.resultsTitle}: “${normalizedQuery}”`
    : messages.search.title;

  return (
    <main id="main-content" className="site-shell archive-main">
      <ArticleArchive
        title={title}
        description={messages.search.description}
        articles={page.items}
        categories={categories}
        locale={locale}
        query={normalizedQuery}
        nextCursor={page.nextCursor}
      />
    </main>
  );
}
