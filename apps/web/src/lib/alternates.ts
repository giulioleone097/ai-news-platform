import { localizedPath, type Locale } from "@atlasnews/core/locale";

/**
 * The machine-readable versions a page links to: the locale's RSS and JSON feeds, and the Markdown
 * twin of a story or entity page (`markdownPath` is that page's path without the locale).
 */
export function agentAlternateTypes(locale: Locale, markdownPath?: string) {
  return {
    "application/rss+xml": localizedPath("/feed.xml", locale),
    "application/feed+json": localizedPath("/feed.json", locale),
    ...(markdownPath ? { "text/markdown": `${localizedPath(markdownPath, locale)}.md` } : {}),
  };
}
