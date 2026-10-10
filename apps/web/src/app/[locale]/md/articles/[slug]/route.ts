import { renderStoryMarkdown } from "@atlasnews/core/editorial/application/story-markdown";
import { getMessages, isLocale } from "@/i18n";
import { getCachedArticle } from "@/lib/editorial-queries";
import { feedResponse, notFoundResponse } from "@/lib/feeds/responses";
import { storyUrl } from "@/lib/feeds/site";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; slug: string }> },
) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return notFoundResponse();

  const article = await getCachedArticle(slug, locale);
  if (!article) return notFoundResponse();

  const markdown = renderStoryMarkdown(article, storyUrl(locale, slug), getMessages(locale).story);
  return feedResponse(markdown, "text/markdown");
}
