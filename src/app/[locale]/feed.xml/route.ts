import { getPublicSiteUrl } from "@/config/env";
import { getMessages, isLocale, localizedPath } from "@/i18n";
import { searchPublishedArticles } from "@/lib/editorial-queries";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  if (!isLocale(locale)) return new Response("Not found", { status: 404 });

  const messages = getMessages(locale);
  const base = getPublicSiteUrl();
  const page = await searchPublishedArticles({ locale, limit: 50 });
  const feedUrl = new URL(localizedPath("/feed.xml", locale), base).toString();
  const siteUrl = new URL(localizedPath("/", locale), base).toString();
  const items = page.items.map((article) => {
    const url = new URL(localizedPath(`/articles/${article.slug}`, locale), base).toString();
    return `<item>
      <title>${escapeXml(article.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <description>${escapeXml(article.excerpt)}</description>
      <category>${escapeXml(article.category.name)}</category>
      ${article.publishedAt ? `<pubDate>${new Date(article.publishedAt).toUTCString()}</pubDate>` : ""}
    </item>`;
  }).join("\n");
  const lastBuildDate = page.items[0]?.updatedAt
    ? new Date(page.items[0].updatedAt).toUTCString()
    : new Date(0).toUTCString();
  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(messages.metadata.siteTitle)}</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>${escapeXml(messages.metadata.siteDescription)}</description>
    <language>${locale}</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
