import { getMessages, isLocale } from "@/i18n";
import { getEntityPage } from "@/lib/feeds/data";
import { renderEntityMarkdown } from "@/lib/feeds/entity-markdown";
import { feedResponse, notFoundResponse } from "@/lib/feeds/responses";
import { entityUrl, storyUrl } from "@/lib/feeds/site";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; slug: string }> },
) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return notFoundResponse();

  const page = await getEntityPage(slug, locale);
  if (!page) return notFoundResponse();

  const markdown = renderEntityMarkdown(
    page.entity,
    page.timeline,
    { page: entityUrl(locale, slug), story: (storySlug) => storyUrl(locale, storySlug) },
    getMessages(locale).story,
  );
  return feedResponse(markdown, "text/markdown");
}
