import { getMessages, isLocale } from "@/i18n";
import { searchPublishedArticles } from "@/lib/editorial-queries";
import { buildJsonFeed } from "@/lib/feeds/json-feed";
import { feedResponse, notFoundResponse } from "@/lib/feeds/responses";
import { localizedSiteUrl } from "@/lib/feeds/site";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  if (!isLocale(locale)) return notFoundResponse();

  const messages = getMessages(locale);
  const page = await searchPublishedArticles({ locale, limit: 50 });
  const json = buildJsonFeed({
    title: messages.metadata.siteTitle,
    description: messages.metadata.siteDescription,
    locale,
    homeUrl: localizedSiteUrl("/", locale),
    feedUrl: localizedSiteUrl("/feed.json", locale),
    articles: page.items,
    labels: messages.story,
  });
  return feedResponse(json, "application/feed+json");
}
