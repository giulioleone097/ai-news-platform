import { locales } from "@/i18n";
import { getStoriesPublishedSince } from "@/lib/feeds/data";
import { buildNewsSitemap } from "@/lib/feeds/news-sitemap";
import { feedResponse } from "@/lib/feeds/responses";
import { brandName, storyUrl } from "@/lib/feeds/site";
import { publishedStories } from "@/lib/feeds/stories";

const newsWindowMs = 48 * 60 * 60 * 1000;

export async function GET() {
  const since = new Date(Date.now() - newsWindowMs);
  const stories = await Promise.all(locales.map((locale) => getStoriesPublishedSince(locale, since)));
  const entries = publishedStories(stories.flat()).map((article) => ({
    url: storyUrl(article.locale, article.slug),
    locale: article.locale,
    publishedAt: article.publishedAt,
    title: article.title,
  }));
  return feedResponse(buildNewsSitemap(brandName, entries), "application/xml");
}
