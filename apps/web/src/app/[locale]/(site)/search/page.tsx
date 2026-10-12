import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleArchive } from "@/components/site/article-archive";
import { getAlternates, getMessages, isLocale } from "@/i18n";
import {
  getPublicCategories,
  searchPublishedArticles,
} from "@/lib/editorial-queries";
import { feedPageSize } from "@atlasnews/core/editorial/domain/editorial-service";
import { agentAlternateTypes } from "@/lib/alternates";

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
    alternates: { ...getAlternates("/search", locale), types: agentAlternateTypes(locale) },
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const [{ locale }, { q = "", category }] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();

  const messages = getMessages(locale);
  const normalizedQuery = q.trim().slice(0, 120);
  const categories = await getPublicCategories(locale);
  const activeCategory = categories.find((item) => item.slug === category)?.slug;
  const page = normalizedQuery
    ? await searchPublishedArticles({
        locale,
        query: normalizedQuery,
        category: activeCategory,
        limit: feedPageSize,
      })
    : { items: [], nextCursor: null };

  return (
    <main id="main-content" className="site-shell archive-main">
      <ArticleArchive
        title={messages.search.title}
        description={messages.search.description}
        articles={page.items}
        categories={categories}
        locale={locale}
        query={normalizedQuery}
        activeCategory={activeCategory}
        nextCursor={page.nextCursor}
        searchPage
      />
    </main>
  );
}
