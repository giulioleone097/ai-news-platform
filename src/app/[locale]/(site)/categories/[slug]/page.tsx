import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArticleArchive } from "@/components/site/article-archive";
import { NewsletterForm } from "@/components/site/newsletter-form";
import {
  getMessages,
  isLocale,
  locales,
  localizedPath,
  type Locale,
} from "@/i18n";
import {
  getPublicCategories,
  searchPublishedArticles,
} from "@/lib/editorial-queries";
import { publicArchivePageSize } from "@/modules/editorial/application/public-feed";
import type { Category } from "@/modules/editorial/domain/article";

export const revalidate = 60;

export async function generateStaticParams() {
  const groups = await Promise.all(
    locales.map(async (locale) => {
      const categories = await getPublicCategories(locale);
      return categories.map((category) => ({ locale, slug: category.slug }));
    }),
  );
  return groups.flat();
}

async function getCategoryAlternates(category: Category, currentLocale: Locale) {
  const entries = await Promise.all(
    locales.map(async (locale) => {
      const peer = (await getPublicCategories(locale)).find(
        (item) => item.translationKey === category.translationKey,
      );
      return [
        locale,
        localizedPath(`/categories/${peer?.slug ?? category.slug}`, locale),
      ] as const;
    }),
  );
  const languages = Object.fromEntries(entries) as Record<Locale | "x-default", string>;
  languages["x-default"] = entries.find(([locale]) => locale === "en")?.[1] ?? entries[0][1];

  return {
    canonical: localizedPath(`/categories/${category.slug}`, currentLocale),
    languages,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const messages = getMessages(locale);
  const category = (await getPublicCategories(locale)).find((item) => item.slug === slug);
  return category
    ? {
        title: category.name,
        description: category.description,
        alternates: await getCategoryAlternates(category, locale),
      }
    : { title: messages.metadata.categoryFallbackTitle };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();

  const messages = getMessages(locale);
  const categories = await getPublicCategories(locale);
  const category = categories.find((item) => item.slug === slug);
  if (!category) {
    const sourceGroups = await Promise.all(
      locales.filter((candidate) => candidate !== locale).map(getPublicCategories),
    );
    const source = sourceGroups.flat().find((item) => item.slug === slug);
    if (source) {
      const peer = categories.find((item) => item.translationKey === source.translationKey);
      if (peer) redirect(localizedPath(`/categories/${peer.slug}`, locale));
    }
    notFound();
  }

  const page = await searchPublishedArticles({
    locale,
    category: slug,
    limit: publicArchivePageSize,
  });

  return (
    <main id="main-content" className="site-shell archive-main">
      <ArticleArchive
        title={category.name}
        description={category.description}
        articles={page.items}
        categories={categories}
        activeCategory={category.slug}
        locale={locale}
        nextCursor={page.nextCursor}
      />
      <NewsletterForm
        locale={locale}
        copy={messages.newsletter}
        source={`category-${category.translationKey}-${locale}`}
      />
    </main>
  );
}
