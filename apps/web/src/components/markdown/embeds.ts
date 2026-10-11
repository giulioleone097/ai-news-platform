import type { Root } from "mdast";
import type { Plugin } from "unified";

export type Embed =
  | { provider: "youtube"; id: string; url: string; frame: string }
  | { provider: "x"; id: string; user: string; url: string; frame: string };

const youtubeHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const xHosts = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"]);
const youtubeId = /^[A-Za-z0-9_-]{11}$/;
const shortsPath = /^\/shorts\/([^/]+)\/?$/;
const xPath = /^\/(\w{1,15})\/status\/(\d{1,20})\/?$/;

function youtube(id: string | null | undefined): Embed | null {
  if (!id || !youtubeId.test(id)) return null;
  return {
    provider: "youtube",
    id,
    url: `https://www.youtube.com/watch?v=${id}`,
    frame: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
  };
}

/** The embed a bare URL stands for, from canonical parts only; anything that is not an exact match is null. */
export function parseEmbedUrl(value: string): Embed | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;

  if (url.hostname === "youtu.be") return youtube(/^\/([^/]+)\/?$/.exec(url.pathname)?.[1]);
  if (youtubeHosts.has(url.hostname)) {
    if (url.pathname === "/watch") return youtube(url.searchParams.get("v"));
    return youtube(shortsPath.exec(url.pathname)?.[1]);
  }
  if (xHosts.has(url.hostname)) {
    const match = xPath.exec(url.pathname);
    if (!match) return null;
    const [, user, id] = match as unknown as [string, string, string];
    return {
      provider: "x",
      id,
      user,
      url: `https://x.com/${user}/status/${id}`,
      frame: `https://platform.twitter.com/embed/Tweet.html?id=${id}&dnt=true`,
    };
  }
  return null;
}

/**
 * A top-level paragraph that is only a YouTube or X status URL becomes a `markdown-embed` element carrying
 * the canonical page URL; the component re-derives and re-validates everything from it. Labelled links,
 * URLs inside prose, lists and quotes stay ordinary links.
 */
export const markdownEmbedsPlugin: Plugin<[], Root> = () => (tree) => {
  for (const node of tree.children) {
    if (node.type !== "paragraph" || node.children.length !== 1) continue;
    const link = node.children[0]!;
    if (link.type !== "link" || link.children.length !== 1) continue;
    const label = link.children[0]!;
    if (label.type !== "text" || label.value !== link.url) continue;

    const embed = parseEmbedUrl(link.url);
    if (!embed) continue;
    node.children = [];
    node.data = { hName: "markdown-embed", hProperties: { href: embed.url } };
  }
};
