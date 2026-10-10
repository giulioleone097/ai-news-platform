/*
 * Pure helpers shipped inside the newsroom MCP App. They are serialized with
 * Function#toString, so each function must stay self-contained: no imports,
 * no references to module scope, and no "</script" text.
 */

export type NewsroomRoute =
  | { view: "feed"; locale?: string; category?: string }
  | { view: "article"; locale: string; slug: string }
  | { view: "search"; locale?: string; query: string };

/** Renders trusted editorial Markdown to HTML after escaping every input character. */
export function renderMarkdown(markdown: string): string {
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const inline = (value: string) =>
    escape(value)
      .replace(/!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)/g, '<img alt="$1" src="$2" loading="lazy">')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" data-action="external">$1</a>')
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])[*_]([^*_]+)[*_](?=[^*\w]|$)/g, "$1<em>$2</em>");

  const html: string[] = [];
  let paragraph: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;
  let quote: string[] = [];
  let code: string[] | null = null;

  const flush = () => {
    if (paragraph.length) html.push(`<p>${inline(paragraph.join(" "))}</p>`);
    if (list) html.push(`<${list.tag}>${list.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${list.tag}>`);
    if (quote.length) html.push(`<blockquote><p>${inline(quote.join(" "))}</p></blockquote>`);
    paragraph = [];
    list = null;
    quote = [];
  };

  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    if (code) {
      if (/^\s*```/.test(line)) {
        html.push(`<pre><code>${escape(code.join("\n"))}</code></pre>`);
        code = null;
      } else {
        code.push(line);
      }
      continue;
    }
    if (/^\s*```/.test(line)) {
      flush();
      code = [];
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const quoted = /^\s*>\s?(.*)$/.exec(line);
    if (!line.trim()) {
      flush();
    } else if (/^\s*(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(line)) {
      flush();
      html.push("<hr>");
    } else if (heading) {
      flush();
      const level = Math.min(heading[1].length + 1, 6);
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (bullet || ordered) {
      const tag = bullet ? "ul" : "ol";
      if (paragraph.length || quote.length || (list && list.tag !== tag)) flush();
      list ??= { tag, items: [] };
      list.items.push((bullet ?? ordered)![1]);
    } else if (quoted) {
      if (paragraph.length || list) flush();
      quote.push(quoted[1]);
    } else if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
    } else {
      if (list || quote.length) flush();
      paragraph.push(line.trim());
    }
  }
  if (code) html.push(`<pre><code>${escape(code.join("\n"))}</code></pre>`);
  flush();
  return html.join("\n");
}

/** Maps an `openai/deepLink` app-relative URL to a newsroom route; unknown paths open the feed. */
export function parseDeepLink(url: string, locales: readonly string[]): NewsroomRoute {
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  let parsed: URL;
  try {
    parsed = new URL(url, "https://atlasnews.invalid");
  } catch {
    return { view: "feed" };
  }
  const segments = parsed.pathname.split("/").filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return "";
    }
  });
  const queryLocale = parsed.searchParams.get("locale") ?? undefined;
  const locale = queryLocale && locales.includes(queryLocale) ? queryLocale : undefined;
  const [section, first, second] = segments;
  const validLocale = first !== undefined && locales.includes(first);

  if (section === "articles" && validLocale && second && slugPattern.test(second)) {
    return { view: "article", locale: first, slug: second };
  }
  if (section === "categories" && validLocale && second && slugPattern.test(second)) {
    return { view: "feed", locale: first, category: second };
  }
  if (section === "search") {
    const query = (parsed.searchParams.get("q") ?? "").trim().slice(0, 160);
    if (query.length >= 2) return { view: "search", locale, query };
  }
  return { view: "feed", locale };
}
