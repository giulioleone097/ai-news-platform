import { getMessages, isLocale } from "@/i18n";
import { searchPublishedArticles } from "@/lib/editorial-queries";
import { getEntityPage } from "@/lib/feeds/data";
import { feedResponse, notFoundResponse } from "@/lib/feeds/responses";
import { buildRssFeed } from "@/lib/feeds/rss";
import { entityUrl, localizedSiteUrl } from "@/lib/feeds/site";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; slug: string }> },
) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return notFoundResponse();

  const page = await getEntityPage(slug, locale);
  if (!page) return notFoundResponse();

  const messages = getMessages(locale);
  const stories = await searchPublishedArticles({ locale, entity: slug, limit: 50 });
  const xml = buildRssFeed({
    title: `${page.entity.name} · ${messages.metadata.siteTitle}`,
    description: page.entity.description || messages.metadata.siteDescription,
    locale,
    homeUrl: entityUrl(locale, slug),
    feedUrl: localizedSiteUrl(`/entities/${slug}/feed.xml`, locale),
    articles: stories.items,
    labels: messages.story,
  });
  return feedResponse(xml, "application/rss+xml");
}
