"use client";

import { MessageSquareText, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { parseEmbedUrl } from "./embeds";
import type { MarkdownLabels } from "./labels";

const frameSandbox = {
  youtube: "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox",
  x: "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox",
} as const;

/**
 * Click-to-load facade: until the reader clicks, the page makes no request to YouTube or X (no thumbnail,
 * no script). The source link works without JavaScript. `href` is re-parsed here, so only a valid
 * canonical URL can ever become a frame.
 */
export function EmbedFrame({ href, labels }: { href: string; labels: MarkdownLabels["embeds"] }) {
  const [loaded, setLoaded] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const embed = parseEmbedUrl(href);

  useEffect(() => {
    if (loaded) frame.current?.focus();
  }, [loaded]);

  if (!embed) return null;
  const copy = labels[embed.provider];
  const Icon = embed.provider === "youtube" ? Play : MessageSquareText;

  return (
    <div className={`markdown-embed markdown-embed--${embed.provider}`}>
      {loaded ? (
        <iframe
          allow={embed.provider === "youtube" ? "autoplay; encrypted-media; picture-in-picture; fullscreen" : undefined}
          allowFullScreen={embed.provider === "youtube"}
          loading="lazy"
          ref={frame}
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox={frameSandbox[embed.provider]}
          src={embed.frame}
          title={copy.title}
        />
      ) : (
        <button className="markdown-embed__load" onClick={() => setLoaded(true)} type="button">
          <Icon aria-hidden="true" />
          <span>{copy.load}</span>
          <small>{embed.provider === "x" ? `@${embed.user} · x.com` : "youtube.com"}</small>
        </button>
      )}
      <a className="markdown-embed__source" href={embed.url} rel="noopener noreferrer" target="_blank">
        {copy.open}
      </a>
    </div>
  );
}
