import type { Locale } from "@/i18n";
import { escapeXml } from "./xml";

export interface NewsSitemapEntry {
  url: string;
  locale: Locale;
  publishedAt: string;
  title: string;
}

/** Google News sitemap: only the stories the caller passes (the last 48 hours) are written. */
export function buildNewsSitemap(publicationName: string, entries: NewsSitemapEntry[]) {
  const urls = entries.map((entry) => `  <url>
    <loc>${escapeXml(entry.url)}</loc>
    <news:news>
      <news:publication>
        <news:name>${escapeXml(publicationName)}</news:name>
        <news:language>${entry.locale}</news:language>
      </news:publication>
      <news:publication_date>${escapeXml(new Date(entry.publishedAt).toISOString())}</news:publication_date>
      <news:title>${escapeXml(entry.title)}</news:title>
    </news:news>
  </url>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls}
</urlset>
`;
}
