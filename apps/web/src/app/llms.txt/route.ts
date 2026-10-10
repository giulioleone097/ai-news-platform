import { getPublicMcpUrl } from "@atlasnews/adapters/config/env";
import { localeLabels, locales } from "@/i18n";
import { getCoveredEntities } from "@/lib/feeds/data";
import { buildLlmsTxt, type LlmsSection } from "@/lib/feeds/llms-txt";
import { feedResponse } from "@/lib/feeds/responses";
import { brandName, localizedSiteUrl, siteUrl } from "@/lib/feeds/site";

export async function GET() {
  const coverage = await Promise.all(locales.map(async (locale) => ({
    locale,
    entities: await getCoveredEntities(locale),
  })));

  const sections: LlmsSection[] = [];
  for (const locale of locales) {
    sections.push({
      title: `News streams (${localeLabels[locale]})`,
      links: [
        { title: "Latest stories", url: localizedSiteUrl("/latest", locale) },
        { title: "RSS feed", url: localizedSiteUrl("/feed.xml", locale), note: "Newest 50 stories with full text." },
        { title: "JSON Feed", url: localizedSiteUrl("/feed.json", locale), note: "Newest 50 stories with the Markdown body." },
      ],
    });
  }
  for (const { locale, entities } of coverage) {
    if (!entities.length) continue;
    sections.push({
      title: `Coverage by entity (${localeLabels[locale]})`,
      links: entities.map((entity) => ({
        title: entity.name,
        url: localizedSiteUrl(`/entities/${entity.slug}.md`, locale),
        note: entity.description,
      })),
    });
  }
  sections.push({
    title: "Markdown and feeds",
    text: "Appending .md to any article or entity URL returns that page as Markdown. Each entity also has an RSS feed at /{locale}/entities/{slug}/feed.xml.",
  });
  if (process.env.NEXT_PUBLIC_MCP_URL?.trim()) {
    const mcp = getPublicMcpUrl();
    sections.push({
      title: "MCP server",
      links: [
        { title: "MCP endpoint", url: new URL("/mcp", mcp).toString(), note: "Model Context Protocol endpoint for agents." },
        { title: "MCP server info", url: new URL("/info", mcp).toString() },
      ],
    });
  }
  sections.push({
    title: "Sitemaps",
    links: [
      { title: "Sitemap", url: siteUrl("/sitemap.xml") },
      { title: "News sitemap", url: siteUrl("/news-sitemap.xml"), note: "Stories of the last 48 hours." },
    ],
  });

  const text = buildLlmsTxt(
    brandName,
    "AtlasNews is a news site about artificial intelligence, published in English (/en) and Italian (/it). Each story states its claim status, key points, sources and the entities it covers.",
    sections,
  );
  return feedResponse(text, "text/plain");
}
