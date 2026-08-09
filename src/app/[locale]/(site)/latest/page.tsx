import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleArchive } from "@/components/site/article-archive";
import { NewsletterForm } from "@/components/site/newsletter-form";
import { getAlternates, getMessages, isLocale } from "@/i18n";
import {
  getPublicCategories,
  searchPublishedArticles,
} from "@/lib/editorial-queries";
import { publicArchivePageSize } from "@/modules/editorial/application/public-feed";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const messages = getMessages(locale);
  return {
    title: messages.metadata.latestTitle,
    description: messages.metadata.latestDescription,
    alternates: getAlternates("/latest", locale),
  };
}

export default async function LatestPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const messages = getMessages(locale);
  const [page, categories] = await Promise.all([
    searchPublishedArticles({ locale, limit: publicArchivePageSize }),
    getPublicCategories(locale),
  ]);

  return (
    <main id="main-content" className="site-shell archive-main">
      <ArticleArchive
        title={messages.latest.title}
        description={messages.latest.description}
        articles={page.items}
        categories={categories}
        locale={locale}
        nextCursor={page.nextCursor}
      />
      <NewsletterForm locale={locale} copy={messages.newsletter} source={`latest-${locale}`} />
    </main>
  );
}
